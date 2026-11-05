import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error Native JavaScript runtime API
import { productionAuditOptions } from "../check-production.mjs";
// @ts-expect-error Native JavaScript runtime API
import * as portability from "../validate-portability.mjs";

const { assertCopiedCore, prepareTarget, validatePortabilityResult } = portability;

const nativeFixture = () => {
  const snapshot = JSON.parse(
    readFileSync("tools/proofline/test-fixtures/portability-native.json", "utf8"),
  );
  const artifactRoot = mkdtempSync(path.join(os.tmpdir(), "proofline-native-portability-"));
  const record = structuredClone(snapshot.record);
  record.artifacts = artifactRoot;
  record.repository = process.env.GITHUB_REPOSITORY ?? null;
  record.workflow = process.env.GITHUB_WORKFLOW_REF ?? null;
  const hash = (file: string) =>
    createHash("sha256")
      .update(readFileSync(path.join(artifactRoot, file)))
      .digest("hex");
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(artifactRoot, file)), { recursive: true });
    writeFileSync(path.join(artifactRoot, file), content);
  };
  for (const [file, content] of Object.entries(snapshot.files)) write(file, content as string);
  const prefix = "artifacts/proofline/";
  const entries = snapshot.files[`${prefix}execution-index.jsonl`]
    .trim()
    .split("\n")
    .map(JSON.parse);
  const records = entries.map((entry: { verification: string }) =>
    JSON.parse(snapshot.files[prefix + entry.verification]),
  );
  const aggregate = records.find((item: { runner: string }) => item.runner === "aggregate");
  const unitIds = new Set(
    aggregate.children.map((entry: { invocationId: string }) => entry.invocationId),
  );
  for (const native of records) {
    const gate =
      native.runner === "aggregate" || unitIds.has(native.invocationId)
        ? "unit"
        : native.sourceCommit === record.source.head
          ? "selected"
          : native.sourceCommit === record.source.verifiedHead
            ? native.runner === "playwright"
              ? "browser"
              : "coverage"
            : "initial-coverage";
    if (gate === "initial-coverage") record.source.bootstrap = native.sourceCommit;
    if (native.runner === "vitest")
      native.argv[1] = path.join(native.repositoryRoot, "tools/proofline/vitest-execution.mjs");
    native.repository = record.repository;
    native.workflow = record.workflow;
    native.sessionId = record.sessionId;
    native.ciRunId = record.ciRunId;
    native.ciRunAttempt = record.ciRunAttempt;
    native.gateKey = `portability:${gate}`;
    native.gateExecutionId = `${record.gateExecutionId}:${gate}`;
  }
  const seal = () => {
    for (const native of records.filter((item: { runner: string }) => item.runner !== "aggregate"))
      write(
        `${prefix}runs/${native.invocationId}/verification.json`,
        `${JSON.stringify(native)}\n`,
      );
    for (const native of records.filter(
      (item: { runner: string }) => item.runner === "aggregate",
    )) {
      for (const child of native.children ?? []) child.sha256 = hash(prefix + child.verification);
      write(
        `${prefix}runs/${native.invocationId}/verification.json`,
        `${JSON.stringify(native)}\n`,
      );
    }
    for (const entry of entries) entry.sha256 = hash(prefix + entry.verification);
    write(
      `${prefix}execution-index.jsonl`,
      `${entries.map((entry: unknown) => JSON.stringify(entry)).join("\n")}\n`,
    );
    record.executionGates = {
      unit: entries.find(
        (entry: { invocationId: string }) => entry.invocationId === aggregate.invocationId,
      ),
      browser: entries.find((entry: { invocationId: string }) =>
        records.some(
          (item: { invocationId: string; gateKey: string }) =>
            item.invocationId === entry.invocationId && item.gateKey === "portability:browser",
        ),
      ),
      coverage: entries.find((entry: { invocationId: string }) =>
        records.some(
          (item: { invocationId: string; gateKey: string }) =>
            item.invocationId === entry.invocationId && item.gateKey === "portability:coverage",
        ),
      ),
      selected: entries.filter((entry: { invocationId: string }) =>
        records.some(
          (item: { invocationId: string; gateKey: string }) =>
            item.invocationId === entry.invocationId && item.gateKey === "portability:selected",
        ),
      ),
    };
    for (const gate of record.gates) {
      gate.logPath = path.basename(gate.log);
      gate.logSha256 = hash(gate.logPath);
    }
    record.evidenceHashes = Object.fromEntries(
      portability.requiredPortabilityEvidence.map((file: string) => [file, hash(file)]),
    );
    record.nativeArtifactHashes = Object.fromEntries(
      records.flatMap((native: { artifacts?: Record<string, string> }) =>
        Object.values(native.artifacts ?? {}).map((file) => [
          `${prefix}${file}`,
          hash(prefix + file),
        ]),
      ),
    );
  };
  seal();
  return {
    record,
    artifactRoot,
    records,
    prefix,
    seal,
    write,
    hash,
    close: () => rmSync(artifactRoot, { recursive: true, force: true }),
  };
};

