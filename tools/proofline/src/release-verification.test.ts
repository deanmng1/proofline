import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, test } from "vitest";
import { commitGitFixture, initializeGitFixture } from "../../impact/test-fixtures/git.ts";
// @ts-expect-error The release tools are portable JavaScript entrypoints.
import { createReleaseBundle, REQUIRED_RELEASE_GATES } from "../release-bundle.mjs";
import {
  resolveAndDownloadRelease,
  selectTrustedVerification,
  verifyReleaseArchive,
  verifyReleaseDirectory,
  // @ts-expect-error The release tools are portable JavaScript entrypoints.
} from "../release-verify.mjs";

const roots: string[] = [];
const sha = "a".repeat(40);
const authority = {
  repository: "acme/proofline",
  sourceCommit: sha,
  workflow: ".github/workflows/verify.yml",
  runId: "123",
  runAttempt: "2",
  sessionId: "123-2",
};
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const temp = () => {
  const root = mkdtempSync(path.join(tmpdir(), "proofline-release-"));
  roots.push(root);
  return root;
};
const json = (file: string, value: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
};
const identity = (file: string) => ({ file, title: "executes required behavior", project: "" });
const scenarioArgs = (key: string) => [
  "test",
  "scenario.spec.ts",
  "--project",
  "chromium",
  ...(key === "browserScenario" ? ["--workers=2"] : [`--shard=${key.endsWith("1") ? 1 : 2}/2`]),
];
function fixture() {
  const root = temp();
  initializeGitFixture(root);
  writeFileSync(path.join(root, "source.txt"), "verified source\n");
  const sourceCommit = commitGitFixture(root, "fixture");
  const auth = { ...authority, sourceCommit };
  const productionDirectory = path.join(root, "dist");
  mkdirSync(path.join(productionDirectory, "assets"), { recursive: true });
  json(path.join(productionDirectory, ".proofline/modules.json"), {
    version: 1,
    chunks: [{ file: "assets/app.js", modules: ["app/main.ts"], imports: [], dynamicImports: [] }],
  });
  json(path.join(productionDirectory, ".vite/manifest.json"), {
    "index.html": { file: "assets/app.js", src: "app/main.ts", isEntry: true },
  });
  writeFileSync(path.join(productionDirectory, "assets/app.js"), "console.log('production');");
  writeFileSync(path.join(productionDirectory, "index.html"), "<html>production</html>");
  const unit = identity("app/unit.test.ts");
  const browser = { ...identity("app/browser.spec.ts"), project: "chromium" };
  json(path.join(root, "proofline.harness.json"), {
    browser: {
      projects: ["chromium", "firefox", "webkit"],
      crossBrowserSmokeProjects: ["firefox", "webkit"],
    },
    execution: { unitTargets: [{ argv: ["run"], cwd: "." }], browserArgs: ["test"] },
    production: { directory: "dist", forbiddenModules: ["app/test-only.ts"] },
    adapters: {
      testModeEnvironment: "app/capability.ts",
      auth: "app/auth-adapter.ts",
      api: "app/api-adapter.ts",
      providers: ["app/provider-adapter.mjs"],
    },
    commands: Object.fromEntries(
      ["browserScenario", "browserScenarioShard1", "browserScenarioShard2"].map((key) => [
        key,
        { argv: ["node", "runner", "playwright", ...scenarioArgs(key)] },
      ]),
    ),
    ownership: [
      {
        testBindings: [
          {
            file: unit.file,
            title: unit.title,
            layer: "unit",
            runner: "vitest",
            commandKey: "unit",
          },
          {
            file: browser.file,
            title: browser.title,
            layer: "browser",
            runner: "playwright",
            commandKey: "browser",
          },
        ],
      },
    ],
  });
  const evidenceDirectory = path.join(root, "artifacts/proofline");
  const index: unknown[] = [];
  for (const gateKey of [
    "unit",
    "browser",
    "browserScenario",
    "browserScenarioShard1",
    "browserScenarioShard2",
  ]) {
    const expected = gateKey === "unit" ? [unit] : [browser];
    const id = `${gateKey}-child`;
    const verification = `runs/${id}/verification.json`;
    const record = {
      version: 1,
      invocationId: id,
      runner: gateKey === "unit" ? "vitest" : "playwright",
      ...auth,
      repositoryRoot: root,
      workflow: `${auth.repository}/${auth.workflow}@refs/heads/main`,
      ciRunId: auth.runId,
      ciRunAttempt: auth.runAttempt,
      gateKey,
      gateExecutionId: `${auth.sessionId}-${gateKey}`,
      scope: gateKey === "unit" || gateKey === "browser" ? "full" : "subset",
      argv: gateKey.startsWith("browserScenario")
        ? scenarioArgs(gateKey)
        : [gateKey === "unit" ? "run" : "test"],
      requestedArgs: gateKey.startsWith("browserScenario")
        ? scenarioArgs(gateKey)
        : [gateKey === "unit" ? "run" : "test"],
      cwd: root,
      exitCode: 0,
      outcome: "passed",
      expected,
      observed: expected.map((value) => ({
        ...value,
        status: "passed",
        expectedStatus: "passed",
        retry: 0,
        repeats: 0,
      })),
      errors: [],
      children: [],
      artifacts: {
        nativeReport: `runs/${id}/native.json`,
        nativeEvents: `runs/${id}/events.json`,
        discovery: `runs/${id}/discovery.json`,
        stdout: `runs/${id}/stdout.txt`,
        stderr: `runs/${id}/stderr.txt`,
      },
      metadata: {
        projects: gateKey === "unit" ? [""] : ["chromium"],
        workers: gateKey === "unit" ? null : "2",
        shard: gateKey.endsWith("Shard1")
          ? { current: 1, total: 2 }
          : gateKey.endsWith("Shard2")
            ? { current: 2, total: 2 }
            : null,
      },
      gateComplete: gateKey !== "unit",
    };
    record.argv = [
      process.execPath,
      path.join(
        root,
        gateKey === "unit"
          ? "tools/proofline/vitest-execution.mjs"
          : "node_modules/@playwright/test/cli.js",
      ),
      ...record.requestedArgs,
      ...(gateKey === "unit"
        ? [
            "--reporter=default",
            "--reporter=json",
            `--reporter=${path.join(root, "tools/proofline/vitest-native-reporter.mjs")}`,
            `--outputFile.json=${path.join(evidenceDirectory, record.artifacts.nativeReport)}`,
          ]
        : [
            "--reporter=list,json,html",
            `--output=${path.join(evidenceDirectory, "runs", id, "test-results")}`,
          ]),
    ];
    json(path.join(evidenceDirectory, verification), record);
    const nativeBrowser = {
      config: {
        rootDir: root,
        workers: 2,
        shard: record.metadata.shard,
        argv: record.argv,
        metadata: { actualWorkers: 2 },
      },
      errors: [],
      suites: [
        {
          specs: expected.map((value) => ({
            file: value.file,
            title: value.title,
            tests: [
              {
                projectName: value.project,
                expectedStatus: "passed",
                status: "expected",
                results: [{ status: "passed", retry: 0 }],
              },
            ],
          })),
        },
      ],
    };
    json(
      path.join(evidenceDirectory, record.artifacts.nativeReport),
      gateKey === "unit"
        ? {
            testResults: [
              {
                name: path.join(root, unit.file),
                assertionResults: [
                  { fullName: unit.title, ancestorTitles: [], title: unit.title, status: "passed" },
                ],
              },
            ],
          }
        : nativeBrowser,
    );
    json(path.join(evidenceDirectory, record.artifacts.nativeEvents), {
      version: 1,
      tests: record.observed,
    });
    json(
      path.join(evidenceDirectory, record.artifacts.discovery),
      gateKey === "unit"
        ? [{ file: unit.file, name: unit.title, projectName: "" }]
        : {
            ...nativeBrowser,
            config: {
              ...nativeBrowser.config,
              argv: [
                record.argv[0],
                record.argv[1],
                ...record.requestedArgs,
                "--list",
                "--reporter=json",
              ],
            },
          },
    );
    writeFileSync(path.join(evidenceDirectory, record.artifacts.stdout), "passed");
    writeFileSync(path.join(evidenceDirectory, record.artifacts.stderr), "");
    index.push({
      version: 1,
      invocationId: id,
      verification,
      sha256: hash(readFileSync(path.join(evidenceDirectory, verification))),
    });
    if (gateKey === "unit") {
      const aggregate = {
        ...record,
        invocationId: "unit",
        runner: "aggregate",
        gateComplete: true,
        children: [index.at(-1)],
        artifacts: {},
      };
      json(path.join(evidenceDirectory, "runs/unit/verification.json"), aggregate);
      index.push({
        version: 1,
        invocationId: "unit",
        verification: "runs/unit/verification.json",
        sha256: hash(readFileSync(path.join(evidenceDirectory, "runs/unit/verification.json"))),
      });
    }
  }
  writeFileSync(
    path.join(evidenceDirectory, "execution-index.jsonl"),
    `${index.map((value) => JSON.stringify(value)).join("\n")}\n`,
  );
  portabilityFixture(root, auth);
  const outputDirectory = path.join(root, "bundle");
  const options = {
    root,
    productionDirectory,
    evidenceDirectory,
    outputDirectory,
    authority: auth,
    gateOutcomes: Object.fromEntries(REQUIRED_RELEASE_GATES.map((key: string) => [key, "success"])),
  };
  return { root, auth, options, evidenceDirectory, outputDirectory };
}
function portabilityFixture(root: string, auth: typeof authority) {
  const snapshot = JSON.parse(
    readFileSync(new URL("../test-fixtures/portability-native.json", import.meta.url), "utf8"),
  );
  const directory = path.join(root, "artifacts/portability/run");
  for (const [file, bytes] of Object.entries(snapshot.files)) {
    const destination = path.join(directory, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes as string);
  }
  const result = {
    ...snapshot.record,
    sourceCommit: auth.sourceCommit,
    repository: auth.repository,
    workflow: `${auth.repository}/${auth.workflow}@refs/heads/main`,
    sessionId: auth.sessionId,
    ciRunId: auth.runId,
    ciRunAttempt: auth.runAttempt,
    gateKey: "portability",
    gateExecutionId: `${auth.sessionId}-portability`,
    artifactDirectory: "artifacts/portability/run",
    artifacts: directory,
  };
  const invocationRoot = path.join(directory, "artifacts/proofline");
  const index = readFileSync(path.join(invocationRoot, "execution-index.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  for (const entry of index) {
    const file = path.join(invocationRoot, entry.verification);
    const native = JSON.parse(readFileSync(file, "utf8"));
    const coverage = native.requestedArgs?.includes("--coverage");
    const gate =
      native.sourceCommit === result.source.head
        ? "selected"
        : coverage
          ? native.sourceCommit === result.source.verifiedHead
            ? "coverage"
            : "initial-coverage"
          : native.gateKey;
    if (gate === "initial-coverage") result.source.bootstrap = native.sourceCommit;
    if (native.runner === "vitest")
      native.argv[1] = path.join(native.repositoryRoot, "tools/proofline/vitest-execution.mjs");
    Object.assign(native, {
      sessionId: auth.sessionId,
      ciRunId: auth.runId,
      ciRunAttempt: auth.runAttempt,
      repository: auth.repository,
      workflow: `${auth.repository}/${auth.workflow}@refs/heads/main`,
      gateKey: `portability:${gate}`,
      gateExecutionId: `${result.gateExecutionId}:${gate}`,
    });
    json(file, native);
  }
  rehash(invocationRoot);
  const entries = readFileSync(path.join(invocationRoot, "execution-index.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  result.executionGates = { selected: [] };
  result.nativeArtifactHashes = {};
  for (const entry of entries) {
    const native = JSON.parse(readFileSync(path.join(invocationRoot, entry.verification), "utf8"));
    const gate = native.gateKey.slice("portability:".length);
    if (gate === "selected") result.executionGates.selected.push(entry);
    else if (
      gate === "browser" ||
      gate === "coverage" ||
      (gate === "unit" && native.runner === "aggregate")
    )
      result.executionGates[gate] = entry;
    for (const file of Object.values(native.artifacts) as string[]) {
      const relative = `artifacts/proofline/${file}`;
      result.nativeArtifactHashes[relative] = hash(readFileSync(path.join(directory, relative)));
    }
  }
  for (const gate of result.gates) {
    gate.logPath = `${gate.key}.log`;
    gate.log = path.join(directory, gate.logPath);
    gate.logSha256 = hash(readFileSync(gate.log));
  }
  for (const file of Object.keys(result.evidenceHashes))
    result.evidenceHashes[file] = hash(readFileSync(path.join(directory, file)));
  result.evidenceHashes["target/proofline.harness.json"] = hash(
    readFileSync(path.join(directory, "target/proofline.harness.json")),
  );
  json(path.join(root, "artifacts/portability/latest.json"), result);
}
function refreshPortabilityReferences(root: string) {
  const directory = path.join(root, "artifacts/portability/run");
  const latestFile = path.join(root, "artifacts/portability/latest.json");
  const latest = JSON.parse(readFileSync(latestFile, "utf8"));
  const nativeRoot = path.join(directory, "artifacts/proofline");
  rehash(nativeRoot);
  const entries = readFileSync(path.join(nativeRoot, "execution-index.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  for (const key of ["unit", "browser", "coverage"])
    latest.executionGates[key] = entries.find(
      (value) => value.invocationId === latest.executionGates[key].invocationId,
    );
  latest.executionGates.selected = latest.executionGates.selected.map(
    (ref: { invocationId: string }) =>
      entries.find((value) => value.invocationId === ref.invocationId),
  );
  latest.evidenceHashes["artifacts/proofline/execution-index.jsonl"] = hash(
    readFileSync(path.join(nativeRoot, "execution-index.jsonl")),
  );
  json(latestFile, latest);
}
function trusted(auth = authority) {
  const run = {
    id: 123,
    run_attempt: 2,
    head_sha: auth.sourceCommit,
    path: auth.workflow,
    event: "push",
    head_branch: "main",
    status: "completed",
    conclusion: "success",
    repository: { full_name: auth.repository },
    workflow_id: 9,
  };
  const artifact = {
    id: 456,
    name: `proofline-release-${auth.sourceCommit}-123-2`,
    expired: false,
    expires_at: "2099-01-01T00:00:00Z",
    digest: `sha256:${"b".repeat(64)}`,
    workflow_run: { id: 123, head_sha: auth.sourceCommit, head_branch: "main" },
  };
  return {
    run,
    artifact,
    repository: auth.repository,
    sourceCommit: auth.sourceCommit,
    workflow: { id: 9, path: auth.workflow },
    now: new Date("2026-11-04T00:00:00Z"),
  };
}
function rehash(directory: string) {
  const file = path.join(directory, "execution-index.jsonl");
  const entries = readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  for (const entry of entries) {
    const record = JSON.parse(readFileSync(path.join(directory, entry.verification), "utf8"));
    for (const child of record.children || []) {
      const match = entries.find((value) => value.invocationId === child.invocationId);
      child.sha256 = match.sha256;
    }
    json(path.join(directory, entry.verification), record);
    entry.sha256 = hash(readFileSync(path.join(directory, entry.verification)));
  }
  writeFileSync(file, `${entries.map((value) => JSON.stringify(value)).join("\n")}\n`);
}
function bundleFiles(directory: string, prefix = ""): Array<{ name: string; content: Buffer }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? bundleFiles(path.join(directory, entry.name), `${prefix}${entry.name}/`)
      : [
          {
            name: `${prefix}${entry.name}`,
            content: readFileSync(path.join(directory, entry.name)),
          },
        ],
  );
}
function zip(
  members: Array<{ name: string; content: Buffer; mode?: number; compressed?: boolean }>,
) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const member of members) {
    let crc = 0xffffffff;
    for (const byte of member.content) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const content = member.compressed ? deflateRawSync(member.content) : member.content;
    const name = Buffer.from(member.name);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(member.compressed ? 8 : 0, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(content.length, 18);
    header.writeUInt32LE(member.content.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, content);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(0x0314, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(member.compressed ? 8 : 0, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(content.length, 20);
    entry.writeUInt32LE(member.content.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(((member.mode || 0o100644) << 16) >>> 0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + content.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(Buffer.concat(central).length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
describe("immutable release verification", () => {
  test("selects only an unambiguous successful exact trusted push run", () => {
    const input = trusted();
    expect(
      selectTrustedVerification({ ...input, runs: [input.run], artifacts: [input.artifact] })
        .artifact.id,
    ).toBe(456);
    expect(() =>
      selectTrustedVerification({ ...input, runs: [], artifacts: [input.artifact] }),
    ).toThrow();
    expect(() =>
      selectTrustedVerification({
        ...input,
        runs: [input.run, { ...input.run, id: 124 }],
        artifacts: [input.artifact],
      }),
    ).toThrow();
  });
  test.each([
    "head_sha",
    "path",
    "event",
    "head_branch",
    "conclusion",
    "repository",
    "run_attempt",
  ])("rejects wrong run authority %s", (key) => {
    const input = trusted();
    const run = {
      ...input.run,
      [key]:
        key === "repository" ? { full_name: "attacker/fork" } : key === "run_attempt" ? 0 : "wrong",
    };
    expect(() =>
      selectTrustedVerification({ ...input, runs: [run], artifacts: [input.artifact] }),
    ).toThrow();
  });
  test.each(["expired", "expires_at", "name", "digest", "workflow_run"])(
    "rejects invalid artifact %s",
    (key) => {
      const input = trusted();
      const artifact = {
        ...input.artifact,
        [key]:
          key === "expired" ? true : key === "workflow_run" ? { id: 124, head_sha: sha } : "wrong",
      };
      expect(() =>
        selectTrustedVerification({ ...input, runs: [input.run], artifacts: [artifact] }),
      ).toThrow();
    },
  );
  test("packages production bytes and validates the entire execution root", () => {
    const f = fixture();
    createReleaseBundle(f.options);
    verifyReleaseDirectory({ directory: f.outputDirectory, authority: f.auth });
    expect(
      readFileSync(path.join(f.outputDirectory, ".vercel/output/static/assets/app.js"), "utf8"),
    ).toBe("console.log('production');");
  });
  test("accepts mandatory Chromium without expanding optional smoke projects", () => {
    const f = fixture();
    const file = path.join(f.root, "proofline.harness.json");
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    manifest.browser = {
      projects: ["chromium", "firefox", "webkit"],
      crossBrowserSmokeProjects: ["firefox", "webkit"],
    };
    for (const owner of manifest.ownership)
      for (const binding of owner.testBindings) delete binding.project;
    json(file, manifest);
    expect(() => createReleaseBundle(f.options)).not.toThrow();
  });
  test.each(["browser", "browserScenarioShard1", "browserScenarioShard2"])(
    "accepts effective default workers from the live runner for %s",
    (gate) => {
      const f = fixture();
      const file = path.join(f.evidenceDirectory, `runs/${gate}-child/verification.json`);
      const record = JSON.parse(readFileSync(file, "utf8"));
      expect(record.requestedArgs.some((arg: string) => arg.startsWith("--workers"))).toBe(false);
      record.metadata.workers = "2";
      json(file, record);
      rehash(f.evidenceDirectory);
      expect(() => createReleaseBundle(f.options)).not.toThrow();
    },
  );
  test.each(["missing", "null", "wrong"])(
    "rejects inconsistent effective default worker metadata %s",
    (attack) => {
      const f = fixture();
      const file = path.join(f.evidenceDirectory, "runs/browser-child/verification.json");
      const record = JSON.parse(readFileSync(file, "utf8"));
      if (attack === "missing") delete record.metadata.workers;
      else record.metadata.workers = attack === "null" ? null : "7";
      json(file, record);
      rehash(f.evidenceDirectory);
      expect(() => createReleaseBundle(f.options)).toThrow(/worker argument or metadata/);
    },
  );
  test("accepts the coverage-safe Vitest execution shim contract", () => {
    const f = fixture();
    const file = path.join(f.evidenceDirectory, "runs/unit-child/verification.json");
    const record = JSON.parse(readFileSync(file, "utf8"));
    record.argv[1] = path.join(f.root, "tools/proofline/vitest-execution.mjs");
    json(file, record);
    rehash(f.evidenceDirectory);
    expect(() => createReleaseBundle(f.options)).not.toThrow();
    const rejected = fixture();
    const invalidFile = path.join(rejected.evidenceDirectory, "runs/unit-child/verification.json");
    const invalid = JSON.parse(readFileSync(invalidFile, "utf8"));
    invalid.argv[1] = path.join(rejected.root, "node_modules/vitest/vitest.mjs");
    json(invalidFile, invalid);
    rehash(rejected.evidenceDirectory);
    expect(() => createReleaseBundle(rejected.options)).toThrow(/instrumented runner arguments/);
  });
  test("reaudits declared production adapters immediately before packaging", () => {
    const f = fixture();
    const file = path.join(f.options.productionDirectory, ".proofline/modules.json");
    const graph = JSON.parse(readFileSync(file, "utf8"));
    graph.chunks[0].modules.push("app/provider-adapter.mjs");
    json(file, graph);
    expect(() => createReleaseBundle(f.options)).toThrow(
      /forbidden production module app\/provider-adapter\.mjs/,
    );
  });
  test.each([
    "runtimeWorkers",
    "discoveryWorkers",
    "missingWorkers",
    "runtimeShard",
    "discoveryShard",
    "missingShard",
    "runtimeArgv",
    "discoveryArgv",
  ])("rejects contradictory native scenario applicability %s", (attack) => {
    const f = fixture();
    const gate = attack.toLowerCase().includes("shard")
      ? "browserScenarioShard1"
      : "browserScenario";
    const file = path.join(f.evidenceDirectory, `runs/${gate}-child/verification.json`);
    const record = JSON.parse(readFileSync(file, "utf8"));
    const artifact = attack.startsWith("discovery")
      ? record.artifacts.discovery
      : record.artifacts.nativeReport;
    const native = JSON.parse(readFileSync(path.join(f.evidenceDirectory, artifact), "utf8"));
    if (attack.toLowerCase().includes("workers")) {
      if (attack === "missingWorkers") delete native.config.workers;
      else native.config.workers = 1;
    } else if (attack.toLowerCase().includes("shard")) {
      if (attack === "missingShard") delete native.config.shard;
      else native.config.shard = { current: 2, total: 2 };
    } else native.config.argv.push("--grep=only-one");
    json(path.join(f.evidenceDirectory, artifact), native);
    expect(() => createReleaseBundle(f.options)).toThrow();
  });
  test("rejects dirty tracked source before packaging", () => {
    const f = fixture();
    writeFileSync(path.join(f.root, "source.txt"), "modified");
    expect(() => createReleaseBundle(f.options)).toThrow(/dirty/i);
  });
  test("rejects production symlinks and missing or failed gates", () => {
    const f = fixture();
    symlinkSync(
      path.join(f.root, "source.txt"),
      path.join(f.options.productionDirectory, "outside"),
    );
    expect(() => createReleaseBundle(f.options)).toThrow(/symlink/i);
    rmSync(path.join(f.options.productionDirectory, "outside"));
    delete f.options.gateOutcomes.unit;
    expect(() => createReleaseBundle(f.options)).toThrow(/gate/i);
    f.options.gateOutcomes.unit = "failure";
    expect(() => createReleaseBundle(f.options)).toThrow(/gate/i);
  });
  test.each([
    "sourceCommit",
    "sessionId",
    "ciRunId",
    "ciRunAttempt",
    "scope",
    "gateComplete",
    "children",
  ])("rejects stale or incomplete current gate evidence %s", (key) => {
    const f = fixture();
    const file = path.join(f.evidenceDirectory, "runs/unit/verification.json");
    const record = JSON.parse(readFileSync(file, "utf8"));
    record[key] = key === "children" ? [] : key === "gateComplete" ? false : "wrong";
    json(file, record);
    rehash(f.evidenceDirectory);
    expect(() => createReleaseBundle(f.options)).toThrow();
  });
  test.each(["missing", "extra", "changed"])("rejects %s inventory files", (kind) => {
    const f = fixture();
    createReleaseBundle(f.options);
    const file = path.join(f.outputDirectory, ".vercel/output/static/assets/app.js");
    if (kind === "missing") rmSync(file);
    else if (kind === "extra") writeFileSync(path.join(f.outputDirectory, "extra"), "extra");
    else writeFileSync(file, "tampered");
    expect(() =>
      verifyReleaseDirectory({ directory: f.outputDirectory, authority: f.auth }),
    ).toThrow();
  });
  test.each([
    "repository",
    "workflow",
    "nativeExpectedFailure",
    "nativeRetry",
    "missingNativeReport",
    "missingStdout",
    "subsetBrowser",
    "wrongWorkers",
    "wrongShard",
    "duplicateGate",
    "missingManifestBinding",
    "argvSubset",
    "foreignNativeReference",
    "metadataProjects",
  ])("rejects independently substituted evidence %s", (attack) => {
    const f = fixture();
    const gate =
      attack === "subsetBrowser"
        ? "browser"
        : attack === "wrongWorkers"
          ? "browserScenario"
          : attack === "wrongShard"
            ? "browserScenarioShard1"
            : "unit-child";
    const file = path.join(
      f.evidenceDirectory,
      `runs/${gate === "unit-child" ? gate : `${gate}-child`}/verification.json`,
    );
    const record = JSON.parse(readFileSync(file, "utf8"));
    if (attack === "repository" || attack === "workflow") record[attack] = "attacker/fork";
    else if (attack === "nativeExpectedFailure" || attack === "nativeRetry") {
      const native = JSON.parse(
        readFileSync(path.join(f.evidenceDirectory, record.artifacts.nativeEvents), "utf8"),
      );
      native.tests[0][attack === "nativeRetry" ? "retry" : "expectedStatus"] =
        attack === "nativeRetry" ? 1 : "failed";
      json(path.join(f.evidenceDirectory, record.artifacts.nativeEvents), native);
    } else if (attack === "missingNativeReport" || attack === "missingStdout")
      rmSync(
        path.join(
          f.evidenceDirectory,
          record.artifacts[attack === "missingNativeReport" ? "nativeReport" : "stdout"],
        ),
      );
    else if (attack === "subsetBrowser") record.requestedArgs = ["test", "--grep=only-one"];
    else if (attack === "wrongWorkers") record.metadata.workers = 1;
    else if (attack === "wrongShard") record.metadata.shard = { current: 2, total: 2 };
    else if (attack === "duplicateGate") record.gateComplete = true;
    else if (attack === "argvSubset") record.argv.push("--grep=only-one");
    else if (attack === "foreignNativeReference")
      record.artifacts.nativeReport = "runs/browser-child/native.json";
    else if (attack === "metadataProjects") record.metadata.projects = ["wrong-project"];
    else {
      const manifest = JSON.parse(
        readFileSync(path.join(f.root, "proofline.harness.json"), "utf8"),
      );
      manifest.ownership[0].testBindings.push({
        ...manifest.ownership[0].testBindings[0],
        title: "required but omitted",
      });
      json(path.join(f.root, "proofline.harness.json"), manifest);
    }
    json(file, record);
    rehash(f.evidenceDirectory);
    expect(() => createReleaseBundle(f.options)).toThrow();
  });
  test("resolves annotated tags and consumes only the exact API-authorized artifact", async () => {
    const f = fixture();
    createReleaseBundle(f.options);
    const bytes = zip(
      bundleFiles(f.outputDirectory).map((member) => ({ ...member, compressed: true })),
    );
    const input = trusted(f.auth);
    input.artifact.digest = `sha256:${hash(bytes)}`;
    const calls: string[] = [];
    const api = async (_repo: string, route: string) => {
      calls.push(route);
      if (route === "/git/ref/tags/v1") return { object: { type: "tag", sha: "c".repeat(40) } };
      if (route === `/git/tags/${"c".repeat(40)}`)
        return { object: { type: "commit", sha: f.auth.sourceCommit } };
      if (route === "/actions/workflows/verify.yml") return input.workflow;
      if (route === "/actions/artifacts/456/zip") return bytes;
      if (route === "/actions/runs/123") return input.run;
      if (route === "/actions/artifacts/456") return input.artifact;
      throw new Error(`Unexpected API route ${route}`);
    };
    const list = async (_repo: string, route: string, key: string) => {
      expect(route).toContain(
        key === "workflow_runs" ? `head_sha=${f.auth.sourceCommit}` : "/actions/runs/123/artifacts",
      );
      return key === "workflow_runs" ? [input.run] : [input.artifact];
    };
    await resolveAndDownloadRelease({
      repository: f.auth.repository,
      tag: "v1",
      token: "offline-fixture",
      directory: path.join(f.root, "verified"),
      api,
      list,
    });
    expect(calls).toContain("/actions/artifacts/456/zip");
    expect(
      readFileSync(path.join(f.root, "verified/.vercel/output/static/assets/app.js"), "utf8"),
    ).toBe("console.log('production');");
  });
  test("workflow publishes only after complete gates and deployment uses trusted prebuilt output", () => {
    const require = createRequire(import.meta.url);
    const yaml = createRequire(require.resolve("nx/package.json"))("yaml");
    const root = path.resolve(import.meta.dirname, "../../..");
    const verify = yaml.parse(
      readFileSync(path.join(root, ".github/workflows/verify.yml"), "utf8"),
    );
    const deploy = yaml.parse(
      readFileSync(path.join(root, ".github/workflows/deploy-demo.yml"), "utf8"),
    );
    const steps = verify.jobs.verify.steps;
    const publish = steps.findIndex(
      (step: { name: string }) => step.name === "Publish successful immutable release bundle",
    );
    for (const gate of REQUIRED_RELEASE_GATES) {
      const index = steps.findIndex((step: { id?: string }) => step.id === gate);
      expect(index).toBeGreaterThan(-1);
      expect(index).toBeLessThan(publish);
    }
    expect(steps[publish].if).toContain("success()");
    expect(steps[publish].with["include-hidden-files"]).toBe(true);
    expect(
      steps.find(
        (step: { name: string }) =>
          step.name === "Preserve all invocation evidence including failures",
      ).if,
    ).toContain("always()");
    for (const workflow of [verify, deploy])
      for (const job of Object.values(workflow.jobs) as Array<{ steps: Array<{ uses?: string }> }>)
        for (const step of job.steps) if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
    const deployment = deploy.jobs.deploy.steps;
    expect(deployment[0].with.ref).toMatch(
      /^\$\{\{ github\.event\.repository\.default_branch \}\}$/,
    );
    const command = deployment.at(-1).run;
    expect(command).toMatch(/--package=vercel@\d+\.\d+\.\d+/);
    expect(command).toContain("deploy --prebuilt --prod");
    expect(deployment.filter((step: { run?: string }) => step.run?.includes("build")).length).toBe(
      0,
    );
  });
  test.each([
    "wrongRepository",
    "missingRepository",
    "wrongWorkflow",
    "missingWorkflow",
    "missingArgv",
    "substitutedArgv",
  ])("rejects fully rehashed standalone authority substitution %s", (attack) => {
    const f = fixture();
    const latest = JSON.parse(
      readFileSync(path.join(f.root, "artifacts/portability/latest.json"), "utf8"),
    );
    const file = path.join(
      f.root,
      "artifacts/portability/run/artifacts/proofline",
      latest.executionGates.browser.verification,
    );
    const record = JSON.parse(readFileSync(file, "utf8"));
    if (attack === "wrongRepository") record.repository = "foreign/checkout";
    else if (attack === "missingRepository") delete record.repository;
    else if (attack === "wrongWorkflow")
      record.workflow = "foreign/checkout/.github/workflows/other.yml@refs/heads/other";
    else if (attack === "missingWorkflow") delete record.workflow;
    else if (attack === "missingArgv") delete record.argv;
    else record.argv.push("--grep=only-one");
    json(file, record);
    refreshPortabilityReferences(f.root);
    expect(() => createReleaseBundle(f.options)).toThrow();
  });
  test.each([
    "standaloneMissingNative",
    "standaloneStaleContext",
    "standaloneMissingChild",
    "standaloneMissingLog",
  ])("rejects incomplete standalone release evidence %s", (attack) => {
    const f = fixture();
    const directory = path.join(f.root, "artifacts/portability/run");
    const latestFile = path.join(f.root, "artifacts/portability/latest.json");
    const latest = JSON.parse(readFileSync(latestFile, "utf8"));
    const index = readFileSync(
      path.join(directory, "artifacts/proofline/execution-index.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    if (attack === "standaloneMissingLog") {
      if (latest.gates[0].logPath) rmSync(path.join(directory, latest.gates[0].logPath));
    } else {
      const ref = index.find(
        (value) =>
          JSON.parse(
            readFileSync(path.join(directory, "artifacts/proofline", value.verification), "utf8"),
          ).runner === (attack === "standaloneMissingChild" ? "aggregate" : "playwright"),
      );
      const file = path.join(directory, "artifacts/proofline", ref.verification);
      const record = JSON.parse(readFileSync(file, "utf8"));
      if (attack === "standaloneMissingNative") {
        if (record.artifacts?.nativeReport)
          rmSync(path.join(directory, "artifacts/proofline", record.artifacts.nativeReport));
      } else if (attack === "standaloneStaleContext") {
        record.sessionId = "old-session";
        json(file, record);
        rehash(path.join(directory, "artifacts/proofline"));
        latest.evidenceHashes["artifacts/proofline/execution-index.jsonl"] = hash(
          readFileSync(path.join(directory, "artifacts/proofline/execution-index.jsonl")),
        );
      } else {
        record.children = [];
        json(file, record);
        rehash(path.join(directory, "artifacts/proofline"));
        latest.evidenceHashes["artifacts/proofline/execution-index.jsonl"] = hash(
          readFileSync(path.join(directory, "artifacts/proofline/execution-index.jsonl")),
        );
      }
    }
    json(latestFile, latest);
    expect(() => createReleaseBundle(f.options)).toThrow();
  });
  test.each([
    "sourceCommit",
    "sessionId",
    "ciRunId",
    "ciRunAttempt",
    "outcome",
    "gates",
    "evidenceHashes",
    "artifactDirectory",
  ])("rejects stale or incomplete portability evidence %s", (key) => {
    const f = fixture();
    const file = path.join(f.root, "artifacts/portability/latest.json");
    const record = JSON.parse(readFileSync(file, "utf8"));
    record[key] =
      key === "gates"
        ? []
        : key === "evidenceHashes"
          ? {}
          : key === "artifactDirectory"
            ? "../outside"
            : "wrong";
    json(file, record);
    expect(() => createReleaseBundle(f.options)).toThrow();
  });
  test("checks archive digest before any extraction and rejects unsafe archives", () => {
    const root = temp();
    for (const member of ["../escape", "/absolute", "link"]) {
      const bytes = zip([
        {
          name: member,
          content: Buffer.from("outside"),
          mode: member === "link" ? 0o120777 : 0o100644,
        },
      ]);
      expect(() =>
        verifyReleaseArchive({
          archiveBytes: bytes,
          digest: `sha256:${"0".repeat(64)}`,
          directory: path.join(root, "bad"),
          authority,
        }),
      ).toThrow(/digest/i);
      expect(() =>
        verifyReleaseArchive({
          archiveBytes: bytes,
          digest: `sha256:${hash(bytes)}`,
          directory: path.join(root, `${member.replaceAll("/", "_")}-extract`),
          authority,
        }),
      ).toThrow(/archive|path|symlink/i);
    }
  });
  test("validates a real complete archive without provider credentials", () => {
    const f = fixture();
    createReleaseBundle(f.options);
    const bytes = zip(bundleFiles(f.outputDirectory));
    verifyReleaseArchive({
      archiveBytes: bytes,
      digest: `sha256:${hash(bytes)}`,
      directory: path.join(f.root, "verified"),
      authority: f.auth,
    });
    expect(
      readFileSync(path.join(f.root, "verified/.vercel/output/static/index.html"), "utf8"),
    ).toBe("<html>production</html>");
  });
});
