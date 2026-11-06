import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { selectReusableCorePaths } from "./core-inventory.mjs";
import { validatePortabilityResult } from "./portability-result.mjs";
import {
  filesBelow,
  safeRelative,
  validateAuthority,
  validateExecutionEvidence,
} from "./release-evidence.mjs";

const expected = {
  version: 1,
  policy: { node: ">=24.22.1 <25", git: ">=2.48.0" },
  stack: {
    node: "24.22.1",
    pnpm: "11.24.0",
    react: "19.2.8",
    vite: "6.4.3",
    vitest: "3.2.7",
    coverageV8: "3.2.7",
    playwright: "1.62.1",
  },
  cells: [
    {
      id: "linux-x64-chromium",
      runner: "ubuntu-24.04",
      platform: "linux",
      arch: "x64",
      browser: "chromium",
      scope: "complete",
      targets: ["crm", "work-orders"],
    },
    {
      id: "darwin-arm64-chromium",
      runner: "macos-15",
      platform: "darwin",
      arch: "arm64",
      browser: "chromium",
      scope: "complete",
      targets: ["crm", "work-orders"],
    },
  ],
};
const requireCondition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const freeze = (value) => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const collected = new WeakSet();
export const validateCompatibilityDeclaration = (value) => {
  requireCondition(
    isDeepStrictEqual(value, expected),
    "Unsupported compatibility declaration: require exactly the two pinned complete candidate cells and known keys",
  );
  return value;
};
const run = (root, command, args) => {
  const argv =
    command === "git"
      ? [
          "--no-pager",
          "--no-lazy-fetch",
          "--no-replace-objects",
          ...(args[0] === "status" ? ["-c", "core.fsmonitor=false"] : []),
          ...args,
        ]
      : args;
  const result = spawnSync(command, argv, {
    cwd: root,
    env: {
      ...process.env,
      COREPACK_ENABLE_NETWORK: "0",
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      npm_config_manage_package_manager_versions: "false",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_NO_LAZY_FETCH: "1",
      GIT_TERMINAL_PROMPT: "0",
    },
    encoding: "utf8",
    shell: false,
    timeout: 10000,
    maxBuffer: 1048576,
  });
  requireCondition(
    !result.error && result.status === 0,
    `Compatibility read-only probe failed: ${command}`,
  );
  return result.stdout.trim();
};
const coreInventory = (root) => {
  const walk = (directory, prefix = "") =>
    readdirSync(path.join(root, directory, prefix), { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((entry) => {
        const relative = path.posix.join(prefix, entry.name);
        requireCondition(!entry.isSymbolicLink(), "Reusable core contains a symlink");
        return entry.isDirectory() ? walk(directory, relative) : entry.isFile() ? [relative] : [];
      });
  const files = selectReusableCorePaths(
    ["tools/impact", "tools/proofline"].flatMap((directory) =>
      walk(directory).map((file) => `${directory}/${file}`),
    ),
  );
  requireCondition(files.length > 0, "Missing reusable core inventory");
  return Object.fromEntries(files.map((file) => [file, hash(path.join(root, file))]));
};
const runtimeRecords = (directory, runtime) => {
  filesBelow(directory);
  const entries = readFileSync(path.join(directory, "execution-index.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  requireCondition(entries.length > 0, "Missing native runtime evidence");
  for (const entry of entries) {
    safeRelative(entry.verification);
    const native = json(path.join(directory, entry.verification));
    const observed = native.metadata?.runtime;
    requireCondition(
      observed &&
        Object.keys(observed).sort().join() === "arch,execPath,nodeVersion,platform" &&
        observed.nodeVersion === runtime.nodeVersion &&
        observed.platform === runtime.platform &&
        observed.arch === runtime.arch &&
        observed.execPath === runtime.execPath,
      "Missing or mismatched native runtime evidence",
    );
  }
};
export const collectCompatibilityEvidence = async ({
  repositoryRoot = process.cwd(),
  declaration,
  cellId,
  authority,
  evidenceDirectory,
  portabilityRecord,
  portabilityArtifactRoot,
  mode = "local",
  fixtureProbes,
} = {}) => {
  validateCompatibilityDeclaration(declaration);
  requireCondition(
    ["local", "hosted", "fixture"].includes(mode),
    "Unsupported compatibility collection mode",
  );
  requireCondition(
    fixtureProbes === undefined || mode === "fixture",
    "Fixture probe seams cannot establish executed compatibility",
  );
  const readProbe = fixtureProbes ?? run;
  const cell = declaration.cells.find((item) => item.id === cellId);
  requireCondition(cell, "Unknown compatibility candidate cell");
  validateAuthority(authority);
  requireCondition(
    typeof evidenceDirectory === "string" &&
      path.isAbsolute(evidenceDirectory) &&
      typeof portabilityArtifactRoot === "string" &&
      path.isAbsolute(portabilityArtifactRoot),
    "Missing absolute native and independent artifact roots",
  );
  const root = realpathSync(repositoryRoot);
  const sourceCommit = readProbe(root, "git", ["rev-parse", "HEAD"]);
  requireCondition(sourceCommit === authority.sourceCommit, "Stale compatibility source revision");
  requireCondition(
    readProbe(root, "git", ["status", "--porcelain", "--untracked-files=normal"]) === "",
    "Compatibility collection requires clean committed source",
  );
  const runtime = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    execPath: process.execPath,
  };
  requireCondition(
    runtime.platform === cell.platform &&
      runtime.arch === cell.arch &&
      runtime.nodeVersion === `v${declaration.stack.node}`,
    "Executing runtime differs from candidate cell",
  );
  const require = createRequire(path.join(root, "package.json"));
  const packages = {
    react: "react",
    vite: "vite",
    vitest: "vitest",
    coverageV8: "@vitest/coverage-v8",
    playwright: "@playwright/test",
  };
  const stack = { node: process.versions.node, pnpm: readProbe(root, "pnpm", ["--version"]) };
  for (const [key, name] of Object.entries(packages))
    stack[key] = json(require.resolve(`${name}/package.json`)).version;
  requireCondition(
    isDeepStrictEqual(stack, declaration.stack),
    "Installed runtime/dependency tuple differs from pinned stack",
  );
  const git = readProbe(root, "git", ["--version"]);
  const version = /^git version (\d+)\.(\d+)\.(\d+)/.exec(git);
  requireCondition(
    version && (Number(version[1]) > 2 || (Number(version[1]) === 2 && Number(version[2]) >= 48)),
    "Git version is below the declared minimum",
  );
  const manifest = json(path.join(root, "proofline.harness.json"));
  const native = validateExecutionEvidence({ directory: evidenceDirectory, authority, manifest });
  runtimeRecords(evidenceDirectory, runtime);
  requireCondition(
    portabilityRecord?.dependencyMode === "independent",
    "Compatibility requires independent work-orders installation evidence",
  );
  validatePortabilityResult(portabilityRecord, {
    artifactRoot: portabilityArtifactRoot,
    checkLogs: false,
    authority,
  });
  runtimeRecords(path.join(portabilityArtifactRoot, "artifacts/proofline"), runtime);
  requireCondition(
    portabilityRecord.compatibility.node === runtime.nodeVersion &&
      portabilityRecord.compatibility.platform === `${runtime.platform}-${runtime.arch}` &&
      ["react", "vite", "vitest", "playwright"].every(
        (key) => portabilityRecord.compatibility[key] === stack[key],
      ),
    "Work-orders runtime/dependency tuple differs from candidate",
  );
  const coreHashes = coreInventory(root);
  requireCondition(
    isDeepStrictEqual(coreHashes, portabilityRecord.coreHashes),
    "Copied core hash inventory differs from immutable source",
  );
  const inventory = (directory) =>
    Object.fromEntries(
      filesBelow(directory).map((file) => [file, hash(path.join(directory, file))]),
    );
  const receipt = freeze({
    version: 1,
    kind: "compatibility-observation",
    cellId,
    mode,
    observation: mode === "fixture" ? "fixture" : "executed-local",
    hostedProvenance: "not-verified-by-collector",
    sourceCommit,
    authority: { ...authority },
    runtime,
    stack,
    git,
    coreHashes,
    native,
    artifacts: {
      nativeRoot: evidenceDirectory,
      nativeHashes: inventory(evidenceDirectory),
      portabilityRoot: portabilityArtifactRoot,
      portabilityHashes: inventory(portabilityArtifactRoot),
    },
    portabilityRecordSha256: createHash("sha256")
      .update(JSON.stringify(portabilityRecord))
      .digest("hex"),
    limitation:
      "Supplemental observation; release authority and actual hosted job provenance require independent verification.",
  });
  collected.add(receipt);
  return receipt;
};
export const summarizeCompatibility = ({ declaration, evidence = [] }) => {
  validateCompatibilityDeclaration(declaration);
  requireCondition(
    Array.isArray(evidence) && evidence.every((item) => collected.has(item)),
    "Only freshly validated collector receipts can be summarized; persisted or summary-only receipts require recollection",
  );
  requireCondition(
    new Set(
      evidence.map((item) =>
        JSON.stringify([item.sourceCommit, item.authority.repository, item.authority.workflow]),
      ),
    ).size <= 1,
    "Compatibility receipts refer to different source or repository authority",
  );
  requireCondition(
    new Set(evidence.map((item) => item.cellId)).size === evidence.length,
    "Duplicate compatibility receipts",
  );
  return {
    version: 1,
    sourceCommit: evidence[0]?.sourceCommit ?? null,
    cells: declaration.cells.map((cell) => {
      const receipt = evidence.find((item) => item.cellId === cell.id);
      return {
        ...cell,
        status: receipt?.observation === "executed-local" ? "executed-local" : "not-observed",
        observation: receipt ?? null,
      };
    }),
    limitation: "Candidate declarations are not execution or hosted provenance evidence.",
  };
};
export const parseCompatibilityOptions = (args) => {
  const names = {
    "--cell": "cellId",
    "--authority": "authorityFile",
    "--native": "evidenceDirectory",
    "--portability": "portabilityFile",
    "--portability-root": "portabilityArtifactRoot",
    "--mode": "mode",
  };
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const key = names[args[index]];
    requireCondition(
      key && !Object.hasOwn(options, key) && args[index + 1] && !args[index + 1].startsWith("--"),
      "Unknown, duplicate or incomplete compatibility option",
    );
    options[key] = args[++index];
  }
  requireCondition(
    options.cellId && options.authorityFile && options.evidenceDirectory && options.portabilityFile,
    "Required options: --cell --authority --native --portability",
  );
  return options;
};
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseCompatibilityOptions(process.argv.slice(2));
    const portabilityRecord = json(path.resolve(options.portabilityFile));
    const receipt = await collectCompatibilityEvidence({
      ...options,
      declaration: json(path.resolve("proofline.compatibility.json")),
      authority: json(path.resolve(options.authorityFile)),
      evidenceDirectory: path.resolve(options.evidenceDirectory),
      portabilityRecord,
      portabilityArtifactRoot: path.resolve(
        options.portabilityArtifactRoot ?? portabilityRecord.artifacts,
      ),
    });
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Proofline compatibility: ${error.message}\n`);
    process.exitCode = 1;
  }
}