describe("Proofline standalone portability", () => {
  it("rejects_modified_reusable_core_in_the_target", () => {
    const source = mkdtempSync(path.join(os.tmpdir(), "proofline-source-"));
    const target = mkdtempSync(path.join(os.tmpdir(), "proofline-target-"));
    for (const directory of [source, target]) mkdirSync(path.join(directory, "tools"));
    writeFileSync(path.join(source, "tools/core.mjs"), "export const invariant = true;\n");
    writeFileSync(path.join(target, "tools/core.mjs"), "export const invariant = false;\n");
    try {
      expect(() => assertCopiedCore(source, target, ["tools/core.mjs"])).toThrow(
        /changed|mismatch/i,
      );
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("copies_a_standalone_target_with_byte_identical_core_and_no_CRM_product", () => {
    const prepared = prepareTarget();
    try {
      expect(prepared.target.startsWith(process.cwd())).toBe(false);
      expect(Object.keys(prepared.hashes)).toContain("tools/proofline/canonical-runner.mjs");
      expect(assertCopiedCore(process.cwd(), prepared.target, prepared.files)).toEqual(
        prepared.hashes,
      );
      expect(
        JSON.parse(readFileSync(path.join(prepared.target, "package.json"), "utf8")).name,
      ).toBe("proofline-work-orders-portability");
      writeFileSync(path.join(prepared.target, "tools/proofline/canonical-runner.mjs"), "changed");
      expect(() => assertCopiedCore(process.cwd(), prepared.target, prepared.files)).toThrow(
        /changed/,
      );
      expect(() => prepareTarget({ temporaryRoot: process.cwd() })).toThrow(/outside/);
    } finally {
      rmSync(prepared.target, { recursive: true, force: true });
    }
  });

  it("rejects_absent_gates_and_unsupported_compatibility_metadata", () => {
    expect(() => validatePortabilityResult({ version: 1, outcome: "passed" })).toThrow();
    expect(() => validatePortabilityResult({ version: 99 })).toThrow();
  });

  it("rejects_missing_retained_evidence_after_valid_result_metadata", () => {
    const plausible = {
      version: 1,
      outcome: "passed",
      target: process.cwd(),
      artifacts: process.cwd(),
      compatibility: {
        node: "v24.22.1",
        vite: "6.4.3",
        vitest: "3.2.7",
        react: "19.2.8",
        playwright: "1.62.1",
        browser: "chromium",
      },
      coreHashes: { "tools/core.mjs": "a".repeat(64) },
      gates: portability.requiredPortabilityGates.map((key: string) => ({
        key,
        exitCode: 0,
        log: "missing.log",
      })),
      selection: { fallback: "none", vitest: 2, playwright: 4 },
      source: { base: "a".repeat(40), head: "b".repeat(40), verifiedHead: "c".repeat(40) },
    };
    expect(() => validatePortabilityResult(plausible)).toThrow(/Missing or changed retained/);
    expect(() =>
      validatePortabilityResult({
        ...plausible,
        compatibility: { ...plausible.compatibility, browser: "webkit" },
      }),
    ).toThrow(/unsupported/);
    expect(() =>
      validatePortabilityResult({ ...plausible, gates: plausible.gates.slice(1) }),
    ).toThrow(/unsupported/);
    expect(() =>
      validatePortabilityResult({ ...plausible, gates: [...plausible.gates, plausible.gates[0]] }),
    ).toThrow(/unsupported/);
  });

  it("rejects_missing_or_escaping_production_metadata", () => {
    expect(() => productionAuditOptions({}, process.cwd())).toThrow(/production/i);
    expect(() =>
      productionAuditOptions(
        { production: { directory: "../escape", forbiddenModules: [] } },
        process.cwd(),
      ),
    ).toThrow();
    expect(
      productionAuditOptions(
        {
          adapters: {
            testModeEnvironment: "checks/auth.mjs",
            auth: "checks/auth.mjs",
            api: "checks/auth.mjs",
            providers: [],
          },
          production: { directory: "dist/desk", forbiddenModules: ["checks/auth.mjs"] },
        },
        process.cwd(),
      ),
    ).toEqual({
      directory: path.resolve("dist/desk"),
      forbiddenModules: ["checks/auth.mjs"],
      repositoryRoot: process.cwd(),
    });
  });

  it("always_audits_declared_adapters_even_when_extra_module_metadata_omits_them", () => {
    const options = productionAuditOptions({
      adapters: {
        testModeEnvironment: "checks/entry.mjs",
        auth: "checks/auth.mjs",
        api: "checks/api.mjs",
        providers: ["checks/provider.mjs"],
      },
      production: { directory: "dist/desk", forbiddenModules: ["checks/extra.mjs"] },
    });
    expect(options.forbiddenModules).toEqual([
      "checks/extra.mjs",
      "checks/entry.mjs",
      "checks/auth.mjs",
      "checks/api.mjs",
      "checks/provider.mjs",
    ]);
  });

  it("declares_target_owned_execution_and_production_paths", () => {
    const manifest = JSON.parse(
      readFileSync("examples/work-orders/proofline.harness.json", "utf8"),
    );
    expect(manifest.execution.unitTargets[0].argv).toEqual([
      "run",
      "--config",
      "client/vitest.config.mjs",
    ]);
    expect(manifest.execution.browserArgs).toEqual([
      "test",
      "--config",
      "checks/browser/playwright.config.mjs",
    ]);
    expect(manifest.production.directory).toBe("dist/work-orders");
    expect(JSON.stringify(manifest)).not.toMatch(/crm|POL-001|FIN-001/);
  });
  it("rejects_missing_or_tampered_native_artifacts_from_valid_relocated_evidence", () => {
    for (const [runner, artifact] of [
      ["vitest", "nativeReport"],
      ["vitest", "nativeEvents"],
      ["vitest", "discovery"],
      ["playwright", "nativeReport"],
      ["playwright", "stdout"],
    ]) {
      const fixture = nativeFixture();
      try {
        expect(() =>
          validatePortabilityResult(fixture.record, {
            artifactRoot: fixture.artifactRoot,
            checkLogs: false,
          }),
        ).not.toThrow();
        const unit = fixture.records.find((item: { runner: string }) => item.runner === runner);
        rmSync(path.join(fixture.artifactRoot, fixture.prefix, unit.artifacts[artifact]));
        expect(() =>
          validatePortabilityResult(fixture.record, {
            artifactRoot: fixture.artifactRoot,
            checkLogs: false,
          }),
        ).toThrow();
      } finally {
        fixture.close();
      }
    }
    const fixture = nativeFixture();
    try {
      const browser = fixture.records.find(
        (item: { runner: string; scope: string }) =>
          item.runner === "playwright" && item.scope === "full",
      );
      fixture.write(
        fixture.prefix + browser.artifacts.nativeReport,
        JSON.stringify({ suites: [] }),
      );
      fixture.seal();
      expect(() =>
        validatePortabilityResult(fixture.record, {
          artifactRoot: fixture.artifactRoot,
          checkLogs: false,
        }),
      ).toThrow();
    } finally {
      fixture.close();
    }
    const eventsFixture = nativeFixture();
    try {
      const unit = eventsFixture.records.find(
        (item: { runner: string }) => item.runner === "vitest",
      );
      const file = eventsFixture.prefix + unit.artifacts.nativeEvents;
      const events = JSON.parse(readFileSync(path.join(eventsFixture.artifactRoot, file), "utf8"));
      events.tests[0].expectedStatus = "failed";
      eventsFixture.write(file, JSON.stringify(events));
      eventsFixture.seal();
      expect(() =>
        validatePortabilityResult(eventsFixture.record, {
          artifactRoot: eventsFixture.artifactRoot,
          checkLogs: false,
        }),
      ).toThrow(/reconcile/);
    } finally {
      eventsFixture.close();
    }
  });

  it("rejects_stale_native_context_and_summary_only_portability_substitutions", () => {
    for (const mutation of ["session", "run", "summary", "child", "source", "gate"]) {
      const fixture = nativeFixture();
      try {
        expect(() =>
          validatePortabilityResult(fixture.record, {
            artifactRoot: fixture.artifactRoot,
            checkLogs: false,
          }),
        ).not.toThrow();
        const aggregate = fixture.records.find(
          (item: { runner: string }) => item.runner === "aggregate",
        );
        const browser = fixture.records.find(
          (item: { runner: string; scope: string }) =>
            item.runner === "playwright" && item.scope === "full",
        );
        if (mutation === "session") browser.sessionId = "stale-session";
        if (mutation === "run") browser.ciRunAttempt = "stale-attempt";
        if (mutation === "source") browser.sourceCommit = "a".repeat(40);
        if (mutation === "gate") browser.gateExecutionId = "stale-gate";
        if (mutation === "child") aggregate.children = [];
        if (mutation === "summary") {
          for (const item of [aggregate, browser]) {
            const { runner, scope, sourceCommit, outcome, invocationId } = item;
            for (const key of Object.keys(item)) delete item[key];
            Object.assign(item, { runner, scope, sourceCommit, outcome, invocationId });
          }
        }
        fixture.seal();
        expect(() =>
          validatePortabilityResult(fixture.record, {
            artifactRoot: fixture.artifactRoot,
            checkLogs: false,
          }),
        ).toThrow();
      } finally {
        fixture.close();
      }
    }
  });

  it("binds_relocated_native_evidence_to_external_host_authority_and_child_hashes", () => {
    const fixture = nativeFixture();
    try {
      const authority = {
        repository: fixture.record.repository,
        workflow: fixture.record.workflow,
        sourceCommit: fixture.record.sourceCommit,
        sessionId: fixture.record.sessionId,
        ciRunId: fixture.record.ciRunId,
        ciRunAttempt: fixture.record.ciRunAttempt,
        gateKey: fixture.record.gateKey,
        gateExecutionId: fixture.record.gateExecutionId,
      };
      const options = { artifactRoot: fixture.artifactRoot, checkLogs: false, authority };
      expect(() => validatePortabilityResult(fixture.record, options)).not.toThrow();
      expect(() =>
        validatePortabilityResult(fixture.record, {
          ...options,
          authority: { ...authority, sessionId: "another-session" },
        }),
      ).toThrow(/host.*context/);
      fixture.record.executionGates.unit.sha256 = "0".repeat(64);
      expect(() => validatePortabilityResult(fixture.record, options)).toThrow(/reference/);
    } finally {
      fixture.close();
    }
  });
  it("rejects_foreign_native_repository_and_workflow_after_complete_rehash", () => {
    for (const field of ["repository", "workflow"]) {
      const fixture = nativeFixture();
      try {
        const options = { artifactRoot: fixture.artifactRoot, checkLogs: false };
        expect(() => validatePortabilityResult(fixture.record, options)).not.toThrow();
        const browser = fixture.records.find(
          (item: { runner: string; scope: string }) =>
            item.runner === "playwright" && item.scope === "full",
        );
        browser[field] =
          field === "repository"
            ? "foreign/checkout"
            : "foreign/checkout/.github/workflows/other.yml@refs/heads/main";
        fixture.seal();
        expect(() => validatePortabilityResult(fixture.record, options)).toThrow();
      } finally {
        fixture.close();
      }
    }
  });

  it("rejects_missing_or_substituted_instrumented_argv_after_complete_rehash", () => {
    for (const mutation of ["delete", "substitute"]) {
      const fixture = nativeFixture();
      try {
        const options = { artifactRoot: fixture.artifactRoot, checkLogs: false };
        expect(() => validatePortabilityResult(fixture.record, options)).not.toThrow();
        const browser = fixture.records.find(
          (item: { runner: string; scope: string }) =>
            item.runner === "playwright" && item.scope === "full",
        );
        if (mutation === "delete") delete browser.argv;
        else browser.argv = [process.execPath, "foreign-runner.mjs", "test"];
        fixture.seal();
        expect(() => validatePortabilityResult(fixture.record, options)).toThrow();
      } finally {
        fixture.close();
      }
    }
  });
  it("rejects_null_repository_claim_when_actual_host_context_is_nonlocal", () => {
    const fixture = nativeFixture();
    const beforeRepository = process.env.GITHUB_REPOSITORY;
    const beforeWorkflow = process.env.GITHUB_WORKFLOW_REF;
    try {
      fixture.record.repository = null;
      fixture.record.workflow = null;
      for (const native of fixture.records) {
        native.repository = null;
        native.workflow = null;
      }
      fixture.seal();
      process.env.GITHUB_REPOSITORY = "trusted/current";
      process.env.GITHUB_WORKFLOW_REF =
        "trusted/current/.github/workflows/verify.yml@refs/heads/main";
      const authority = {
        sourceCommit: fixture.record.sourceCommit,
        sessionId: fixture.record.sessionId,
        ciRunId: fixture.record.ciRunId,
        ciRunAttempt: fixture.record.ciRunAttempt,
        gateKey: fixture.record.gateKey,
        gateExecutionId: fixture.record.gateExecutionId,
        repository: null,
        workflow: null,
      };
      expect(() =>
        validatePortabilityResult(fixture.record, {
          artifactRoot: fixture.artifactRoot,
          checkLogs: false,
          authority,
        }),
      ).toThrow(/trusted.*context/);
    } finally {
      if (beforeRepository === undefined) delete process.env.GITHUB_REPOSITORY;
      else process.env.GITHUB_REPOSITORY = beforeRepository;
      if (beforeWorkflow === undefined) delete process.env.GITHUB_WORKFLOW_REF;
      else process.env.GITHUB_WORKFLOW_REF = beforeWorkflow;
      fixture.close();
    }
  });
});
