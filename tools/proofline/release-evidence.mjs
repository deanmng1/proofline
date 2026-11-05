import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseDiscovery, reconcileExecution, verifyAggregate } from "./execution-verification.mjs";
import { validatePortabilityResult } from "./portability-result.mjs";

export const EXECUTION_GATES = [
  "unit",
  "browser",
  "browserScenario",
  "browserScenarioShard1",
  "browserScenarioShard2",
];
export const REQUIRED_RELEASE_GATES = [
  "lint",
  "typecheck",
  "manifest",
  "production",
  "record",
  "impactPreview",
  "impact",
  ...EXECUTION_GATES,
  "coverage",
  "coverageCheck",
  "whitespace",
  "portability",
];
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}
export function safeRelative(value) {
  requireCondition(
    typeof value === "string" &&
      value.length > 0 &&
      !value.includes("\\") &&
      !value.includes("\0") &&
      !value.startsWith("/") &&
      !/^[A-Za-z]:/.test(value) &&
      value.split("/").every((part) => part && part !== "." && part !== ".."),
    `Unsafe release path: ${value}`,
  );
  return value;
}
export function filesBelow(directory, prefix = "") {
  requireCondition(lstatSync(directory).isDirectory(), `Missing release directory ${directory}`);
  const files = [];
  for (const entry of readdirSync(directory).sort()) {
    const relative = safeRelative(prefix ? `${prefix}/${entry}` : entry);
    const file = path.join(directory, entry);
    const stat = lstatSync(file);
    requireCondition(!stat.isSymbolicLink(), `Release symlink forbidden: ${relative}`);
    if (stat.isDirectory()) files.push(...filesBelow(file, relative));
    else {
      requireCondition(stat.isFile() && stat.nlink === 1, `Unsafe release file: ${relative}`);
      files.push(relative);
    }
  }
  return files;
}
export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
export function validateAuthority(authority) {
  requireCondition(
    authority &&
      /^[^/\s]+\/[^/\s]+$/.test(authority.repository) &&
      /^[a-f0-9]{40}$/.test(authority.sourceCommit) &&
      authority.workflow === ".github/workflows/verify.yml" &&
      /^[1-9]\d*$/.test(authority.runId) &&
      /^[1-9]\d*$/.test(authority.runAttempt) &&
      authority.sessionId === `${authority.runId}-${authority.runAttempt}`,
    "Invalid release authority",
  );
}
const identity = (value) => JSON.stringify([value.file, value.title, value.project || ""]);
function exactIdentities(values, label) {
  requireCondition(Array.isArray(values), `Missing ${label} identities`);
  const result = values.map((value) => {
    requireCondition(
      value &&
        typeof value.file === "string" &&
        typeof value.title === "string" &&
        (value.project === undefined || typeof value.project === "string"),
      `Invalid ${label} identity`,
    );
    safeRelative(value.file);
    return identity(value);
  });
  requireCondition(new Set(result).size === result.length, `Duplicate ${label} identity`);
  return result.sort();
}
function sameIdentities(left, right, label) {
  requireCondition(
    JSON.stringify(exactIdentities(left, label)) === JSON.stringify(exactIdentities(right, label)),
    `Incomplete ${label} identities`,
  );
}
function requiredBindings(manifest, commandKey) {
  const identities = new Map();
  for (const owner of manifest.ownership || [])
    for (const binding of owner.testBindings || [])
      if (binding.runner === (commandKey === "unit" ? "vitest" : "playwright")) {
        const projects = binding.projects || [binding.project];
        for (const project of projects) {
          const value = { file: binding.file, title: binding.title, project };
          identities.set(identity(value), value);
        }
      }
  return [...identities.values()];
}
function runnerOption(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index++)
    if (args[index] === name) values.push(args[++index]);
    else if (args[index].startsWith(`${name}=`)) values.push(args[index].slice(name.length + 1));
  requireCondition(values.length <= 1, "Duplicate native applicability option");
  return values[0];
}
function validateNativeBrowserApplicability(record, discovery, runtime, gate) {
  const left = discovery?.config;
  const right = runtime?.config;
  requireCondition(
    left &&
      right &&
      Number.isSafeInteger(left.workers) &&
      left.workers > 0 &&
      left.workers === right.workers &&
      left.rootDir === right.rootDir,
    "Missing or contradictory native worker applicability",
  );
  requireCondition(
    JSON.stringify(right.argv) === JSON.stringify(record.argv) &&
      JSON.stringify(left.argv) ===
        JSON.stringify([
          ...record.argv.slice(0, 2),
          ...record.requestedArgs,
          "--list",
          "--reporter=json",
        ]),
    "Contradictory native execution arguments",
  );
  const workers = runnerOption(record.requestedArgs, "--workers");
  requireCondition(
    typeof record.metadata.workers === "string" &&
      /^[1-9]\d*$/.test(record.metadata.workers) &&
      Number(record.metadata.workers) === right.workers &&
      (workers === undefined || (/^[1-9]\d*$/.test(workers) && Number(workers) === right.workers)),
    "Contradictory worker argument or metadata",
  );
  const shard = runnerOption(record.requestedArgs, "--shard");
  let expectedShard = null;
  if (shard !== undefined) {
    requireCondition(/^[1-9]\d*\/[1-9]\d*$/.test(shard), "Invalid native shard option");
    const [current, total] = shard.split("/").map(Number);
    requireCondition(current <= total, "Invalid native shard range");
    expectedShard = { current, total };
  }
  const sameShard = (value) =>
    expectedShard === null
      ? value === null
      : value &&
        value.current === expectedShard.current &&
        value.total === expectedShard.total &&
        Object.keys(value).length === 2;
  requireCondition(
    sameShard(left.shard) && sameShard(right.shard) && sameShard(record.metadata.shard),
    "Missing or contradictory native shard applicability",
  );
  if (gate === "browserScenario")
    requireCondition(
      right.metadata?.actualWorkers >= 2,
      "Multiworker gate did not use multiple native workers",
    );
}
export function validateExecutionEvidence({ directory, authority, manifest }) {
  validateAuthority(authority);
  filesBelow(directory);
  const text = readFileSync(path.join(directory, "execution-index.jsonl"), "utf8");
  requireCondition(text.endsWith("\n") && !text.endsWith("\n\n"), "Malformed execution index");
  const entries = text
    .slice(0, -1)
    .split("\n")
    .map((line) => JSON.parse(line));
  const byId = new Map();
  const byPath = new Map();
  for (const entry of entries) {
    requireCondition(
      entry.version === 1 &&
        typeof entry.invocationId === "string" &&
        !byId.has(entry.invocationId) &&
        !byPath.has(entry.verification),
      "Ambiguous execution index",
    );
    safeRelative(entry.verification);
    requireCondition(
      entry.verification === `runs/${entry.invocationId}/verification.json`,
      "Invalid invocation reference",
    );
    requireCondition(
      /^[a-f0-9]{64}$/.test(entry.sha256) &&
        sha256(readFileSync(path.join(directory, entry.verification))) === entry.sha256,
      "Substituted execution evidence",
    );
    const record = readJson(path.join(directory, entry.verification));
    requireCondition(record.invocationId === entry.invocationId, "Wrong invocation identity");
    byId.set(entry.invocationId, { entry, record });
    byPath.set(entry.verification, entry);
  }
  function validateRecord(item, gate, executionId, visiting = new Set()) {
    const { entry, record } = item;
    requireCondition(!visiting.has(entry.invocationId), "Cyclic aggregate evidence");
    visiting.add(entry.invocationId);
    requireCondition(
      record.version === 1 &&
        record.sourceCommit === authority.sourceCommit &&
        record.repository === authority.repository &&
        record.workflow === `${authority.repository}/${authority.workflow}@refs/heads/main` &&
        record.sessionId === authority.sessionId &&
        String(record.ciRunId) === authority.runId &&
        String(record.ciRunAttempt) === authority.runAttempt &&
        record.gateKey === gate &&
        record.gateExecutionId === executionId,
      "Stale or wrong-run execution evidence",
    );
    requireCondition(
      record.exitCode === 0 &&
        record.outcome === "passed" &&
        Array.isArray(record.errors) &&
        record.errors.length === 0 &&
        Array.isArray(record.argv) &&
        record.argv.length > 0 &&
        typeof record.cwd === "string",
      "Failed execution evidence",
    );
    requireCondition(
      ["full", "subset", "selected"].includes(record.scope),
      "Invalid execution scope",
    );
    requireCondition(
      Array.isArray(record.expected) &&
        Array.isArray(record.observed) &&
        typeof record.repositoryRoot === "string",
      "Missing expected execution identities",
    );
    requireCondition(
      record.artifacts && typeof record.artifacts === "object",
      "Missing invocation artifacts",
    );
    for (const artifact of Object.values(record.artifacts)) {
      safeRelative(artifact);
      requireCondition(
        artifact.startsWith(`runs/${entry.invocationId}/`),
        "Cross-invocation native artifact substitution",
      );
      requireCondition(
        lstatSync(path.join(directory, artifact)).isFile(),
        "Missing invocation artifact",
      );
    }
    if (record.runner === "aggregate") {
      requireCondition(
        Array.isArray(record.children) && record.children.length > 0,
        "Missing aggregate children",
      );
      const childRecords = [];
      const seen = new Set();
      for (const reference of record.children) {
        requireCondition(!seen.has(reference.invocationId), "Duplicate aggregate child");
        seen.add(reference.invocationId);
        const child = byId.get(reference.invocationId);
        requireCondition(
          child &&
            child.entry.verification === reference.verification &&
            child.entry.sha256 === reference.sha256,
          "Missing or substituted aggregate child",
        );
        validateRecord(child, gate, executionId, new Set(visiting));
        childRecords.push(child.record);
      }
      requireCondition(
        record.expected.length > 0 &&
          verifyAggregate({ expected: record.expected, children: childRecords }).outcome ===
            "passed",
        "Incomplete aggregate identities",
      );
      sameIdentities(
        record.observed,
        childRecords.flatMap((child) => child.observed),
        "aggregate observed",
      );
      requireCondition(
        record.children.length === manifest.execution?.unitTargets?.length,
        "Incomplete aggregate targets",
      );
      for (const target of manifest.execution.unitTargets)
        requireCondition(
          childRecords.filter(
            (child) =>
              JSON.stringify(child.requestedArgs) === JSON.stringify(target.argv) &&
              child.cwd === path.resolve(record.repositoryRoot, target.cwd),
          ).length === 1,
          "Omitted or substituted unit target",
        );
    } else {
      requireCondition(
        ["vitest", "playwright"].includes(record.runner) &&
          typeof record.artifacts.nativeReport === "string" &&
          typeof record.artifacts.stdout === "string" &&
          typeof record.artifacts.stderr === "string",
        "Missing native execution artifacts",
      );
      if (record.runner === "vitest")
        requireCondition(
          typeof record.artifacts.nativeEvents === "string",
          "Missing native Vitest events",
        );
      requireCondition(
        typeof record.artifacts.discovery === "string",
        "Missing preexecution discovery",
      );
      const discoveryReport = readJson(path.join(directory, record.artifacts.discovery));
      const nativeReport = readJson(path.join(directory, record.artifacts.nativeReport));
      if (record.runner === "playwright")
        validateNativeBrowserApplicability(record, discoveryReport, nativeReport, gate);
      const discovered = parseDiscovery(record.runner, discoveryReport, record.repositoryRoot);
      requireCondition(Array.isArray(record.requestedArgs), "Missing requested runner arguments");
      const nativePath = path.join(
        record.repositoryRoot,
        "artifacts/proofline",
        record.artifacts.nativeReport,
      );
      const expectedCli = path.join(
        record.repositoryRoot,
        record.runner === "vitest"
          ? "tools/proofline/vitest-execution.mjs"
          : "node_modules/@playwright/test/cli.js",
      );
      const expectedTail =
        record.runner === "vitest"
          ? [
              "--reporter=default",
              "--reporter=json",
              `--reporter=${path.join(record.repositoryRoot, "tools/proofline/vitest-native-reporter.mjs")}`,
              `--outputFile.json=${nativePath}`,
            ]
          : [
              "--reporter=list,json,html",
              `--output=${path.join(record.repositoryRoot, "artifacts/proofline/runs", entry.invocationId, "test-results")}`,
            ];
      requireCondition(
        record.argv[1] === expectedCli &&
          JSON.stringify(record.argv.slice(2)) ===
            JSON.stringify([...record.requestedArgs, ...expectedTail]),
        "Substituted instrumented runner arguments",
      );
      requireCondition(
        JSON.stringify([...new Set(discovered.map((value) => value.project))].sort()) ===
          JSON.stringify([...record.metadata.projects].sort()),
        "Substituted native project applicability",
      );
      const bindings = requiredBindings(manifest, record.runner === "vitest" ? "unit" : "browser");
      const applicable =
        gate === "unit" || gate === "browser"
          ? discovered.filter((value) =>
              bindings.some(
                (binding) => binding.file === value.file && binding.title === value.title,
              ),
            )
          : discovered;
      sameIdentities(record.expected, applicable, "preexecution applicability");
      const result = reconcileExecution({
        runner: record.runner,
        expected: record.expected,
        nativeReport,
        nativeEvents:
          record.runner === "vitest"
            ? readJson(path.join(directory, record.artifacts.nativeEvents))
            : undefined,
        root: record.repositoryRoot,
        exitCode: record.exitCode,
        allowEmpty:
          record.runner === "vitest" &&
          record.requestedArgs?.includes("--passWithNoTests") &&
          !record.expected.length,
      });
      requireCondition(
        result.outcome === "passed",
        "Native execution evidence failed reconciliation",
      );
      const outcomes = (values) =>
        values
          .map((value) =>
            JSON.stringify([
              identity(value),
              value.status,
              value.expectedStatus,
              value.retry,
              value.repeats,
            ]),
          )
          .sort();
      requireCondition(
        JSON.stringify(outcomes(record.observed)) === JSON.stringify(outcomes(result.observed)),
        "Substituted native execution outcomes",
      );
    }
  }
  const summaries = {};
  for (const gate of EXECUTION_GATES) {
    const candidates = [...byId.values()].filter(
      (item) => item.record.gateKey === gate && item.record.gateComplete === true,
    );
    requireCondition(candidates.length === 1, `Missing or ambiguous complete ${gate} gate`);
    const item = candidates[0];
    const record = item.record;
    requireCondition(
      record.gateExecutionId === `${authority.sessionId}-${gate}`,
      "Missing gate execution identity",
    );
    validateRecord(item, gate, record.gateExecutionId);
    requireCondition(
      record.scope === (["unit", "browser"].includes(gate) ? "full" : "subset"),
      `Subset substituted for ${gate}`,
    );
    if (gate === "unit")
      requireCondition(record.runner === "aggregate", "Missing full unit aggregate");
    else
      requireCondition(
        record.runner === "playwright" && record.metadata?.projects?.includes("chromium"),
        "Missing Chromium applicability",
      );
    if (gate === "browserScenario")
      requireCondition(
        Number(record.metadata?.workers) >= 2 && !record.metadata?.shard,
        "Missing multiworker gate",
      );
    if (gate.startsWith("browserScenarioShard"))
      requireCondition(
        record.metadata?.shard?.current === (gate.endsWith("1") ? 1 : 2) &&
          record.metadata?.shard?.total === 2,
        "Wrong shard applicability",
      );
    if (["unit", "browser"].includes(gate)) {
      const bindings = requiredBindings(manifest, gate);
      const mandatoryProjects =
        gate === "browser"
          ? record.metadata.projects.filter(
              (project) => !(manifest.browser?.crossBrowserSmokeProjects || []).includes(project),
            )
          : [];
      requireCondition(
        bindings.length > 0 &&
          bindings.every((value) => {
            const projects =
              gate === "unit"
                ? [undefined]
                : value.project === undefined
                  ? mandatoryProjects
                  : [value.project];
            return (
              projects.length > 0 &&
              projects.every((project) =>
                record.expected.some(
                  (actual) =>
                    actual.file === value.file &&
                    actual.title === value.title &&
                    (project === undefined || actual.project === project),
                ),
              )
            );
          }),
        `Missing manifest-bound ${gate} execution`,
      );
    }
    const command = manifest.commands?.[gate];
    if (gate.startsWith("browserScenario")) {
      requireCondition(
        command &&
          Array.isArray(command.argv) &&
          command.argv.includes("playwright") &&
          JSON.stringify(command.argv.slice(command.argv.indexOf("playwright") + 1)) ===
            JSON.stringify(record.requestedArgs),
        `Wrong ${gate} command applicability`,
      );
    }
    if (gate === "browser")
      requireCondition(
        JSON.stringify(record.requestedArgs) === JSON.stringify(manifest.execution?.browserArgs),
        "Subset substituted for full browser command",
      );
    summaries[gate] = { ...item.entry, gateExecutionId: record.gateExecutionId };
  }
  return summaries;
}

