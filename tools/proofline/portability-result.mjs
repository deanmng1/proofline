import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  parseDiscovery,
  reconcileExecution,
  requiredBindings,
  verifyAggregate,
} from "./execution-verification.mjs";

const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
export const requiredPortabilityEvidence = [
  "artifacts/harness/validation.json",
  "artifacts/impact/discovery.json",
  "artifacts/impact/selection.json",
  "artifacts/coverage/ratchet.json",
  "artifacts/record/check.json",
  "artifacts/proofline/execution-index.jsonl",
  "dist/work-orders/.proofline/modules.json",
  "dist/work-orders/.vite/manifest.json",
  "target/proofline.harness.json",
];
export const requiredPortabilityGates = [
  "static",
  "typecheck",
  "discovery",
  "selected",
  "unit",
  "browser",
  "coverage",
  "coverageCheck",
  "recordCheck",
  "production",
];
export const validatePortabilityResult = (
  record,
  { artifactRoot = record?.artifacts, checkLogs = true, authority } = {},
) => {
  if (
    record?.version !== 1 ||
    record.outcome !== "passed" ||
    !path.isAbsolute(record.target ?? "") ||
    !record.compatibility ||
    !/^v\d+\.\d+\.\d+$/.test(record.compatibility.node ?? "") ||
    !["vite", "vitest", "react", "playwright"].every((key) =>
      /^\d+\.\d+\.\d+/.test(record.compatibility[key] ?? ""),
    ) ||
    record.compatibility.browser !== "chromium" ||
    !record.coreHashes ||
    Object.keys(record.coreHashes).length === 0 ||
    Object.values(record.coreHashes).some((hash) => !/^[a-f0-9]{64}$/.test(hash)) ||
    !Array.isArray(record.gates) ||
    record.gates.length !== requiredPortabilityGates.length ||
    new Set(record.gates.map((gate) => gate.key)).size !== record.gates.length ||
    !requiredPortabilityGates.every(
      (key) =>
        record.gates?.filter(
          (gate) => gate.key === key && gate.exitCode === 0 && typeof gate.log === "string",
        ).length === 1,
    ) ||
    !record.selection ||
    record.selection.fallback !== "none" ||
    record.selection.vitest !== 2 ||
    record.selection.playwright !== 4
  )
    throw new Error("Missing or unsupported portability evidence");
  if (
    !record.source ||
    ![record.source.base, record.source.head, record.source.verifiedHead].every((sha) =>
      /^[a-f0-9]{40}$/.test(sha),
    ) ||
    !path.isAbsolute(artifactRoot ?? "") ||
    !record.evidenceHashes ||
    Object.keys(record.evidenceHashes).length !== requiredPortabilityEvidence.length ||
    !requiredPortabilityEvidence.every(
      (file) =>
        record.evidenceHashes?.[file] &&
        existsSync(path.join(artifactRoot, file)) &&
        digest(path.join(artifactRoot, file)) === record.evidenceHashes[file],
    ) ||
    (checkLogs && record.gates.some((gate) => !existsSync(gate.log)))
  )
    throw new Error("Missing or changed retained target evidence");
  for (const file of [
    "artifacts/harness/validation.json",
    "artifacts/coverage/ratchet.json",
    "artifacts/record/check.json",
  ]) {
    const evidence = JSON.parse(readFileSync(path.join(artifactRoot, file), "utf8"));
    if (!Array.isArray(evidence.errors) || evidence.errors.length)
      throw new Error(`Failed target evidence ${file}`);
  }
  validateInstallationEvidence(record, artifactRoot);
  validateNativePortability(record, artifactRoot, authority);
  return record;
};

