import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync, type Stats, writeFileSync } from "node:fs";
import path from "node:path";

const executeGit = (cwd: string, args: string[], input?: Buffer) =>
  execFileSync("git", args, {
    cwd,
    input,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Proofline Fixture",
      GIT_AUTHOR_EMAIL: "proofline@example.invalid",
      GIT_COMMITTER_NAME: "Proofline Fixture",
      GIT_COMMITTER_EMAIL: "proofline@example.invalid",
    },
  });

export const runFixtureGit = (cwd: string, args: string[]) =>
  executeGit(cwd, args).toString("utf8").trim();

export const initializeGitFixture = (cwd: string) => runFixtureGit(cwd, ["init", "-q"]);

type FixtureEntry = { path: string; mode: number; oid: string };
type FixtureTree = {
  directories: Map<string, FixtureTree>;
  files: Map<string, FixtureEntry>;
};

const tree = (): FixtureTree => ({ directories: new Map(), files: new Map() });

const writeTree = (cwd: string, root: FixtureTree): string => {
  const entries: string[] = [];
  for (const [name, entry] of root.files)
    entries.push(`${entry.mode.toString(8)} blob ${entry.oid}\t${name}\0`);
  for (const [name, directory] of root.directories)
    entries.push(`040000 tree ${writeTree(cwd, directory)}\t${name}\0`);
  return executeGit(cwd, ["mktree", "-z"], Buffer.from(entries.join("")))
    .toString("utf8")
    .trim();
};

const writeIndex = (cwd: string, entries: FixtureEntry[]) => {
  const header = Buffer.alloc(12);
  header.write("DIRC");
  header.writeUInt32BE(2, 4);
  header.writeUInt32BE(entries.length, 8);
  const records = entries.map((entry) => {
    if (!/^[a-f0-9]{40}$/.test(entry.oid))
      throw new Error("Git fixtures require SHA-1 object IDs for their v2 index.");
    const name = Buffer.from(entry.path);
    // Zero stat fields force readers to compare content without using a cached file stamp.
    // Each v2 entry includes a NUL path terminator and is padded to eight bytes.
    const record = Buffer.alloc(Math.ceil((62 + name.length + 1) / 8) * 8);
    record.writeUInt32BE(entry.mode, 24);
    Buffer.from(entry.oid, "hex").copy(record, 40);
    record.writeUInt16BE(Math.min(name.length, 0xfff), 60);
    name.copy(record, 62);
    return record;
  });
  const content = Buffer.concat([header, ...records]);
  writeFileSync(
    path.join(cwd, ".git/index"),
    Buffer.concat([content, createHash("sha1").update(content).digest()]),
  );
};

export const commitGitFixture = (cwd: string, message: string): string => {
  const files = executeGit(cwd, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const entries: FixtureEntry[] = [];
  const root = tree();
  for (const file of new Set(files)) {
    const absolute = path.join(cwd, file);
    let stat: Stats;
    try {
      stat = lstatSync(absolute);
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) continue;
      throw error;
    }
    if (!stat.isFile() && !stat.isSymbolicLink())
      throw new Error(`Unsupported Git fixture entry: ${file}`);
    const bytes = stat.isSymbolicLink()
      ? readlinkSync(absolute, { encoding: "buffer" })
      : readFileSync(absolute);
    const entry = {
      path: file,
      mode: stat.isSymbolicLink() ? 0o120000 : stat.mode & 0o111 ? 0o100755 : 0o100644,
      oid: executeGit(cwd, ["hash-object", "-w", "--stdin", "--no-filters"], bytes)
        .toString("utf8")
        .trim(),
    };
    entries.push(entry);
    const segments = file.split("/");
    const name = segments.pop();
    if (!name) throw new Error(`Invalid Git fixture entry: ${file}`);
    let directory = root;
    for (const segment of segments) {
      let nested = directory.directories.get(segment);
      if (!nested) {
        nested = tree();
        directory.directories.set(segment, nested);
      }
      directory = nested;
    }
    directory.files.set(name, entry);
  }
  entries.sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
  const rootOid = writeTree(cwd, root);
  if (!/^[a-f0-9]{40}$/.test(rootOid))
    throw new Error("Git fixtures require SHA-1 object IDs for their v2 index.");
  let parent: string | undefined;
  try {
    parent = runFixtureGit(cwd, ["rev-parse", "--verify", "HEAD"]);
  } catch {
    // A freshly initialized fixture has an unborn HEAD.
  }
  const commit = runFixtureGit(cwd, [
    "commit-tree",
    rootOid,
    ...(parent ? ["-p", parent] : []),
    "-m",
    message,
  ]);
  runFixtureGit(cwd, ["update-ref", "HEAD", commit]);
  writeIndex(cwd, entries);
  return commit;
};
