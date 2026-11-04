import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  baselineSchema,
  coverageMain,
  normalizeGeneratedCoverageReports,
} from "./coverage-policy.ts";
import {
  checkBaselineMonotonicity,
  checkCoverageGroupCompatibility,
  readVerifiedMergeBase,
  verifyChangedHarnessEvidence,
  verifyRecordPrefix,
} from "./governance.ts";
import { harnessManifestSchema } from "./harness-manifest.ts";
import { recordMain, renderCanonicalCommandTable } from "./record-check.ts";
import { renderRules } from "./validate.ts";

const temporaryDirectories: string[] = [];
const temporaryDirectory = (prefix: string) => {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  while (temporaryDirectories.length) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const runGit = (cwd: string, args: string[]) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Proofline Test",
      GIT_AUTHOR_EMAIL: "proofline@example.invalid",
      GIT_COMMITTER_NAME: "Proofline Test",
      GIT_COMMITTER_EMAIL: "proofline@example.invalid",
    },
  }).trim();

const commitAll = (cwd: string, message: string) => {
  runGit(cwd, ["add", "."]);
  runGit(cwd, ["commit", "-qm", message]);
  return runGit(cwd, ["rev-parse", "HEAD"]);
};

const record = (eventId: string, scope: string[] = []) => ({
  schemaVersion: 1,
  eventId,
  recordedAt: "2026-10-28T00:00:00.000Z",
  phase: "verification",
  kind: "test",
  status: "passed",
  summary: "Verified",
  scope,
});

const recordLine = (eventId: string, scope: string[] = []) =>
  `${JSON.stringify(record(eventId, scope))}\n`;

const metrics = { lines: 90, branches: 80, functions: 100, statements: 90 };
const vitestProducer = {
  command: { kind: "nx-target" as const, target: "coverage" },
  adapter: {
    kind: "vitest" as const,
    implementation: "vitest-v8",
    version: { kind: "package-json" as const, package: "@vitest/coverage-v8" },
  },
};
const baseline = baselineSchema.parse({
  version: 1,
  files: {
    "packages/example/src/value.ts": {
      report: "artifacts/coverage/example/coverage-summary.json",
      ...metrics,
    },
  },
});

const manifest = harnessManifestSchema.parse({
  version: 1,
  commands: {
    lint: { argv: ["pnpm", "lint"], cwd: "." },
    typecheck: { argv: ["pnpm", "typecheck"], cwd: "." },
    unit: { argv: ["pnpm", "test"], cwd: "." },
    browser: { argv: ["pnpm", "test:e2e"], cwd: "." },
    coverage: { argv: ["pnpm", "coverage"], cwd: "." },
    coverageCheck: { argv: ["pnpm", "coverage:check"], cwd: "." },
    recordCheck: { argv: ["pnpm", "record:check"], cwd: "." },
  },
  workspaces: [
    {
      path: "packages/example",
      unitCommand: "unit",
      browserCommands: [],
      browserOptOutReason: "Unit-only fixture",
    },
  ],
  browser: {
    projects: ["chromium"],
    crossBrowserSmokeProjects: [],
    localOrigins: ["http://127.0.0.1"],
    testEntrypoint: "browser",
  },
  adapters: {
    testModeEnvironment: "packages/example/src/value.ts",
    auth: "packages/example/src/value.ts",
    api: "packages/example/src/value.ts",
    providers: [],
  },
  coverage: [
    {
      workspace: "packages/example",
      provider: "v8",
      providerVersion: "3.2.7",
      sourceGlobs: ["packages/example/src/value.ts"],
      exclusions: [],
      report: "artifacts/coverage/example/coverage-summary.json",
      reportFormat: "istanbul-json-summary",
      metrics: ["lines", "functions", "branches", "statements"],
      aggregation: "per-file",
      producer: vitestProducer,
    },
  ],
  ownership: [
    {
      glob: "packages/example/src/*.ts",
      entrypoints: ["packages/example/src/value.ts"],
      ruleIds: ["EX-001"],
      layers: ["service"],
      ruleLayers: [{ ruleId: "EX-001", layer: "service" }],
      testBindings: [
        {
          runner: "vitest",
          ruleId: "EX-001",
          layer: "service",
          testId: "example",
          commandKey: "unit",
          file: "packages/example/src/value.test.ts",
          title: "example",
          line: 1,
        },
      ],
    },
  ],
  ruleRegistry: "test-impact/rules.json",
  lifecycleMatrix: null,
  goldenWorkflowMatrix: "test-impact/workflows/example.json",
});

const coverageReport = (values = metrics) => ({
  total: {},
  "packages/example/src/value.ts": Object.fromEntries(
    Object.entries(values).map(([metric, pct]) => [metric, { pct }]),
  ),
});