const requireCondition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const safeFile = (root, relative) => {
  requireCondition(
    typeof relative === "string" &&
      relative.length > 0 &&
      !path.isAbsolute(relative) &&
      !relative.includes("\\") &&
      !relative.split("/").some((part) => ["", ".", ".."].includes(part)),
    "Unsafe retained native artifact path",
  );
  const file = path.join(root, relative);
  const realRoot = realpathSync(root);
  requireCondition(
    !lstatSync(file).isSymbolicLink() && realpathSync(file).startsWith(`${realRoot}${path.sep}`),
    "Retained artifact escapes its root",
  );
  return file;
};
const validateInstallationEvidence = (record, artifactRoot) => {
  if (!Object.hasOwn(record, "dependencyMode")) {
    requireCondition(
      !["installation", "preparation", "setup"].some((key) => Object.hasOwn(record, key)),
      "Missing dependency mode for installation evidence",
    );
    return; // Historical v1 evidence predates explicit installation provenance.
  }
  requireCondition(
    ["reuse", "independent"].includes(record.dependencyMode),
    "Unsupported dependency mode",
  );
  const preparation = record.preparation;
  requireCondition(
    preparation?.dependencyDirectory === "node_modules" &&
      typeof preparation.hostLinked === "boolean" &&
      plainObject(preparation.resolvedPackages) &&
      Array.isArray(record.installation),
    "Incomplete dependency preparation evidence",
  );
  if (record.dependencyMode === "reuse") {
    requireCondition(
      preparation.hostLinked &&
        Object.keys(preparation.resolvedPackages).length === 0 &&
        record.installation.length === 0 &&
        !Object.hasOwn(record, "setup"),
      "Offline reuse contains independent installation claims",
    );
    return;
  }
  requireCondition(
    !preparation.hostLinked &&
      ["vite", "vitest", "react", "@playwright/test", "zod"].every((key) =>
        Object.hasOwn(preparation.resolvedPackages, key),
      ) &&
      Object.values(preparation.resolvedPackages).every(
        (relative) =>
          typeof relative === "string" &&
          relative.startsWith("node_modules/") &&
          !relative.includes("\\") &&
          !relative.split("/").some((part) => ["", ".", ".."].includes(part)),
      ),
    "Independent dependencies are missing or linked outside their target",
  );
  const setup = record.setup;
  requireCondition(
    typeof setup?.root === "string" &&
      path.isAbsolute(setup.root) &&
      setup.root !== record.target &&
      !setup.root.startsWith(`${record.target}${path.sep}`) &&
      setup.home === path.join(setup.root, "home") &&
      setup.store === path.join(setup.root, "store") &&
      setup.browserCache === path.join(setup.root, "browser-cache") &&
      setup.registry === "https://registry.npmjs.org" &&
      setup.packageManager === "pnpm@11.24.0" &&
      setup.packageManagerVersion === "11.24.0",
    "Unsupported independent setup provenance",
  );
  requireCondition(
    record.installation.length === 3 &&
      new Set(record.installation.map((item) => item.key)).size === 3,
    "Missing or duplicate independent setup steps",
  );
  const dependency = record.installation.find((item) => item.key === "install-dependencies");
  const node = dependency?.argv?.[0];
  requireCondition(
    typeof node === "string" &&
      path.isAbsolute(node) &&
      /^node(?:\.exe)?$/.test(path.basename(node)),
    "Missing setup Node executable",
  );
  const pnpm = path.join(setup.root, "tooling/node_modules/pnpm/bin/pnpm.cjs");
  const commands = {
    "install-package-manager": [
      "npm",
      "install",
      "--prefix",
      path.join(setup.root, "tooling"),
      "--registry",
      setup.registry,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "pnpm@11.24.0",
    ],
    "install-dependencies": [
      node,
      pnpm,
      "install",
      "--frozen-lockfile",
      "--store-dir",
      setup.store,
      "--registry",
      setup.registry,
    ],
    "install-browser": [node, pnpm, "exec", "playwright", "install", "chromium"],
  };
  for (const install of record.installation) {
    requireCondition(
      Object.hasOwn(commands, install.key) &&
        isDeepStrictEqual(install.argv, commands[install.key]) &&
        install.cwd === record.target &&
        install.exitCode === 0 &&
        /^[a-f0-9]{64}$/.test(install.logSha256),
      "Unsupported independent setup command",
    );
    const log = safeFile(artifactRoot, install.logPath);
    requireCondition(
      digest(log) === install.logSha256 &&
        readFileSync(log, "utf8").startsWith(`$ ${JSON.stringify(install.argv)}\n`),
      "Changed independent setup log or command",
    );
  }
};
const jsonFile = (root, relative) => JSON.parse(readFileSync(safeFile(root, relative), "utf8"));
const identitySet = (identities) =>
  identities
    .map((identity) => JSON.stringify([identity.file, identity.title, identity.project ?? ""]))
    .sort();
const equalIdentities = (left, right) =>
  Array.isArray(left) &&
  Array.isArray(right) &&
  isDeepStrictEqual(identitySet(left), identitySet(right));
