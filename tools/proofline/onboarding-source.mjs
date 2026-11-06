import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { selectReusableCorePaths } from "./core-inventory.mjs";

export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const fullSource = (value) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
export const safePath = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9_.@/-]+$/.test(value) &&
  !path.isAbsolute(value) &&
  value.split("/").every((part) => part && part !== "." && part !== ".." && part !== ".git");
export const assertPhysical = (absolute) => {
  if (
    typeof absolute !== "string" ||
    !path.isAbsolute(absolute) ||
    absolute !== path.resolve(absolute)
  )
    throw new Error("Use a normalized absolute path");
  const parts = absolute.split(path.sep).filter(Boolean);
  let current = path.parse(absolute).root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new Error(`Symlink path is unsafe: ${current}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return absolute;
};
export const fileHash = (file) => {
  assertPhysical(file);
  if (!existsSync(file)) return null;
  if (!lstatSync(file).isFile()) throw new Error(`Expected regular file: ${file}`);
  return hash(readFileSync(file));
};
const configuration = {
  "core.hooksPath": "/dev/null",
  "commit.gpgSign": "false",
  "tag.gpgSign": "false",
  "core.pager": "",
  "core.fsmonitor": "false",
  "core.attributesFile": "/dev/null",
  "core.excludesFile": "/dev/null",
  "maintenance.auto": "false",
  "gc.auto": "0",
  "protocol.allow": "never",
};
const git = (root, args) => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_PAGER: "",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_CONFIG_COUNT: String(Object.keys(configuration).length),
    ...Object.fromEntries(
      Object.entries(configuration).flatMap(([key, value], index) => [
        [`GIT_CONFIG_KEY_${index}`, key],
        [`GIT_CONFIG_VALUE_${index}`, value],
      ]),
    ),
  });
  const result = spawnSync("git", args, {
    cwd: root,
    env,
    shell: false,
    timeout: 10000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(`Trusted source Git operation failed: ${args[0]}`);
  return result.stdout;
};
const walk = (root, prefix) => {
  const directory = path.join(root, prefix);
  assertPhysical(directory);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = `${prefix}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Symlink source entry: ${file}`);
    if (entry.isDirectory())
      return [
        "node_modules",
        ".git",
        "artifacts",
        "dist",
        "test-results",
        "playwright-report",
      ].includes(entry.name)
        ? []
        : walk(root, file);
    return entry.isFile() ? [file] : [];
  });
};
const templatePath = (file) =>
  file.startsWith("examples/work-orders/") &&
  !file
    .split("/")
    .some((part) =>
      ["node_modules", ".git", "artifacts", "dist", "test-results", "playwright-report"].includes(
        part,
      ),
    );
export const validateInventory = (inventory) => {
  if (
    !inventory ||
    Object.keys(inventory).sort().join() !== "core,schemaVersion,source,templates,version" ||
    inventory.schemaVersion !== 1 ||
    !fullSource(inventory.source) ||
    typeof inventory.version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(inventory.version)
  )
    throw new Error("Invalid source inventory");
  for (const [kind, entries] of [
    ["core", inventory.core],
    ["templates", inventory.templates],
  ]) {
    if (!Array.isArray(entries) || entries.length > 10000 || (kind === "core" && !entries.length))
      throw new Error("Invalid source inventory entries");
    let previous = "";
    for (const entry of entries) {
      if (
        !entry ||
        Object.keys(entry).sort().join() !== "path,sha256" ||
        !safePath(entry.path) ||
        entry.path <= previous ||
        !/^[a-f0-9]{64}$/.test(entry.sha256)
      )
        throw new Error("Invalid inventory path/hash order");
      previous = entry.path;
    }
    if (
      kind === "core" &&
      JSON.stringify(selectReusableCorePaths(entries.map((entry) => entry.path))) !==
        JSON.stringify(entries.map((entry) => entry.path))
    )
      throw new Error("Invalid core inventory paths");
    if (
      kind === "templates" &&
      entries.some(
        (entry) =>
          entry.path.startsWith("tools/") ||
          entry.path === ".proofline-receipt.json" ||
          entry.path === ".proofline-installing.json",
      )
    )
      throw new Error("Invalid template inventory path");
  }
  return inventory;
};
export const collectSourceInventory = ({
  repositoryRoot,
  source,
  starter = false,
  clean = true,
}) => {
  assertPhysical(repositoryRoot);
  if (!fullSource(source)) throw new Error("Source must be a full 40-character commit SHA");
  if (
    git(repositoryRoot, ["rev-parse", "--verify", `${source}^{commit}`])
      .toString()
      .trim() !== source
  )
    throw new Error("Source commit identity mismatch");
  const rows = git(repositoryRoot, ["ls-tree", "-r", "-z", source])
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((row) => {
      const match = /^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/.exec(row);
      if (!match) throw new Error("Ambiguous source Git inventory");
      return { mode: match[1], type: match[2], path: match[4] };
    });
  const selected = selectReusableCorePaths(rows.map((row) => row.path));
  const templates = starter
    ? rows
        .filter((row) => templatePath(row.path))
        .map((row) => row.path)
        .sort()
    : [];
  const files = [...selected, ...templates, "package.json"];
  const contents = new Map();
  for (const file of files) {
    if (!safePath(file)) throw new Error("Unsafe source inventory path");
    const entry = rows.find((row) => row.path === file);
    if (entry?.type !== "blob" || !["100644", "100755"].includes(entry.mode))
      throw new Error(`Source entry must be a regular file: ${file}`);
    const bytes = git(repositoryRoot, ["cat-file", "blob", `${source}:${file}`]);
    if (clean && fileHash(path.join(repositoryRoot, file)) !== hash(bytes))
      throw new Error(`Dirty source bytes changed: ${file}`);
    contents.set(file, bytes);
  }
  if (clean) {
    const actualCore = selectReusableCorePaths([
      ...walk(repositoryRoot, "tools/impact"),
      ...walk(repositoryRoot, "tools/proofline"),
    ]);
    if (JSON.stringify(selected) !== JSON.stringify(actualCore))
      throw new Error("Dirty/untracked reusable core inventory");
    if (
      starter &&
      JSON.stringify(templates) !==
        JSON.stringify(walk(repositoryRoot, "examples/work-orders").filter(templatePath).sort())
    )
      throw new Error("Dirty/untracked starter inventory");
  }
  const version = JSON.parse(contents.get("package.json").toString()).version;
  const inventory = validateInventory({
    schemaVersion: 1,
    source,
    version,
    core: selected.map((file) => ({ path: file, sha256: hash(contents.get(file)) })),
    templates: templates.map((file) => ({
      path: file.slice("examples/work-orders/".length),
      sha256: hash(contents.get(file)),
    })),
  });
  if (
    starter &&
    !["package.json", "proofline.harness.json", "test-impact/rules.json"].every((file) =>
      inventory.templates.some((entry) => entry.path === file),
    )
  )
    throw new Error("Required starter templates missing");
  return { inventory, contents };
};