export function validatePortabilityBundle({ directory, authority }) {
  filesBelow(directory);
  const record = readJson(path.join(directory, "latest.json"));
  requireCondition(
    record.version === 1 &&
      record.outcome === "passed" &&
      record.sourceCommit === authority.sourceCommit &&
      record.sessionId === authority.sessionId &&
      String(record.ciRunId) === authority.runId &&
      String(record.ciRunAttempt) === authority.runAttempt &&
      record.gateKey === "portability" &&
      record.gateExecutionId === `${authority.sessionId}-portability`,
    "Stale, failed or wrong-run portability evidence",
  );
  safeRelative(record.artifactDirectory);
  requireCondition(
    record.artifactDirectory.startsWith("artifacts/portability/"),
    "Unsafe portability artifact directory",
  );
  const artifactRoot = path.join(
    directory,
    record.artifactDirectory.slice("artifacts/portability/".length),
  );
  for (const [file, hash] of Object.entries(record.evidenceHashes || {})) {
    safeRelative(file);
    requireCondition(
      /^[a-f0-9]{64}$/.test(hash) && sha256(readFileSync(path.join(artifactRoot, file))) === hash,
      "Substituted portability evidence",
    );
  }
  validatePortabilityResult(record, { artifactRoot, checkLogs: false, authority });
  return {
    artifactDirectory: record.artifactDirectory,
    sha256: sha256(readFileSync(path.join(directory, "latest.json"))),
  };
}