const writeFixture = (cwd: string) => {
  for (const directory of [
    "packages/example/src",
    "test-impact/workflows",
    "docs",
    "artifacts/coverage/example",
    "node_modules/@vitest/coverage-v8",
  ])
    mkdirSync(path.join(cwd, directory), { recursive: true });
  writeFileSync(path.join(cwd, "packages/example/src/value.ts"), "export const value = 1;\n");
  writeFileSync(path.join(cwd, ".gitignore"), "artifacts/\nnode_modules/\n");
  writeFileSync(
    path.join(cwd, "packages/example/project.json"),
    `${JSON.stringify({
      name: "example",
      targets: {
        coverage: {
          command:
            "vitest run --coverage --coverage.provider=v8 --coverage.reporter=json-summary --coverage.reportsDirectory=artifacts/coverage/example --coverage.include=packages/example/src/*.ts --coverage.exclude=**/*.test.ts",
        },
      },
    })}\n`,
  );
  writeFileSync(
    path.join(cwd, "node_modules/@vitest/coverage-v8/package.json"),
    `${JSON.stringify({ name: "@vitest/coverage-v8", version: "3.2.7" })}\n`,
  );
  writeFileSync(path.join(cwd, "proofline.harness.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    path.join(cwd, "docs/PORTABLE_TEST_AUTOMATION.md"),
    `${renderCanonicalCommandTable(manifest)}\n`,
  );
  writeFileSync(
    path.join(cwd, "test-impact/coverage-baseline.json"),
    `${JSON.stringify(baseline, null, 2)}\n`,
  );
  writeFileSync(path.join(cwd, "test-impact/execution-record.jsonl"), recordLine("base"));
  const rules = {
    version: 1 as const,
    rules: [
      {
        id: "EX-001",
        description: "Example behavior",
        criticality: "critical" as const,
        paths: ["packages/example/src/value.ts"],
        vitest: [
          {
            file: "packages/example/src/value.test.ts",
            title: "example",
            line: 1,
          },
        ],
        playwright: [],
      },
    ],
  };
  writeFileSync(path.join(cwd, "test-impact/rules.json"), `${JSON.stringify(rules, null, 2)}\n`);
  writeFileSync(path.join(cwd, "test-impact/rules.md"), renderRules(rules));
  writeFileSync(
    path.join(cwd, "artifacts/coverage/example/coverage-summary.json"),
    `${JSON.stringify(coverageReport())}\n`,
  );
};

const initializedFixture = () => {
  const cwd = temporaryDirectory("proofline-governance-");
  runGit(cwd, ["init", "-q"]);
  writeFixture(cwd);
  const base = commitAll(cwd, "base");
  return { cwd, base };
};

describe("coverage baseline monotonicity", () => {
  test.each(["lines", "branches", "functions", "statements"] as const)(
    "rejects a lower %s threshold",
    (metric) => {
      const proposed = structuredClone(baseline);
      proposed.files["packages/example/src/value.ts"][metric] -= 0.01;
      expect(
        checkBaselineMonotonicity({ baseBaseline: baseline, proposedBaseline: proposed }).errors,
      ).toEqual([expect.stringMatching(new RegExp(`${metric}.*lowered`, "i"))]);
    },
  );

  test("rejects deleted groups and sources", () => {
    const proposed = { version: 1 as const, files: {} };
    expect(
      checkBaselineMonotonicity({ baseBaseline: baseline, proposedBaseline: proposed }).errors,
    ).toEqual([expect.stringMatching(/deleted.*packages\/example\/src\/value\.ts/i)]);
  });

  test.each([
    "provider",
    "providerVersion",
    "report",
    "reportFormat",
    "aggregation",
    "exclusions",
    "sourceGlobs",
  ])("rejects changed %s coverage-group authority", (field) => {
    const baseGroup = structuredClone(manifest.coverage[0]);
    const proposedGroup = structuredClone(baseGroup) as Record<string, unknown>;
    proposedGroup[field] =
      field === "exclusions"
        ? [{ glob: "packages/example/src/ignored.ts", reason: "Reviewed exclusion" }]
        : field === "sourceGlobs"
          ? ["packages/example/src/*.ts"]
          : `${String(proposedGroup[field])}-changed`;
    expect(
      checkCoverageGroupCompatibility({
        baseGroups: [baseGroup],
        proposedGroups: [proposedGroup as typeof baseGroup],
      }).errors.join(" "),
    ).toMatch(new RegExp(field === "report" ? "coverage group" : field, "i"));
  });

  test("rejects duplicate coverage-group identities instead of collapsing them", () => {
    expect(
      checkCoverageGroupCompatibility({
        baseGroups: [manifest.coverage[0]],
        proposedGroups: [manifest.coverage[0], structuredClone(manifest.coverage[0])],
      }).errors.join(" "),
    ).toMatch(/duplicate.*group/i);
  });

  test("rejects changed coverage producer authority after adoption", () => {
    const proposed = structuredClone(manifest.coverage[0]);
    if (!proposed.producer) throw new Error("fixture producer missing");
    proposed.producer.adapter.implementation = "different-producer";
    expect(
      checkCoverageGroupCompatibility({
        baseGroups: [manifest.coverage[0]],
        proposedGroups: [proposed],
      }).errors.join(" "),
    ).toMatch(/producer/i);
  });

  test("allows an explicit reasoned exclusion outside the base set but rejects wildcard hiding", () => {
    const proposed = structuredClone(manifest.coverage[0]);
    proposed.sourceGlobs.push("packages/example/src/*.ts");
    proposed.exclusions.push({
      glob: "packages/example/src/new-production.ts",
      reason: "Attempted hidden source",
    });
    expect(
      checkCoverageGroupCompatibility({
        baseGroups: [manifest.coverage[0]],
        proposedGroups: [proposed],
        baseSources: ["packages/example/src/value.ts"],
        baseRepositoryFiles: ["packages/example/src/new-production.ts"],
      }).errors,
    ).toEqual([]);
    proposed.exclusions[0].glob = "packages/example/src/new-*.ts";
    expect(
      checkCoverageGroupCompatibility({
        baseGroups: [manifest.coverage[0]],
        proposedGroups: [proposed],
        baseSources: ["packages/example/src/value.ts"],
        baseRepositoryFiles: ["packages/example/src/new-production.ts"],
      }).errors.join(" "),
    ).toMatch(/must name one.*exactly/i);

    proposed.exclusions[0].glob = "packages/example/src/new-production.ts";
    expect(
      checkCoverageGroupCompatibility({
        baseGroups: [manifest.coverage[0]],
        proposedGroups: [proposed],
        baseSources: ["packages/example/src/value.ts"],
        baseRepositoryFiles: ["packages/example/src/value.ts"],
      }).errors.join(" "),
    ).toMatch(/not proven.*merge base/i);
  });

  test("rejects narrowing a base production glob to the currently known source list", () => {
    const baseGroup = structuredClone(manifest.coverage[0]);
    baseGroup.sourceGlobs = ["packages/example/src/*.ts"];
    const proposed = structuredClone(baseGroup);
    proposed.sourceGlobs = ["packages/example/src/value.ts"];
    expect(
      checkCoverageGroupCompatibility({
        baseGroups: [baseGroup],
        proposedGroups: [proposed],
        baseSources: ["packages/example/src/value.ts"],
      }).errors.join(" "),
    ).toMatch(/sourceGlobs.*narrowed/i);
  });

  test("rejects excluding a base-effective source omitted from a stale baseline", () => {
    const baseGroup = structuredClone(manifest.coverage[0]);
    baseGroup.sourceGlobs = ["packages/example/src/*.ts"];
    const proposed = structuredClone(baseGroup);
    proposed.exclusions.push({
      glob: "packages/example/src/other.ts",
      reason: "Attempted hidden base source",
    });
    expect(
      checkCoverageGroupCompatibility({
        baseGroups: [baseGroup],
        proposedGroups: [proposed],
        baseSources: ["packages/example/src/value.ts"],
        baseRepositoryFiles: ["packages/example/src/value.ts", "packages/example/src/other.ts"],
      }).errors.join(" "),
    ).toMatch(/previously governed.*other\.ts/i);
  });

  test("allows only exact, explicitly non-production test-source exclusions", () => {
    const compatibility = (glob: string, reason: string) => {
      const proposed = structuredClone(manifest.coverage[0]);
      proposed.sourceGlobs.push("packages/example/src/*.ts");
      proposed.exclusions.push({ glob, reason });
      return checkCoverageGroupCompatibility({
        baseGroups: [manifest.coverage[0]],
        proposedGroups: [proposed],
        baseSources: ["packages/example/src/value.ts"],
        baseRepositoryFiles: ["packages/example/src/value.ts"],
      }).errors;
    };
    const reason = "Test sources are not instrumented production sources.";
    for (const name of ["rule.test.ts", "rule.test.tsx", "rule.spec.ts", "rule.spec.tsx"])
      expect(compatibility(`packages/example/src/${name}`, reason)).toEqual([]);
    for (const name of [
      "rule.test-helper.ts",
      "rule.specimen.ts",
      "rule.generated.ts",
      "rule.test.js",
      "rule.spec.jsx",
    ])
      expect(compatibility(`packages/example/src/${name}`, reason).join(" ")).toMatch(
        /not proven.*merge base/i,
      );
    expect(
      compatibility("packages/example/src/rule.test.ts", "Reviewed exclusion").join(" "),
    ).toMatch(/not proven.*merge base/i);
    expect(
      compatibility(
        "packages/example/src/rule.test.ts",
        "Test source is not a non-production source.",
      ).join(" "),
    ).toMatch(/not proven.*merge base/i);
    expect(
      compatibility(
        "packages/example/src/rule.test.ts",
        "Non-production test source excluded from the production ratchet.",
      ),
    ).toEqual([]);

    const baseGroup = structuredClone(manifest.coverage[0]);
    baseGroup.sourceGlobs = ["packages/example/src/*.ts"];
    const proposed = structuredClone(baseGroup);
    proposed.exclusions.push({
      glob: "packages/example/src/legacy.test.ts",
      reason,
    });
    expect(
      checkCoverageGroupCompatibility({
        baseGroups: [baseGroup],
        proposedGroups: [proposed],
        baseSources: ["packages/example/src/value.ts"],
        baseRepositoryFiles: [
          "packages/example/src/value.ts",
          "packages/example/src/legacy.test.ts",
        ],
      }).errors,
    ).toEqual([]);
  });
});

describe("verified merge base", () => {
  test("rejects missing, unresolved, shallow, checkout-mismatched, and conflicting revisions", () => {
    const { cwd, base } = initializedFixture();
    expect(readVerifiedMergeBase({ cwd, base: "", head: "HEAD" }).errors.join(" ")).toMatch(
      /missing.*base/i,
    );
    expect(
      readVerifiedMergeBase({ cwd, base: "does-not-exist", head: "HEAD" }).errors.join(" "),
    ).toMatch(/unresolved.*base/i);

    writeFileSync(path.join(cwd, "packages/example/src/value.ts"), "export const value = 2;\n");
    const next = commitAll(cwd, "next");
    expect(
      readVerifiedMergeBase({ cwd, base, head: base, requireCheckoutMatch: true }).errors.join(" "),
    ).toMatch(/checkout.*head/i);

    const shallow = temporaryDirectory("proofline-shallow-");
    runGit(tmpdir(), ["clone", "-q", "--depth=1", "--no-checkout", `file://${cwd}`, shallow]);
    expect(
      readVerifiedMergeBase({ cwd: shallow, base: "HEAD", head: "HEAD" }).errors.join(" "),
    ).toMatch(/shallow/i);

    const conflict = readVerifiedMergeBase({
      cwd,
      base,
      head: next,
      git: (_cwd, args) =>
        args[0] === "merge-base" ? { ok: true, stdout: `${base}\n${next}\n` } : undefined,
    });
    expect(conflict.errors.join(" ")).toMatch(/multiple.*merge bases/i);
  });
});

describe("byte-exact execution record prefix", () => {
  const baseRecord = Buffer.from(recordLine("base"));

  test("accepts an exact prefix with complete unique appended rows", () => {
    const result = verifyRecordPrefix({
      baseRecord,
      proposedRecord: Buffer.concat([baseRecord, Buffer.from(recordLine("next"))]),
    });
    expect(result.errors).toEqual([]);
    expect(result.appendedRecords.map((entry) => entry.eventId)).toEqual(["next"]);
  });

  test.each([
    ["historical byte rewrite", Buffer.from(recordLine("bAse"))],
    ["historical insertion", Buffer.from(` ${recordLine("base")}`)],
    ["historical deletion", baseRecord.subarray(1)],
    ["historical reordering", Buffer.from(`${recordLine("next")}${recordLine("base")}`)],
    ["CRLF normalization", Buffer.from(recordLine("base").replaceAll("\n", "\r\n"))],
  ])("rejects %s", (_name, proposedRecord) => {
    expect(verifyRecordPrefix({ baseRecord, proposedRecord }).errors.join(" ")).toMatch(/prefix/i);
  });

  test("rejects missing or extra trailing newlines and malformed or duplicate appended rows", () => {
    for (const proposedRecord of [
      Buffer.from(recordLine("base").slice(0, -1)),
      Buffer.from(`${recordLine("base")}\n`),
      Buffer.from(`${recordLine("base")}{\n`),
      Buffer.from(`${recordLine("base")}${recordLine("base")}`),
    ])
      expect(
        verifyRecordPrefix({ baseRecord, proposedRecord }).errors.length,
        proposedRecord.toString(),
      ).toBeGreaterThan(0);
  });

  test("rejects invalid UTF-8 and records without event identities", () => {
    const invalidUtf8 = Buffer.concat([baseRecord, Buffer.from([0xff, 0x0a])]);
    expect(
      verifyRecordPrefix({ baseRecord, proposedRecord: invalidUtf8 }).errors.join(" "),
    ).toMatch(/valid UTF-8/i);

    const missingEventId = Buffer.concat([baseRecord, Buffer.from("{}\n")]);
    expect(
      verifyRecordPrefix({ baseRecord, proposedRecord: missingEventId }).errors.join(" "),
    ).toMatch(/missing eventId/i);
  });
});

describe("changed harness evidence", () => {
  const governedCases = [
    "packages/example/src/value.ts",
    "proofline.harness.json",
    "test-impact/workflows/example.json",
    "test-impact/rules.json",
    "tools/impact/src/governance.ts",
    ".github/workflows/verify.yml",
    "docs/TESTING.md",
    "docs/PORTABLE_TEST_AUTOMATION.md",
    "package.json",
  ];

  test.each(governedCases)("requires an appended scope for %s", (changedPath) => {
    expect(
      verifyChangedHarnessEvidence({
        changedFiles: [{ path: changedPath, status: "modified" }],
        appendedRecords: [record("unrelated", ["README.md"])],
        manifest,
      }).errors,
    ).toEqual([expect.stringContaining(changedPath)]);
    expect(
      verifyChangedHarnessEvidence({
        changedFiles: [{ path: changedPath, status: "modified" }],
        appendedRecords: [record("scoped", [changedPath])],
        manifest,
      }).errors,
    ).toEqual([]);
  });

  test("governs manifest adapter and workspace project paths with segment-aware scopes", () => {
    for (const changedPath of ["packages/example/src/value.ts", "packages/example/project.json"])
      expect(
        verifyChangedHarnessEvidence({
          changedFiles: [{ path: changedPath, status: "modified" }],
          appendedRecords: [record("wrong-segment", ["packages/examples"])],
          manifest,
        }).errors,
      ).toEqual([expect.stringContaining(changedPath)]);
    expect(
      verifyChangedHarnessEvidence({
        changedFiles: [{ path: "tools/impactation/file.ts", status: "modified" }],
        appendedRecords: [],
        manifest,
      }).errors,
    ).toEqual([]);
  });

  test("uses base and proposed manifests so removed ownership cannot evade evidence", () => {
    const proposedManifest = structuredClone(manifest);
    proposedManifest.ownership = [] as typeof proposedManifest.ownership;
    proposedManifest.adapters.api = "packages/example/src/replacement.ts";
    expect(
      verifyChangedHarnessEvidence({
        changedFiles: [{ path: "packages/example/src/value.ts", status: "deleted" }],
        appendedRecords: [],
        manifest: proposedManifest,
        baseManifest: manifest,
      }).errors.join(" "),
    ).toMatch(/value\.ts/);
  });

  test("checks both renamed identities and excludes only explicit generated artifacts", () => {
    const result = verifyChangedHarnessEvidence({
      changedFiles: [
        {
          path: "packages/example/src/value.ts",
          previousPath: "packages/example/src/old.ts",
          status: "renamed",
        },
        { path: "artifacts/coverage/ratchet.json", status: "untracked" },
      ],
      appendedRecords: [record("rename", ["packages/example/src/"])],
      manifest,
    });
    expect(result.errors).toEqual([]);
    expect(result.excludedGeneratedPaths).toEqual(["artifacts/coverage/ratchet.json"]);
  });

  test("governs README and rejects an unscoped governed change", () => {
    expect(
      verifyChangedHarnessEvidence({
        changedFiles: [{ path: "README.md", status: "modified" }],
        appendedRecords: [],
        manifest,
      }).errors.join(" "),
    ).toMatch(/README\.md/);
    expect(
      verifyChangedHarnessEvidence({
        changedFiles: [{ path: "package.json", status: "modified" }],
        appendedRecords: [],
        manifest,
      }).errors.join(" "),
    ).toMatch(/package\.json/);
  });
});

describe("coverage and record governance entrypoints", () => {
  test("records exact resolved coverage producer provenance in the ratchet", () => {
    const { cwd, base } = initializedFixture();
    const result = coverageMain(cwd, { base, head: "HEAD" });
    expect(result.groups[0]).toMatchObject({
      provenance: {
        commandSource: { kind: "nx-target", target: "coverage" },
        command:
          "vitest run --coverage --coverage.provider=v8 --coverage.reporter=json-summary --coverage.reportsDirectory=artifacts/coverage/example --coverage.include=packages/example/src/*.ts --coverage.exclude=**/*.test.ts",
        adapter: "vitest",
        implementation: "vitest-v8",
        provider: "v8",
        providerPackage: "@vitest/coverage-v8",
        resolvedVersion: "3.2.7",
      },
    });
    expect(result.groups[0].provenance.argv).toEqual([
      "vitest",
      "run",
      "--coverage",
      "--coverage.provider=v8",
      "--coverage.reporter=json-summary",
      "--coverage.reportsDirectory=artifacts/coverage/example",
      "--coverage.include=packages/example/src/*.ts",
      "--coverage.exclude=**/*.test.ts",
    ]);
  });

  test("accepts a manifest-command browser-compatible Istanbul summary producer", () => {
    const cwd = temporaryDirectory("proofline-browser-coverage-");
    runGit(cwd, ["init", "-q"]);
    writeFixture(cwd);
    const browserManifest = {
      ...structuredClone(manifest),
      commands: {
        ...manifest.commands,
        browserCoverage: {
          argv: [
            "node",
            "packages/example/browser-coverage.mjs",
            "--report-format=istanbul-json-summary",
            "--report=artifacts/coverage/example/coverage-summary.json",
          ],
          cwd: "." as const,
        },
      },
      coverage: [
        {
          ...structuredClone(manifest.coverage[0]),
          provider: "istanbul-browser",
          providerVersion: "1.4.0",
          producer: {
            command: { kind: "manifest-command" as const, commandKey: "browserCoverage" },
            adapter: {
              kind: "istanbul-summary" as const,
              implementation: "browser-istanbul",
              reportFormatArg: "--report-format=istanbul-json-summary",
              reportPathArg: "--report=artifacts/coverage/example/coverage-summary.json",
              version: { kind: "package-json" as const, package: "browser-istanbul" },
            },
          },
        },
      ],
    };
    writeFileSync(
      path.join(cwd, "packages/example/browser-coverage.mjs"),
      "// Browser instrumentation producer fixture.\n",
    );
    mkdirSync(path.join(cwd, "node_modules/browser-istanbul"), { recursive: true });
    writeFileSync(
      path.join(cwd, "node_modules/browser-istanbul/package.json"),
      `${JSON.stringify({ name: "browser-istanbul", version: "1.4.0" })}\n`,
    );
    writeFileSync(
      path.join(cwd, "proofline.harness.json"),
      `${JSON.stringify(browserManifest, null, 2)}\n`,
    );
    const base = commitAll(cwd, "browser coverage base");
    const result = coverageMain(cwd, { base, head: "HEAD" });
    expect(result.groups[0].provenance).toMatchObject({
      commandSource: { kind: "manifest-command", commandKey: "browserCoverage" },
      command: JSON.stringify(browserManifest.commands.browserCoverage),
      argv: browserManifest.commands.browserCoverage.argv,
      cwd: ".",
      adapter: "istanbul-summary",
      implementation: "browser-istanbul",
      provider: "istanbul-browser",
      providerPackage: "browser-istanbul",
      resolvedVersion: "1.4.0",
    });
  });

  test("normalizes generated in-repository absolute paths before they become evidence", () => {
    const { cwd } = initializedFixture();
    const absoluteSource = path.join(cwd, "packages/example/src/value.ts");
    writeFileSync(
      path.join(cwd, "artifacts/coverage/example/coverage-summary.json"),
      `${JSON.stringify({
        total: {},
        [absoluteSource]: coverageReport()["packages/example/src/value.ts"],
      })}\n`,
    );
    normalizeGeneratedCoverageReports(cwd);
    const normalized = JSON.parse(
      readFileSync(path.join(cwd, "artifacts/coverage/example/coverage-summary.json"), "utf8"),
    );
    expect(Object.keys(normalized)).toEqual(["total", "packages/example/src/value.ts"]);
  });

  test("rejects incompatible provider metadata and always writes a complete ratchet", () => {
    const { cwd, base } = initializedFixture();
    const proposed = structuredClone(manifest);
    proposed.coverage[0].providerVersion = "4.0.0";
    writeFileSync(
      path.join(cwd, "proofline.harness.json"),
      `${JSON.stringify(proposed, null, 2)}\n`,
    );
    expect(() => coverageMain(cwd, { base, head: "HEAD" })).toThrow(/providerVersion/i);
    const ratchet = JSON.parse(
      readFileSync(path.join(cwd, "artifacts/coverage/ratchet.json"), "utf8"),
    );
    expect(ratchet).toMatchObject({
      revisions: { requestedBase: base, requestedHead: "HEAD", mergeBase: base },
      groups: [
        expect.objectContaining({
          workspace: "packages/example",
          provenance: expect.objectContaining({
            implementation: "vitest-v8",
            providerPackage: "@vitest/coverage-v8",
            resolvedVersion: "3.2.7",
          }),
        }),
      ],
    });
    expect(ratchet.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/providerVersion/i)]),
    );
  });

  test("rejects unclassified baseline sources, missing reports and metrics, and duplicate report paths", () => {
    const { cwd, base } = initializedFixture();
    const proposedBaseline = structuredClone(baseline);
    (proposedBaseline.files as Record<string, (typeof proposedBaseline.files)[string]>)[
      "packages/example/src/unclassified.ts"
    ] = {
      report: "artifacts/coverage/example/coverage-summary.json",
      ...metrics,
    };
    writeFileSync(
      path.join(cwd, "test-impact/coverage-baseline.json"),
      `${JSON.stringify(proposedBaseline, null, 2)}\n`,
    );
    expect(() => coverageMain(cwd, { base, head: "HEAD" })).toThrow(/unclassified/i);

    writeFileSync(
      path.join(cwd, "test-impact/coverage-baseline.json"),
      `${JSON.stringify(baseline, null, 2)}\n`,
    );
    rmSync(path.join(cwd, "artifacts/coverage/example/coverage-summary.json"));
    expect(() => coverageMain(cwd, { base, head: "HEAD" })).toThrow(/missing.*report/i);

    writeFileSync(
      path.join(cwd, "artifacts/coverage/example/coverage-summary.json"),
      `${JSON.stringify(coverageReport({ ...metrics, branches: undefined } as unknown as typeof metrics))}\n`,
    );
    expect(() => coverageMain(cwd, { base, head: "HEAD" })).toThrow(/branches/i);

    const duplicate = structuredClone(manifest);
    duplicate.coverage.push({ ...duplicate.coverage[0], workspace: "packages/example" });
    writeFileSync(
      path.join(cwd, "proofline.harness.json"),
      `${JSON.stringify(duplicate, null, 2)}\n`,
    );
    expect(() => coverageMain(cwd, { base, head: "HEAD" })).toThrow(/duplicate.*report/i);
  });

  test("rejects a newly matching production source and a missing baseline source", () => {
    const { cwd, base } = initializedFixture();
    const proposed = structuredClone(manifest);
    proposed.coverage[0].sourceGlobs.push("packages/example/src/*.ts");
    writeFileSync(
      path.join(cwd, "proofline.harness.json"),
      `${JSON.stringify(proposed, null, 2)}\n`,
    );
    writeFileSync(
      path.join(cwd, "packages/example/src/new-production.ts"),
      "export const added = true;\n",
    );
    expect(() => coverageMain(cwd, { base, head: "HEAD" })).toThrow(/new-production.*baseline/i);

    proposed.coverage[0].exclusions.push({
      glob: "packages/example/src/new-production.ts",
      reason: "Attempted same-change exclusion",
    });
    writeFileSync(
      path.join(cwd, "proofline.harness.json"),
      `${JSON.stringify(proposed, null, 2)}\n`,
    );
    expect(() => coverageMain(cwd, { base, head: "HEAD" })).toThrow(/not proven.*merge base/i);

    rmSync(path.join(cwd, "packages/example/src/new-production.ts"));
    rmSync(path.join(cwd, "packages/example/src/value.ts"));
    expect(() => coverageMain(cwd, { base, head: "HEAD" })).toThrow(
      /value\.ts.*missing.*working tree/i,
    );
  });

  test("rejects escaping and duplicate-normalized report source identities", () => {
    const escaping: Record<string, unknown> = coverageReport();
    escaping["/outside/repository.ts"] = escaping["packages/example/src/value.ts"];
    const { cwd, base } = initializedFixture();
    writeFileSync(
      path.join(cwd, "artifacts/coverage/example/coverage-summary.json"),
      `${JSON.stringify(escaping)}\n`,
    );
    expect(() => coverageMain(cwd, { base, head: "HEAD" })).toThrow(/absolute coverage path/i);

    const absolute = path.join(cwd, "packages/example/src/value.ts");
    writeFileSync(
      path.join(cwd, "artifacts/coverage/example/coverage-summary.json"),
      `${JSON.stringify({
        total: {},
        [absolute]: coverageReport()["packages/example/src/value.ts"],
        "packages/example/src/value.ts": coverageReport()["packages/example/src/value.ts"],
      })}\n`,
    );
    expect(() => coverageMain(cwd, { base, head: "HEAD" })).toThrow(/absolute coverage path/i);

    writeFileSync(
      path.join(cwd, "artifacts/coverage/example/coverage-summary.json"),
      `${JSON.stringify({
        total: {},
        "packages\\example\\src\\value.ts": coverageReport()["packages/example/src/value.ts"],
      })}\n`,
    );
    expect(() => coverageMain(cwd, { base, head: "HEAD" })).toThrow(/backslash coverage path/i);
  });

  test("binds declared coverage provider and version to the executed target", () => {
    const { cwd, base } = initializedFixture();
    writeFileSync(
      path.join(cwd, "packages/example/project.json"),
      `${JSON.stringify({
        name: "example",
        targets: {
          coverage: {
            command:
              "vitest run --coverage --coverage.provider=istanbul --coverage.reporter=json-summary --coverage.reportsDirectory=artifacts/coverage/example",
          },
        },
      })}\n`,
    );
    expect(() => coverageMain(cwd, { base, head: "HEAD" })).toThrow(/provider.*v8/i);

    writeFileSync(
      path.join(cwd, "packages/example/project.json"),
      readFileSync(path.join(cwd, "packages/example/project.json"), "utf8").replace(
        "provider=istanbul",
        "provider=v8",
      ),
    );
    writeFileSync(
      path.join(cwd, "node_modules/@vitest/coverage-v8/package.json"),
      `${JSON.stringify({ name: "@vitest/coverage-v8", version: "4.0.0" })}\n`,
    );
    expect(() => coverageMain(cwd, { base, head: "HEAD" })).toThrow(/version.*3\.2\.7/i);
  });

  test("rejects conflicting duplicate coverage target flags", () => {
    const { cwd, base } = initializedFixture();
    const projectPath = path.join(cwd, "packages/example/project.json");
    const original = readFileSync(projectPath, "utf8");
    for (const conflicting of [
      "--coverage.provider=istanbul",
      "--coverage.reportsDirectory=artifacts/coverage/other",
      "--coverage.include=packages/example/src/other.ts",
      "--coverage.reporter=json-summary",
      "--coverage.exclude=**/*.test.ts",
    ]) {
      const project = JSON.parse(original);
      project.targets.coverage.command += ` ${conflicting}`;
      writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
      expect(() => coverageMain(cwd, { base, head: "HEAD" })).toThrow(
        /exactly one|duplicate.*flag/i,
      );
    }
  });

  test("retains invalid revisions and git-show failures as gate errors", () => {
    const { cwd } = initializedFixture();
    expect(() => coverageMain(cwd, { base: "missing", head: "HEAD" })).toThrow(/unresolved/i);
    const ratchet = JSON.parse(
      readFileSync(path.join(cwd, "artifacts/coverage/ratchet.json"), "utf8"),
    );
    expect(ratchet.errors.join(" ")).toMatch(/unresolved.*base/i);

    runGit(cwd, ["rm", "test-impact/coverage-baseline.json"]);
    const withoutBaseline = commitAll(cwd, "remove baseline");
    expect(() => coverageMain(cwd, { base: withoutBaseline, head: "HEAD" })).toThrow(/git show/i);
  });

  test("recordMain verifies merge-base bytes and changed-path scopes", () => {
    const { cwd, base } = initializedFixture();
    writeFileSync(
      path.join(cwd, "test-impact/execution-record.jsonl"),
      `${recordLine("base")}${recordLine("next", ["packages/example/src/value.ts"])}`,
    );
    writeFileSync(path.join(cwd, "packages/example/src/value.ts"), "export const value = 2;\n");
    expect(() => recordMain(cwd, { base, head: "HEAD" })).not.toThrow();

    writeFileSync(
      path.join(cwd, "test-impact/execution-record.jsonl"),
      `${recordLine("base")}${recordLine("unscoped", ["README.md"])}`,
    );
    expect(() => recordMain(cwd, { base, head: "HEAD" })).toThrow(/value\.ts/);
  });

  test("an_old_or_unrelated_record_cannot_satisfy_a_new_governed_change", () => {
    const { cwd, base } = initializedFixture();
    writeFileSync(path.join(cwd, "README.md"), "changed\n");
    writeFileSync(
      path.join(cwd, "test-impact/execution-record.jsonl"),
      `${recordLine("base")}${recordLine("unrelated", ["docs/TESTING.md"])}`,
    );
    expect(() => recordMain(cwd, { base, head: "HEAD" })).toThrow(/README\.md/);
  });

  test("recordMain governs paths removed from the proposed manifest using base authority", () => {
    const { cwd, base } = initializedFixture();
    const proposed = structuredClone(manifest);
    proposed.ownership[0].glob = "packages/example/src/replacement.ts";
    proposed.ownership[0].entrypoints = ["packages/example/src/replacement.ts"];
    proposed.adapters.api = "packages/example/src/replacement.ts";
    proposed.adapters.auth = "packages/example/src/replacement.ts";
    proposed.adapters.testModeEnvironment = "packages/example/src/replacement.ts";
    writeFileSync(
      path.join(cwd, "proofline.harness.json"),
      `${JSON.stringify(proposed, null, 2)}\n`,
    );
    rmSync(path.join(cwd, "packages/example/src/value.ts"));
    writeFileSync(
      path.join(cwd, "test-impact/execution-record.jsonl"),
      `${recordLine("base")}${recordLine("manifest-only", ["proofline.harness.json"])}`,
    );
    expect(() => recordMain(cwd, { base, head: "HEAD" })).toThrow(/value\.ts/);
  });

  test("recordMain writes revision diagnostics when the proposed record is missing", () => {
    const { cwd, base } = initializedFixture();
    rmSync(path.join(cwd, "test-impact/execution-record.jsonl"));
    expect(() => recordMain(cwd, { base, head: "HEAD" })).toThrow(/execution-record\.jsonl/i);
    const artifact = JSON.parse(
      readFileSync(path.join(cwd, "artifacts/record/check.json"), "utf8"),
    );
    expect(artifact).toMatchObject({
      revisions: {
        requestedBase: base,
        requestedHead: "HEAD",
        resolvedBase: base,
        mergeBase: base,
      },
      errors: [expect.stringMatching(/execution-record\.jsonl/i)],
    });
  });
});

