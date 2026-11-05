import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { commitGitFixture, initializeGitFixture } from "../../impact/test-fixtures/git.ts";
import {
  collectCompatibilityEvidence,
  parseCompatibilityOptions,
  summarizeCompatibility,
  validateCompatibilityDeclaration,
  // @ts-expect-error Portable JavaScript API.
} from "../compatibility.mjs";
// @ts-expect-error Portable JavaScript API.
import { REQUIRED_RELEASE_GATES } from "../release-evidence.mjs";

type CandidateDeclaration = {
  cells: Array<Record<string, unknown>>;
  stack: Record<string, string>;
  [key: string]: unknown;
};
const declaration = (): CandidateDeclaration =>
  JSON.parse(
    readFileSync(new URL("../../../proofline.compatibility.json", import.meta.url), "utf8"),
  );
describe("compatibility evidence", () => {
  test("parses explicit cell authority and artifact inputs without accepting unknown or duplicate options", () => {
    const args = [
      "--cell",
      "darwin-arm64-chromium",
      "--authority",
      "authority.json",
      "--native",
      "/native",
      "--portability",
      "latest.json",
      "--mode",
      "fixture",
      "--portability-root",
      "/target",
    ];
    expect(parseCompatibilityOptions(args)).toMatchObject({
      cellId: "darwin-arm64-chromium",
      authorityFile: "authority.json",
      evidenceDirectory: "/native",
      portabilityFile: "latest.json",
      portabilityArtifactRoot: "/target",
      mode: "fixture",
    });
    for (const value of [
      [],
      ["--unknown", "value"],
      ["--cell"],
      [...args, "--cell", "other"],
      ["--cell", "--native"],
    ])
      expect(() => parseCompatibilityOptions(value)).toThrow();
  });

  test("accepts exactly the two pinned complete candidate cells", () => {
    const value = declaration();
    expect(validateCompatibilityDeclaration(value)).toEqual(value);
    expect(
      summarizeCompatibility({ declaration: value }).cells.map(
        (cell: { status: string }) => cell.status,
      ),
    ).toEqual(["not-observed", "not-observed"]);
  });
  test("rejects unknown keys duplicate cells and altered candidate tuples", () => {
    for (const edit of [
      (v: CandidateDeclaration) => {
        v.verified = true;
      },
      (v: CandidateDeclaration) => {
        v.cells[0].verified = true;
      },
      (v: CandidateDeclaration) => {
        v.cells.push(v.cells[0]);
      },
      (v: CandidateDeclaration) => {
        v.cells[1] = v.cells[0];
      },
      (v: CandidateDeclaration) => {
        v.cells[0].scope = "smoke";
      },
      (v: CandidateDeclaration) => {
        v.stack.node = "24.23.0";
      },
      (v: CandidateDeclaration) => {
        v.cells[0].runner = "ubuntu-latest";
      },
    ]) {
      const value = declaration();
      edit(value);
      expect(() => validateCompatibilityDeclaration(value)).toThrow();
    }
  });
  test("does not promote summary-only fixture or manually flagged receipts", () => {
    const value = declaration();
    for (const evidence of [
      { cellId: value.cells[0].id, verified: true },
      { cellId: value.cells[0].id, mode: "fixture", outcome: "passed" },
    ])
      expect(() => summarizeCompatibility({ declaration: value, evidence: [evidence] })).toThrow(
        /collect|receipt/i,
      );
  });
  test("rejects missing native evidence and unsupported modes without publishing receipts", async () => {
    await expect(
      collectCompatibilityEvidence({
        declaration: declaration(),
        cellId: "linux-x64-chromium",
        mode: "smoke",
      }),
    ).rejects.toThrow();
    await expect(
      collectCompatibilityEvidence({ declaration: declaration(), cellId: "linux-x64-chromium" }),
    ).rejects.toThrow();
  });
});

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

