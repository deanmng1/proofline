import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { requireCondition, safeRelative } from "./release-evidence.mjs";

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
// GitHub artifact ZIPs use ordinary stored/deflated entries. ZIP64, encrypted,
// multi-disk and special files are deliberately unsupported and fail closed.
export function extractReleaseZip(bytes, directory) {
  requireCondition(Buffer.isBuffer(bytes) && bytes.length >= 22, "Malformed release archive");
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--)
    if (
      bytes.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length
    ) {
      end = offset;
      break;
    }
  requireCondition(
    end >= 0 && bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0,
    "Unsupported release archive disks",
  );
  const count = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  requireCondition(
    count > 0 &&
      count < 65535 &&
      count === bytes.readUInt16LE(end + 8) &&
      centralOffset + centralSize === end,
    "Malformed release archive directory",
  );
  const members = [];
  const names = new Set();
  let cursor = centralOffset;
  let total = 0;
  for (let index = 0; index < count; index++) {
    requireCondition(
      cursor + 46 <= end && bytes.readUInt32LE(cursor) === 0x02014b50,
      "Malformed release archive member",
    );
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16);
    const compressed = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const disk = bytes.readUInt16LE(cursor + 34);
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16;
    const local = bytes.readUInt32LE(cursor + 42);
    requireCondition(
      cursor + 46 + nameLength + extraLength + commentLength <= end &&
        disk === 0 &&
        !(flags & 1) &&
        [0, 8].includes(method) &&
        compressed !== 0xffffffff &&
        size !== 0xffffffff &&
        local !== 0xffffffff,
      "Unsupported release archive encoding",
    );
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString("utf8");
    const directoryEntry = name.endsWith("/");
    const relative = safeRelative(directoryEntry ? name.slice(0, -1) : name);
    requireCondition(
      Buffer.from(name, "utf8").equals(nameBytes) &&
        !names.has(relative) &&
        [0, 0o100000, 0o040000].includes(mode & 0o170000) &&
        (!(mode & 0o170000) || directoryEntry === ((mode & 0o170000) === 0o040000)),
      "Unsafe archive path or symlink",
    );
    names.add(relative);
    requireCondition(
      local + 30 <= centralOffset &&
        bytes.readUInt32LE(local) === 0x04034b50 &&
        bytes.readUInt16LE(local + 6) === flags &&
        bytes.readUInt16LE(local + 8) === method,
      "Malformed release archive local header",
    );
    const localNameLength = bytes.readUInt16LE(local + 26);
    const localExtraLength = bytes.readUInt16LE(local + 28);
    const data = local + 30 + localNameLength + localExtraLength;
    requireCondition(
      bytes.subarray(local + 30, local + 30 + localNameLength).equals(nameBytes) &&
        data + compressed <= centralOffset,
      "Substituted archive path or bounds",
    );
    if (!(flags & 8))
      requireCondition(
        bytes.readUInt32LE(local + 14) === crc &&
          bytes.readUInt32LE(local + 18) === compressed &&
          bytes.readUInt32LE(local + 22) === size,
        "Substituted archive local sizes",
      );
    total += size;
    requireCondition(
      total <= 1073741824 && (!directoryEntry || size === 0),
      "Release archive exceeds limits",
    );
    members.push({ relative, directoryEntry, data, compressed, size, method, crc, local });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  requireCondition(cursor === end, "Extra release archive directory bytes");
  const ordered = [...members].sort((left, right) => left.local - right.local);
  for (let index = 1; index < ordered.length; index++)
    requireCondition(
      ordered[index].local >= ordered[index - 1].data + ordered[index - 1].compressed,
      "Overlapping release archive members",
    );
  for (const member of members) {
    const destination = path.join(directory, member.relative);
    if (member.directoryEntry) {
      mkdirSync(destination, { recursive: true });
      continue;
    }
    const compressed = bytes.subarray(member.data, member.data + member.compressed);
    const data =
      member.method === 0
        ? compressed
        : inflateRawSync(compressed, { maxOutputLength: Math.max(1, member.size) });
    requireCondition(
      data.length === member.size && crc32(data) === member.crc,
      "Corrupt release archive content",
    );
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, data, { flag: "wx" });
  }
}