describe("CI governance contract", () => {
  test("resolves trusted manual, pull-request, and push revision authority", () => {
    const { cwd, base } = initializedFixture();
    writeFileSync(path.join(cwd, "packages/example/src/value.ts"), "export const value = 2;\n");
    const head = commitAll(cwd, "head");
    runGit(cwd, ["update-ref", "refs/remotes/origin/main", base]);
    const resolver = path.resolve(
      import.meta.dirname,
      "../../../tools/impact/resolve-ci-revisions.mjs",
    );
    const resolve = ({
      eventName,
      impactBase = "",
      manualBaseRef = "",
    }: {
      eventName: string;
      impactBase?: string;
      manualBaseRef?: string;
    }) =>
      execFileSync(process.execPath, [resolver], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: eventName,
          IMPACT_BASE: impactBase,
          IMPACT_HEAD: head,
          PROOFLINE_MANUAL_BASE_REF: manualBaseRef,
        },
      });

    const expected = `IMPACT_BASE=${base}\nIMPACT_HEAD=${head}\n`;
    expect(resolve({ eventName: "workflow_dispatch", manualBaseRef: "main" })).toBe(expected);
    expect(resolve({ eventName: "pull_request", impactBase: base })).toBe(expected);
    expect(resolve({ eventName: "push", impactBase: base })).toBe(expected);
    expect(() =>
      resolve({ eventName: "workflow_dispatch", manualBaseRef: "feature/untrusted" }),
    ).toThrow();
  });

  test("keeps explicit revisions, validation, full gates, and always-retained diagnostics", () => {
    const workflow = readFileSync(
      path.resolve(import.meta.dirname, "../../../.github/workflows/verify.yml"),
      "utf8",
    );
    const step = (name: string) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return (
        workflow.match(new RegExp(`- name: ${escaped}\\n([\\s\\S]*?)(?=\\n\\s+- name:|$)`))?.[0] ??
        ""
      );
    };
    const dollar = "$";
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toMatch(/base_ref:\n\s+description:.*base/i);
    expect(workflow).toMatch(
      /base_ref:[\s\S]*?type: choice[\s\S]*?options:\n\s+- main\n\s+- master/,
    );
    expect(workflow).toContain(
      `IMPACT_BASE: ${dollar}{{ github.event.pull_request.base.sha || github.event.before }}`,
    );
    const manualFetch = step("Fetch trusted manual impact base");
    expect(manualFetch).toContain("github.event_name == 'workflow_dispatch'");
    expect(manualFetch).toContain('case "$PROOFLINE_MANUAL_BASE_REF" in');
    expect(manualFetch).toContain("main|master)");
    expect(manualFetch.indexOf("case ")).toBeLessThan(manualFetch.indexOf("git fetch"));
    expect(manualFetch).toContain(`refs/remotes/origin/${dollar}{PROOFLINE_MANUAL_BASE_REF}`);
    const revisionResolver = step("Resolve exact CI revision authority");
    expect(revisionResolver).toContain(
      `PROOFLINE_MANUAL_BASE_REF: ${dollar}{{ inputs.base_ref || '' }}`,
    );
    expect(revisionResolver).toContain(
      'node tools/impact/resolve-ci-revisions.mjs >> "$GITHUB_ENV"',
    );
    expect(workflow).toContain("pnpm harness:validate");
    expect(workflow).toContain(
      'pnpm test:impacted -- --dry-run --base "$IMPACT_BASE" --head "$IMPACT_HEAD"',
    );
    expect(workflow).toContain(
      'pnpm coverage:check -- --base "$IMPACT_BASE" --head "$IMPACT_HEAD"',
    );
    expect(workflow).toContain('pnpm record:check -- --base "$IMPACT_BASE" --head "$IMPACT_HEAD"');
    const mandatory = /if: \$\{\{ !cancelled\(\) && steps\.dependencies\.outcome == 'success' \}\}/;
    expect(step("Install Chromium")).toMatch(mandatory);
    expect(step("Run full Vitest safety gate")).toMatch(mandatory);
    expect(step("Run full Vitest safety gate")).toContain("pnpm test");
    expect(step("Run full Chromium safety gate")).toMatch(mandatory);
    expect(step("Run full Chromium safety gate")).toContain("pnpm e2e");
    expect(workflow).toContain("git diff --check");
    expect(workflow).toContain("PROOFLINE_CROSS_BROWSER");
    expect(workflow).toContain("playwright install --with-deps firefox webkit");
    expect(workflow).toContain("--project=firefox --project=webkit");
    expect(step("Upload coverage baseline")).toMatch(/if: \$\{\{ always\(\) \}\}/);
    const diagnostics = step("Upload immutable verification diagnostics");
    expect(diagnostics).toMatch(/if: \$\{\{ always\(\) \}\}/);
    for (const retained of [
      "artifacts/harness/",
      "artifacts/impact/",
      "artifacts/record/",
      "artifacts/coverage/",
      "artifacts/vitest-output.txt",
      "artifacts/browser-output.txt",
      "playwright-report/",
      "test-results/",
    ])
      expect(diagnostics).toContain(retained);
    expect(workflow).not.toContain("all-tests");
  });
});