const independentInstallation = (fixture: {
  record: Record<string, unknown>;
  write: (file: string, content: string) => void;
  hash: (file: string) => string;
}) => {
  const record = fixture.record;
  record.dependencyMode = "independent";
  record.preparation = {
    dependencyDirectory: "node_modules",
    hostLinked: false,
    resolvedPackages: Object.fromEntries(
      ["vite", "vitest", "react", "@playwright/test", "zod"].map((name) => [
        name,
        `node_modules/.pnpm/${name.replaceAll("/", "+")}@1.0.0/node_modules/${name}`,
      ]),
    ),
  };
  record.setup = {
    root: "/external/setup",
    home: "/external/setup/home",
    store: "/external/setup/store",
    browserCache: "/external/setup/browser-cache",
    registry: "https://registry.npmjs.org",
    packageManager: "pnpm@11.24.0",
    packageManagerVersion: "11.24.0",
  };
  const pnpm = "/external/setup/tooling/node_modules/pnpm/bin/pnpm.cjs";
  const node = "/runtime/bin/node";
  record.installation = [
    [
      "install-package-manager",
      [
        "npm",
        "install",
        "--prefix",
        "/external/setup/tooling",
        "--registry",
        "https://registry.npmjs.org",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "pnpm@11.24.0",
      ],
    ],
    [
      "install-dependencies",
      [
        node,
        pnpm,
        "install",
        "--frozen-lockfile",
        "--store-dir",
        "/external/setup/store",
        "--registry",
        "https://registry.npmjs.org",
      ],
    ],
    ["install-browser", [node, pnpm, "exec", "playwright", "install", "chromium"]],
  ].map(([key, argv]) => {
    const logPath = `${key}.log`;
    fixture.write(logPath, `$ ${JSON.stringify(argv)}\nSetup completed.\n`);
    return {
      key,
      argv,
      cwd: record.target,
      exitCode: 0,
      logPath,
      logSha256: fixture.hash(logPath),
    };
  });
};
const nativeRuntime = () => ({
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  execPath: process.execPath,
});
const prepareCompatibilityFixture = () => {
  const f = fixture();
  mkdirSync(path.join(f.root, "tools/impact"), { recursive: true });
  mkdirSync(path.join(f.root, "tools/proofline"), { recursive: true });
  writeFileSync(path.join(f.root, "tools/impact/core.mjs"), "export const core = true;\n");
  writeFileSync(path.join(f.root, "tools/proofline/core.mjs"), "export const runner = true;\n");
  json(path.join(f.root, "package.json"), { private: true, type: "module" });
  symlinkSync(path.resolve("node_modules"), path.join(f.root, "node_modules"));
  const artifactRoot = path.join(f.root, "artifacts/portability/run");
  const record = JSON.parse(
    readFileSync(path.join(f.root, "artifacts/portability/latest.json"), "utf8"),
  );
  independentInstallation({
    record,
    write: (file, bytes) => {
      writeFileSync(path.join(artifactRoot, file), bytes);
    },
    hash: (file) => hash(readFileSync(path.join(artifactRoot, file))),
  });
  record.compatibility = {
    ...record.compatibility,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    react: "19.2.8",
    vite: "6.4.3",
    vitest: "3.2.7",
    playwright: "1.62.1",
  };
  record.coreHashes = Object.fromEntries(
    ["tools/impact/core.mjs", "tools/proofline/core.mjs"].map((file) => [
      file,
      hash(readFileSync(path.join(f.root, file))),
    ]),
  );
  for (const directory of [f.evidenceDirectory, path.join(artifactRoot, "artifacts/proofline")]) {
    const entries = readFileSync(path.join(directory, "execution-index.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    for (const entry of entries) {
      const file = path.join(directory, entry.verification);
      const native = JSON.parse(readFileSync(file, "utf8"));
      native.metadata.runtime = nativeRuntime();
      json(file, native);
    }
    rehash(directory);
  }
  json(path.join(f.root, "artifacts/portability/latest.json"), record);
  refreshPortabilityReferences(f.root);
  const options = {
    repositoryRoot: f.root,
    declaration: declaration(),
    cellId: process.platform === "darwin" ? "darwin-arm64-chromium" : "linux-x64-chromium",
    authority: f.auth,
    evidenceDirectory: f.evidenceDirectory,
    portabilityRecord: JSON.parse(
      readFileSync(path.join(f.root, "artifacts/portability/latest.json"), "utf8"),
    ),
    portabilityArtifactRoot: artifactRoot,
    mode: "fixture",
    fixtureProbes: (_root: string, command: string, args: string[]) => {
      if (command === "pnpm") return "11.24.0";
      if (args[0] === "--version") return "git version 2.51.0";
      if (args[0] === "status") return "";
      return f.auth.sourceCommit;
    },
  };
  return { ...f, options };
};
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
describe("source-bound native compatibility collection", () => {
  test("reconciles full native CRM and independent work-orders fixtures without promoting a platform", async () => {
    const f = prepareCompatibilityFixture();
    const receipt = await collectCompatibilityEvidence(f.options);
    expect(receipt.runtime).toEqual(nativeRuntime());
    expect(receipt.stack).toEqual(declaration().stack);
    expect(receipt.observation).toBe("fixture");
    expect(
      summarizeCompatibility({ declaration: declaration(), evidence: [receipt] }).sourceCommit,
    ).toBe(f.auth.sourceCommit);
    expect(Object.keys(receipt.native)).toHaveLength(5);
    expect(Object.keys(receipt.coreHashes)).toHaveLength(2);
    expect(
      summarizeCompatibility({ declaration: declaration(), evidence: [receipt] }).cells.every(
        (cell: { status: string }) => cell.status === "not-observed",
      ),
    ).toBe(true);
    expect(() =>
      summarizeCompatibility({ declaration: declaration(), evidence: [receipt, receipt] }),
    ).toThrow(/duplicate/i);
    expect(() =>
      summarizeCompatibility({
        declaration: declaration(),
        evidence: [JSON.parse(JSON.stringify(receipt))],
      }),
    ).toThrow(/collect/i);
    for (const mode of ["local", "hosted"])
      await expect(collectCompatibilityEvidence({ ...f.options, mode })).rejects.toThrow(
        /fixture probe/i,
      );
    f.auth.sourceCommit = "e".repeat(40);
    f.options.portabilityRecord.sourceCommit = f.auth.sourceCommit;
    const entries = readFileSync(path.join(f.evidenceDirectory, "execution-index.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    for (const entry of entries) {
      const file = path.join(f.evidenceDirectory, entry.verification);
      const native = JSON.parse(readFileSync(file, "utf8"));
      native.sourceCommit = f.auth.sourceCommit;
      json(file, native);
    }
    rehash(f.evidenceDirectory);
    const differentSource = await collectCompatibilityEvidence(f.options);
    expect(() =>
      summarizeCompatibility({ declaration: declaration(), evidence: [receipt, differentSource] }),
    ).toThrow(/source/i);
  });
  test("rejects smoke stale source session runtime missing native and summary-only evidence", async () => {
    for (const mutation of [
      "scope",
      "source",
      "session",
      "runtime",
      "runtime-missing",
      "runtime-extra",
      "runtime-node",
      "runtime-platform",
      "runtime-execPath",
      "runtime-child",
      "native",
      "summary",
    ]) {
      const f = prepareCompatibilityFixture();
      const directory = f.evidenceDirectory;
      const file = path.join(
        directory,
        mutation === "runtime-child"
          ? "runs/unit-child/verification.json"
          : "runs/browser-child/verification.json",
      );
      const native = JSON.parse(readFileSync(file, "utf8"));
      if (mutation === "scope") native.scope = "subset";
      if (mutation === "source") native.sourceCommit = "f".repeat(40);
      if (mutation === "session") native.sessionId = "wrong";
      if (mutation === "runtime") native.metadata.runtime.arch = "unsupported";
      if (["runtime-missing", "runtime-child"].includes(mutation)) delete native.metadata.runtime;
      if (mutation === "runtime-extra") native.metadata.runtime.verified = true;
      if (mutation === "runtime-node") native.metadata.runtime.nodeVersion = "v24.0.0";
      if (mutation === "runtime-platform") native.metadata.runtime.platform = "unsupported";
      if (mutation === "runtime-execPath") native.metadata.runtime.execPath = "/other/node";
      if (mutation === "native") rmSync(path.join(directory, native.artifacts.nativeReport));
      json(file, native);
      rehash(directory);
      if (mutation === "summary")
        writeFileSync(
          path.join(directory, "execution-index.jsonl"),
          JSON.stringify({ outcome: "passed", verified: true }) + "\n",
        );
      await expect(collectCompatibilityEvidence(f.options), mutation).rejects.toThrow();
    }
  });
  test("rejects reused installation target runtime tuple changed core and stale authority", async () => {
    for (const mutation of [
      "reuse",
      "target-runtime",
      "target-runtime-missing",
      "target-runtime-child",
      "tuple",
      "core",
      "authority",
      "runtime-cell",
      "pnpm",
      "git",
      "dirty",
    ]) {
      const f = prepareCompatibilityFixture();
      const options = f.options;
      if (mutation === "reuse") options.portabilityRecord.dependencyMode = "reuse";
      if (mutation === "tuple") options.portabilityRecord.compatibility.react = "19.0.0";
      if (mutation === "core")
        options.portabilityRecord.coreHashes["tools/impact/core.mjs"] = "f".repeat(64);
      if (mutation === "authority")
        options.authority = { ...options.authority, sourceCommit: "f".repeat(40) };
      if (mutation === "runtime-cell")
        options.cellId =
          process.platform === "darwin" ? "linux-x64-chromium" : "darwin-arm64-chromium";
      if (["pnpm", "git", "dirty"].includes(mutation)) {
        const previous = options.fixtureProbes;
        options.fixtureProbes = (root, command, args) =>
          mutation === "pnpm" && command === "pnpm"
            ? "11.25.0"
            : mutation === "git" && args[0] === "--version"
              ? "git version 2.47.0"
              : mutation === "dirty" && args[0] === "status"
                ? " M source.txt"
                : previous(root, command, args);
      }
      if (mutation.startsWith("target-runtime")) {
        const file = path.join(
          options.portabilityArtifactRoot,
          "artifacts/proofline",
          options.portabilityRecord.executionGates.unit.verification,
        );
        const native = JSON.parse(readFileSync(file, "utf8"));
        if (mutation === "target-runtime-child") {
          const childFile = path.join(
            options.portabilityArtifactRoot,
            "artifacts/proofline",
            native.children[0].verification,
          );
          const child = JSON.parse(readFileSync(childFile, "utf8"));
          delete child.metadata.runtime;
          json(childFile, child);
        } else {
          if (mutation.endsWith("missing")) delete native.metadata.runtime;
          else native.metadata.runtime.nodeVersion = "v24.0.0";
          json(file, native);
        }
        refreshPortabilityReferences(f.root);
        options.portabilityRecord = JSON.parse(
          readFileSync(path.join(f.root, "artifacts/portability/latest.json"), "utf8"),
        );
      }
      await expect(collectCompatibilityEvidence(options), mutation).rejects.toThrow();
    }
  });
});