const equalObserved = (left, right) =>
  Array.isArray(left) &&
  Array.isArray(right) &&
  isDeepStrictEqual(
    [...left].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    [...right].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
const indexEntries = (artifactRoot) =>
  readFileSync(safeFile(artifactRoot, "artifacts/proofline/execution-index.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
const readReference = (artifactRoot, reference) => {
  requireCondition(
    reference?.version === 1 &&
      typeof reference.invocationId === "string" &&
      reference.verification === `runs/${reference.invocationId}/verification.json` &&
      /^[a-f0-9-]+$/.test(reference.invocationId) &&
      /^[a-f0-9]{64}$/.test(reference.sha256),
    "Malformed native invocation reference",
  );
  const relative = `artifacts/proofline/${reference.verification}`;
  const file = safeFile(artifactRoot, relative);
  requireCondition(digest(file) === reference.sha256, "Changed native invocation reference");
  return JSON.parse(readFileSync(file, "utf8"));
};
export const collectPortabilityNativeEvidence = (_record, artifactRoot) => {
  const entries = indexEntries(artifactRoot);
  const nativeArtifactHashes = {};
  const executionGates = { selected: [] };
  for (const entry of entries) {
    const native = readReference(artifactRoot, entry);
    for (const file of Object.values(native.artifacts ?? {})) {
      const relative = `artifacts/proofline/${file}`;
      nativeArtifactHashes[relative] = digest(safeFile(artifactRoot, relative));
    }
    const gate = native.gateKey?.slice("portability:".length);
    if (gate === "selected") executionGates.selected.push(entry);
    else if (
      (gate === "unit" && native.runner === "aggregate") ||
      gate === "browser" ||
      gate === "coverage"
    ) {
      requireCondition(!executionGates[gate], "Ambiguous native portability gate");
      executionGates[gate] = entry;
    }
  }
  return { nativeArtifactHashes, executionGates };
};

const validateNativePortability = (record, artifactRoot, authority) => {
  const contextKeys = [
    "sourceCommit",
    "sessionId",
    "ciRunId",
    "ciRunAttempt",
    "gateKey",
    "gateExecutionId",
  ];
  if (authority) {
    const wanted = {
      ...authority,
      ciRunId: authority.ciRunId ?? authority.runId ?? null,
      ciRunAttempt: authority.ciRunAttempt ?? authority.runAttempt ?? null,
      gateKey: authority.gateKey ?? "portability",
      gateExecutionId: authority.gateExecutionId ?? `${authority.sessionId}-portability`,
    };
    for (const key of contextKeys)
      requireCondition(
        String(record[key] ?? "") === String(wanted[key] ?? ""),
        `Stale host portability context: ${key}`,
      );
  }
  const actualRepository = process.env.GITHUB_REPOSITORY ?? null;
  const actualWorkflow = process.env.GITHUB_WORKFLOW_REF ?? null;
  let trustedRepository = actualRepository;
  let trustedWorkflow = actualWorkflow;
  if (authority) {
    requireCondition(
      Object.hasOwn(authority, "repository") && Object.hasOwn(authority, "workflow"),
      "Missing externally trusted repository/workflow authority",
    );
    trustedRepository = authority.repository;
    trustedWorkflow = authority.workflow;
    if (typeof trustedWorkflow === "string" && trustedWorkflow.startsWith(".github/workflows/"))
      trustedWorkflow = `${trustedRepository}/${trustedWorkflow}@refs/heads/main`;
  }
  requireCondition(
    (trustedRepository === null &&
      trustedWorkflow === null &&
      actualRepository === null &&
      actualWorkflow === null) ||
      (typeof trustedRepository === "string" &&
        /^[^/\s]+\/[^/\s]+$/.test(trustedRepository) &&
        typeof trustedWorkflow === "string" &&
        trustedWorkflow.startsWith(`${trustedRepository}/.github/workflows/`) &&
        trustedWorkflow.includes("@refs/")),
    "Missing or ambiguous trusted repository/workflow context",
  );
  requireCondition(
    Object.hasOwn(record, "repository") &&
      Object.hasOwn(record, "workflow") &&
      record.repository === trustedRepository &&
      record.workflow === trustedWorkflow,
    "Stale host repository/workflow context",
  );
  requireCondition(
    record.gateKey === "portability" &&
      typeof record.sessionId === "string" &&
      record.sessionId.length > 0 &&
      typeof record.gateExecutionId === "string" &&
      record.gateExecutionId.length > 0,
    "Missing host portability context",
  );
  for (const gate of record.gates)
    requireCondition(
      gate.logPath === `${gate.key}.log` &&
        /^[a-f0-9]{64}$/.test(gate.logSha256) &&
        digest(safeFile(artifactRoot, gate.logPath)) === gate.logSha256,
      "Missing or changed portability gate log",
    );
  const manifest = jsonFile(artifactRoot, "target/proofline.harness.json");
  requireCondition(
    manifest.version === 1 &&
      Array.isArray(manifest.ownership) &&
      Array.isArray(manifest.execution?.unitTargets) &&
      manifest.browser?.projects?.length === 1 &&
      manifest.browser.projects[0] === "chromium",
    "Missing retained target manifest",
  );
  const bindings = {
    vitest: requiredBindings(manifest, "vitest"),
    playwright: requiredBindings(manifest, "playwright"),
  };
  requireCondition(
    bindings.vitest.length === 2 && bindings.playwright.length === 4,
    "Incomplete retained target required bindings",
  );
  const entries = indexEntries(artifactRoot);
  requireCondition(
    entries.length > 0 &&
      new Set(entries.map((entry) => entry.invocationId)).size === entries.length,
    "Missing or duplicate native portability index",
  );
  const byId = new Map(
    entries.map((entry) => [
      entry.invocationId,
      { entry, native: readReference(artifactRoot, entry) },
    ]),
  );
  const hashes = {};
  const reconciled = new Map();
  const context = (native) => {
    validateNativeRecordContract(native);
    requireCondition(
      native.repository === trustedRepository && native.workflow === trustedWorkflow,
      "Foreign native repository/workflow context",
    );
    requireCondition(
      native.version === 1 &&
        native.outcome === "passed" &&
        native.exitCode === 0 &&
        Array.isArray(native.errors) &&
        native.errors.length === 0 &&
        Array.isArray(native.children) &&
        Array.isArray(native.expected) &&
        Array.isArray(native.observed) &&
        typeof native.repositoryRoot === "string" &&
        path.isAbsolute(native.repositoryRoot),
      "Malformed or failed native portability invocation",
    );
    requireCondition(
      native.sessionId === record.sessionId &&
        String(native.ciRunId ?? "") === String(record.ciRunId ?? "") &&
        String(native.ciRunAttempt ?? "") === String(record.ciRunAttempt ?? ""),
      "Stale native portability execution context",
    );
    const gate = native.gateKey?.slice("portability:".length);
    requireCondition(
      ["initial-coverage", "selected", "unit", "browser", "coverage"].includes(gate) &&
        native.gateKey === `portability:${gate}` &&
        native.gateExecutionId === `${record.gateExecutionId}:${gate}`,
      "Wrong native portability gate context",
    );
    const revision =
      gate === "initial-coverage"
        ? record.source.bootstrap
        : gate === "selected"
          ? record.source.head
          : record.source.verifiedHead;
    requireCondition(native.sourceCommit === revision, "Stale native portability source revision");
  };
  const reference = (ref) => {
    const found = byId.get(ref?.invocationId);
    requireCondition(
      found && isDeepStrictEqual(found.entry, ref),
      "Missing or changed native child/gate reference",
    );
    return found.native;
  };
  for (const { native } of byId.values()) {
    requireCondition(
      byId.has(native.invocationId) && byId.get(native.invocationId).native === native,
      "Native invocation identity differs from indexed reference",
    );
    context(native);
    if (native.runner === "aggregate") {
      requireCondition(
        isDeepStrictEqual(native.argv.slice(1), [
          path.join(native.repositoryRoot, "tools/proofline/canonical-runner.mjs"),
          "unit",
        ]) &&
          native.cwd === native.repositoryRoot &&
          Object.keys(native.artifacts).length === 0 &&
          isDeepStrictEqual(native.metadata, { projects: [], workers: null, shard: null }),
        "Substituted canonical aggregate argv or metadata",
      );
      continue;
    }
    requireCondition(
      ["vitest", "playwright"].includes(native.runner) &&
        ["selected", "subset", "full"].includes(native.scope) &&
        native.children.length === 0,
      "Unsupported native invocation shape",
    );
    const requiredArtifacts = [
      "nativeReport",
      "discovery",
      "stdout",
      "stderr",
      ...(native.runner === "vitest" ? ["nativeEvents"] : []),
    ];
    requireCondition(
      native.artifacts &&
        equalIdentities(native.expected, native.expected) &&
        Object.keys(native.artifacts).length === requiredArtifacts.length,
      "Missing native artifacts",
    );
    const artifacts = {};
    for (const key of requiredArtifacts) {
      const file = native.artifacts[key];
      const names = {
        nativeReport: "native-report.json",
        nativeEvents: "native-events.json",
        discovery: "discovery.json",
        stdout: "stdout.log",
        stderr: "stderr.log",
      };
      requireCondition(
        file === `runs/${native.invocationId}/${names[key]}`,
        "Substituted native artifact reference",
      );
      requireCondition(
        typeof file === "string" && file.startsWith(`runs/${native.invocationId}/`),
        "Cross-invocation native artifact substitution",
      );
      const relative = `artifacts/proofline/${file}`;
      const absolute = safeFile(artifactRoot, relative);
      hashes[relative] = digest(absolute);
      requireCondition(
        record.nativeArtifactHashes?.[relative] === hashes[relative],
        "Missing or changed native report/event/discovery bytes",
      );
      if (["nativeReport", "nativeEvents", "discovery"].includes(key))
        artifacts[key] = JSON.parse(readFileSync(absolute, "utf8"));
    }
    validateInstrumentedArgv(native, artifacts.discovery, artifacts.nativeReport);
    const discovered = parseDiscovery(native.runner, artifacts.discovery, native.repositoryRoot);
    requireCondition(
      isDeepStrictEqual(
        [...new Set(discovered.map((identity) => identity.project))].sort(),
        [...native.metadata.projects].sort(),
      ),
      "Native project metadata differs from discovery",
    );
    const expected =
      native.scope === "full"
        ? discovered.filter((identity) =>
            bindings[native.runner].some(
              (binding) => binding.file === identity.file && binding.title === identity.title,
            ),
          )
        : discovered;
    requireCondition(
      equalIdentities(native.expected, expected) && expected.length > 0,
      "Native required applicability differs from retained discovery",
    );
    const result = reconcileExecution({
      runner: native.runner,
      expected,
      nativeReport: artifacts.nativeReport,
      nativeEvents: artifacts.nativeEvents,
      root: native.repositoryRoot,
      exitCode: native.exitCode,
    });
    requireCondition(
      result.outcome === "passed" &&
        result.errors.length === 0 &&
        equalObserved(result.observed, native.observed),
      `Native portability outcomes did not reconcile: ${result.errors.join("; ")}`,
    );
    reconciled.set(native.invocationId, { ...native, ...result });
  }
  requireCondition(
    isDeepStrictEqual(hashes, record.nativeArtifactHashes),
    "Missing or ambiguous native artifact hash inventory",
  );
  for (const { native } of byId.values()) {
    if (native.runner !== "aggregate") continue;
    requireCondition(
      native.scope === "full" &&
        native.gateKey === "portability:unit" &&
        native.gateComplete === true &&
        equalIdentities(native.expected, bindings.vitest) &&
        native.children.length === manifest.execution.unitTargets.length,
      "Incomplete canonical unit aggregate",
    );
    const children = native.children.map((ref, index) => {
      const child = reference(ref);
      const target = manifest.execution.unitTargets[index];
      requireCondition(
        child.runner === "vitest" &&
          child.gateKey === native.gateKey &&
          child.gateExecutionId === native.gateExecutionId &&
          child.scope === "full" &&
          isDeepStrictEqual(child.requestedArgs, target.argv) &&
          path.resolve(native.repositoryRoot, target.cwd) === child.cwd,
        "Unit child target differs from manifest",
      );
      return reconciled.get(child.invocationId);
    });
    const result = verifyAggregate({ expected: bindings.vitest, children });
    requireCondition(
      result.outcome === "passed" && equalObserved(result.observed, native.observed),
      "Unit aggregate differs from actual reconciled children",
    );
    reconciled.set(native.invocationId, { ...native, ...result });
  }
  const gates = record.executionGates;
  requireCondition(
    gates &&
      Object.keys(gates).sort().join() === "browser,coverage,selected,unit" &&
      Array.isArray(gates.selected),
    "Missing authoritative native portability gate references",
  );
  const unit = reference(gates.unit);
  const browser = reference(gates.browser);
  const coverage = reference(gates.coverage);
  requireCondition(
    unit.runner === "aggregate" &&
      unit.gateKey === "portability:unit" &&
      reconciled.has(unit.invocationId),
    "Missing complete native unit gate",
  );
  requireCondition(
    browser.runner === "playwright" &&
      browser.scope === "full" &&
      browser.gateKey === "portability:browser" &&
      browser.gateComplete === true &&
      isDeepStrictEqual(browser.requestedArgs, manifest.execution.browserArgs) &&
      equalIdentities(
        browser.expected,
        bindings.playwright.map((identity) => ({ ...identity, project: "chromium" })),
      ),
    "Missing complete native browser gate",
  );
  const coverageArgs = manifest.commands.coverage.argv;
  const vitestIndex = coverageArgs.indexOf("vitest");
  requireCondition(
    vitestIndex >= 0 &&
      coverage.runner === "vitest" &&
      coverage.gateKey === "portability:coverage" &&
      isDeepStrictEqual(coverage.requestedArgs, coverageArgs.slice(vitestIndex + 1)),
    "Missing exact native coverage gate",
  );
  requireCondition(
    gates.selected.length === 6 &&
      new Set(gates.selected.map((ref) => ref.invocationId)).size === 6,
    "Missing exact selected native gates",
  );
  const selected = gates.selected.map((ref) => reference(ref));
  requireCondition(
    selected.every(
      (native) =>
        native.gateKey === "portability:selected" &&
        native.scope === "selected" &&
        native.expected.length === 1,
    ) &&
      equalIdentities(
        selected
          .filter((native) => native.runner === "vitest")
          .flatMap((native) => native.expected),
        bindings.vitest,
      ) &&
      equalIdentities(
        selected
          .filter((native) => native.runner === "playwright")
          .flatMap((native) => native.expected),
        bindings.playwright.map((identity) => ({ ...identity, project: "chromium" })),
      ),
    "Selected native evidence differs from required exact identities",
  );
};

const stringArray = (value, { allowEmpty = false } = {}) =>
  Array.isArray(value) &&
  (allowEmpty || value.length > 0) &&
  value.every((item) => typeof item === "string" && item.length > 0);
const plainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const identityContract = (identity, projectRequired) =>
  plainObject(identity) &&
  typeof identity.file === "string" &&
  identity.file.length > 0 &&
  !path.isAbsolute(identity.file) &&
  !identity.file.includes("\\") &&
  !identity.file.split("/").some((part) => ["", ".", ".."].includes(part)) &&
  typeof identity.title === "string" &&
  identity.title.length > 0 &&
  (projectRequired
    ? typeof identity.project === "string"
    : identity.project === undefined || typeof identity.project === "string");
const validateNativeRecordContract = (native) => {
  const required = [
    "version",
    "invocationId",
    "runner",
    "sourceCommit",
    "repositoryRoot",
    "sessionId",
    "ciRunId",
    "ciRunAttempt",
    "repository",
    "workflow",
    "gateKey",
    "gateExecutionId",
    "scope",
    "argv",
    "cwd",
    "exitCode",
    "outcome",
    "expected",
    "observed",
    "errors",
    "children",
    "artifacts",
    "metadata",
    "gateComplete",
  ];
  requireCondition(
    plainObject(native) &&
      required.every((key) => Object.hasOwn(native, key)) &&
      native.version === 1 &&
      /^[a-f0-9-]{36}$/.test(native.invocationId) &&
      ["aggregate", "vitest", "playwright"].includes(native.runner) &&
      /^[a-f0-9]{40}$/.test(native.sourceCommit) &&
      ["full", "subset", "selected"].includes(native.scope),
    "Incomplete v1 native invocation contract",
  );
  requireCondition(
    stringArray(native.argv) &&
      native.argv.length >= 3 &&
      path.isAbsolute(native.argv[0]) &&
      /^node(?:\.exe)?$/.test(path.basename(native.argv[0])) &&
      typeof native.repositoryRoot === "string" &&
      path.isAbsolute(native.repositoryRoot) &&
      typeof native.cwd === "string" &&
      path.isAbsolute(native.cwd),
    "Missing native argv/cwd contract",
  );
  const relativeCwd = path.relative(native.repositoryRoot, native.cwd);
  requireCondition(
    !relativeCwd.startsWith("..") && !path.isAbsolute(relativeCwd),
    "Native cwd escapes its source root",
  );
  requireCondition(
    (native.ciRunId === null && native.ciRunAttempt === null) ||
      (typeof native.ciRunId === "string" &&
        /^[1-9]\d*$/.test(native.ciRunId) &&
        typeof native.ciRunAttempt === "string" &&
        /^[1-9]\d*$/.test(native.ciRunAttempt)),
    "Malformed native run/attempt contract",
  );
  requireCondition(
    typeof native.sessionId === "string" &&
      native.sessionId.length > 0 &&
      typeof native.gateKey === "string" &&
      native.gateKey.length > 0 &&
      typeof native.gateExecutionId === "string" &&
      native.gateExecutionId.length > 0 &&
      typeof native.gateComplete === "boolean" &&
      native.gateComplete === (native.runner !== "vitest") &&
      native.outcome === "passed" &&
      native.exitCode === 0,
    "Malformed native gate contract",
  );
  requireCondition(
    Array.isArray(native.expected) &&
      native.expected.every((identity) =>
        identityContract(identity, native.runner !== "aggregate"),
      ) &&
      Array.isArray(native.observed) &&
      native.observed.every((identity) => identityContract(identity, true)) &&
      Array.isArray(native.errors) &&
      native.errors.length === 0 &&
      Array.isArray(native.children) &&
      plainObject(native.artifacts) &&
      plainObject(native.metadata) &&
      Array.isArray(native.metadata.projects) &&
      native.metadata.projects.every((project) => typeof project === "string") &&
      new Set(native.metadata.projects).size === native.metadata.projects.length &&
      (native.metadata.workers === null ||
        (typeof native.metadata.workers === "string" &&
          /^[1-9]\d*$/.test(native.metadata.workers))) &&
      native.metadata.shard === null,
    "Malformed native identity/artifact/metadata contract",
  );
  if (native.runner !== "aggregate")
    requireCondition(
      stringArray(native.requestedArgs) &&
        native.requestedArgs[0] === (native.runner === "vitest" ? "run" : "test"),
      "Missing requested native argv contract",
    );
};
const validateInstrumentedArgv = (native, discoveryReport, nativeReport) => {
  const root = native.repositoryRoot;
  const cli = path.join(
    root,
    native.runner === "vitest"
      ? "tools/proofline/vitest-execution.mjs"
      : "node_modules/@playwright/test/cli.js",
  );
  const nativeReportPath = path.join(root, "artifacts/proofline", native.artifacts.nativeReport);
  const tail =
    native.runner === "vitest"
      ? [
          "--reporter=default",
          "--reporter=json",
          `--reporter=${path.join(root, "tools/proofline/vitest-native-reporter.mjs")}`,
          `--outputFile.json=${nativeReportPath}`,
        ]
      : [
          "--reporter=list,json,html",
          `--output=${path.join(root, "artifacts/proofline/runs", native.invocationId, "test-results")}`,
        ];
  requireCondition(
    native.argv[1] === cli &&
      isDeepStrictEqual(native.argv.slice(2), [...native.requestedArgs, ...tail]),
    "Substituted instrumented native argv",
  );
  if (native.runner === "playwright") {
    const discoveryArgv = [
      ...native.argv.slice(0, 2),
      ...native.requestedArgs,
      "--list",
      "--reporter=json",
    ];
    requireCondition(
      isDeepStrictEqual(nativeReport.config?.argv, native.argv) &&
        isDeepStrictEqual(discoveryReport.config?.argv, discoveryArgv),
      "Native browser argv differs from discovery/execution command",
    );
    requireCondition(
      nativeReport.config?.rootDir === discoveryReport.config?.rootDir &&
        nativeReport.config?.configFile === discoveryReport.config?.configFile &&
        Number.isInteger(nativeReport.config?.workers) &&
        nativeReport.config.workers > 0 &&
        nativeReport.config.workers === discoveryReport.config?.workers &&
        String(nativeReport.config.workers) === native.metadata.workers &&
        nativeReport.config.shard === null &&
        discoveryReport.config.shard === null,
      "Native browser config/workers differ from recorded applicability",
    );
  }
};
