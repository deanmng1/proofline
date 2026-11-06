import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
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

const independentInstallation = (fixture: ReturnType<typeof nativeFixture>) => {
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

  it("prepares_independent_dependencies_without_copying_or_linking_host_modules", () => {
    const prepared = prepareTarget({ dependencyMode: "independent" });
    try {
      expect(prepared.dependencyMode).toBe("independent");
      expect(existsSync(path.join(prepared.target, "node_modules"))).toBe(false);
      expect(assertCopiedCore(process.cwd(), prepared.target, prepared.files)).toEqual(
        prepared.hashes,
      );
      const manifest = JSON.parse(readFileSync(path.join(prepared.target, "package.json"), "utf8"));
      const declared = { ...manifest.dependencies, ...manifest.devDependencies };
      const imported = new Set<string>();
      for (const file of prepared.files) {
        const source = ts.createSourceFile(
          file,
          readFileSync(path.join(prepared.target, file), "utf8"),
          ts.ScriptTarget.Latest,
          true,
        );
        const visit = (node: ts.Node) => {
          if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
          ) {
            const name = node.moduleSpecifier.text;
            if (!name.startsWith(".") && !name.startsWith("node:"))
              imported.add(
                name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0],
              );
          }
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
      for (const dependency of imported) expect(declared[dependency]).toMatch(/^\d+\.\d+\.\d+$/);
      expect(manifest.packageManager).toBe("pnpm@11.24.0");
      expect(manifest.engines.node).toBe(">=24.22.1 <25");
      expect(readFileSync(path.join(prepared.target, "pnpm-workspace.yaml"), "utf8")).toMatch(
        /allowBuilds:\n {2}esbuild: true/,
      );
      expect(readFileSync(path.join(prepared.target, "pnpm-lock.yaml"), "utf8")).toMatch(/zod:/);
    } finally {
      rmSync(prepared.target, { recursive: true, force: true });
    }
  });

  it("retains_explicit_offline_reuse_and_rejects_unknown_dependency_modes", () => {
    const prepared = prepareTarget();
    try {
      expect(prepared.dependencyMode).toBe("reuse");
      expect(lstatSync(path.join(prepared.target, "node_modules")).isSymbolicLink()).toBe(true);
      expect(realpathSync(path.join(prepared.target, "node_modules"))).toBe(
        realpathSync("node_modules"),
      );
      expect(() => prepareTarget({ dependencyMode: "automatic" })).toThrow(/dependency mode/);
    } finally {
      rmSync(prepared.target, { recursive: true, force: true });
    }
  });

  it("does_not_copy_example_dependency_links_and_fails_reuse_without_source_dependencies", () => {
    const source = mkdtempSync(path.join(os.tmpdir(), "proofline-copy-source-"));
    mkdirSync(path.join(source, "examples/work-orders"), { recursive: true });
    mkdirSync(path.join(source, "tools/impact"), { recursive: true });
    mkdirSync(path.join(source, "tools/proofline"), { recursive: true });
    writeFileSync(path.join(source, "tools/impact/core.ts"), "export const portable = true;\n");
    symlinkSync(
      realpathSync("node_modules"),
      path.join(source, "examples/work-orders/node_modules"),
      "dir",
    );
    let prepared: ReturnType<typeof prepareTarget> | undefined;
    try {
      prepared = prepareTarget({ repositoryRoot: source, dependencyMode: "independent" });
      expect(existsSync(path.join(prepared.target, "node_modules"))).toBe(false);
      expect(() => prepareTarget({ repositoryRoot: source })).toThrow(
        /dependencies.*missing|missing.*dependencies/i,
      );
    } finally {
      if (prepared) rmSync(prepared.target, { recursive: true, force: true });
      rmSync(source, { recursive: true, force: true });
    }
  });

  it("requires_explicit_network_setup_and_initializes_clone_complete_target_history", () => {
    expect(portability.parsePortabilityOptions([])).toEqual({
      dependencyMode: "reuse",
      prepareOnly: false,
    });
    expect(portability.parsePortabilityOptions(["--independent-install"])).toEqual({
      dependencyMode: "independent",
      prepareOnly: false,
    });
    expect(portability.parsePortabilityOptions(["--", "--independent-install"])).toEqual({
      dependencyMode: "independent",
      prepareOnly: false,
    });
    expect(
      portability.parsePortabilityOptions(["--prepare-only", "--dependency-mode", "independent"]),
    ).toEqual({ dependencyMode: "independent", prepareOnly: true });
    for (const args of [
      ["--dependency-mode", "independent"],
      ["--unknown"],
      ["--", "--", "--independent-install"],
      ["--", "--dependency-mode", "reuse", "--independent-install"],
      ["--independent-install", "--prepare-only"],
    ])
      expect(() => portability.parsePortabilityOptions(args)).toThrow();
    const prepared = prepareTarget({ dependencyMode: "independent" });
    try {
      const bootstrap = portability.initializeTarget(prepared.target);
      expect(bootstrap).toMatch(/^[a-f0-9]{40}$/);
      expect(existsSync(path.join(prepared.target, ".git/HEAD"))).toBe(true);
      expect(readFileSync(path.join(prepared.target, "test-impact/rules.md"), "utf8")).toContain(
        "WORK-001",
      );
      expect(
        readFileSync(path.join(prepared.target, "docs/PORTABLE_TEST_AUTOMATION.md"), "utf8"),
      ).toContain("coverageCheck");
      const record = readFileSync(
        path.join(prepared.target, "test-impact/execution-record.jsonl"),
        "utf8",
      );
      expect(record.endsWith("\n")).toBe(true);
      expect(JSON.parse(record.trim()).eventId).toBe("work-orders-adaptation");
      expect(() => portability.initializeTarget(prepared.target)).toThrow(/already initialized/);
      expect(
        readFileSync(path.join(prepared.target, "test-impact/execution-record.jsonl"), "utf8"),
      ).toBe(record);
    } finally {
      rmSync(prepared.target, { recursive: true, force: true });
    }
  });

  it("validates_relocated_independent_setup_and_rejects_rehashed_false_installation_claims", () => {
    for (const mutation of [
      "mode",
      "missing-mode",
      "host-link",
      "escape",
      "missing-package",
      "missing-setup",
      "version",
      "registry",
      "duplicate",
      "cwd",
      "frozen",
      "npm-script",
      "browser",
      "missing-log",
      "hash",
      "log-argv",
      "unsafe-log",
      "setup-in-target",
    ]) {
      const fixture = nativeFixture();
      try {
        independentInstallation(fixture);
        const options = { artifactRoot: fixture.artifactRoot, checkLogs: false };
        expect(() => validatePortabilityResult(fixture.record, options)).not.toThrow();
        const record = fixture.record;
        const dependency = record.installation[1];
        if (mutation === "mode") record.dependencyMode = "automatic";
        if (mutation === "missing-mode") delete record.dependencyMode;
        if (mutation === "host-link") record.preparation.hostLinked = true;
        if (mutation === "escape")
          record.preparation.resolvedPackages.zod = "../host/node_modules/zod";
        if (mutation === "missing-package") delete record.preparation.resolvedPackages.zod;
        if (mutation === "missing-setup") delete record.setup;
        if (mutation === "version") record.setup.packageManagerVersion = "11.25.0";
        if (mutation === "registry")
          dependency.argv[dependency.argv.length - 1] = "https://unreviewed.example";
        if (mutation === "duplicate") record.installation[2] = structuredClone(dependency);
        if (mutation === "cwd") dependency.cwd = "/host";
        if (mutation === "frozen")
          dependency.argv.splice(dependency.argv.indexOf("--frozen-lockfile"), 1);
        if (mutation === "npm-script") record.installation[0].argv.splice(6, 1);
        if (mutation === "browser") record.installation[2].argv[5] = "firefox";
        if (mutation === "missing-log") rmSync(path.join(fixture.artifactRoot, dependency.logPath));
        if (mutation === "hash") dependency.logSha256 = "a".repeat(64);
        if (mutation === "log-argv")
          fixture.write(dependency.logPath, "Unrelated successful output.\n");
        if (mutation === "unsafe-log") dependency.logPath = "../outside.log";
        if (mutation === "setup-in-target") record.setup.root = path.join(record.target, "setup");
        if (["registry", "frozen", "npm-script", "browser", "log-argv"].includes(mutation)) {
          if (mutation !== "log-argv")
            for (const install of record.installation)
              fixture.write(
                install.logPath,
                `$ ${JSON.stringify(install.argv)}\nSetup completed.\n`,
              );
          for (const install of record.installation)
            install.logSha256 = fixture.hash(install.logPath);
        }
        expect(() => validatePortabilityResult(record, options), mutation).toThrow();
      } finally {
        fixture.close();
      }
    }
  });

  it("keeps_historical_evidence_compatible_and_rejects_reuse_with_independent_setup_claims", () => {
    const fixture = nativeFixture();
    try {
      const options = { artifactRoot: fixture.artifactRoot, checkLogs: false };
      expect(() => validatePortabilityResult(fixture.record, options)).not.toThrow();
      fixture.record.dependencyMode = "reuse";
      fixture.record.installation = [];
      fixture.record.preparation = {
        dependencyDirectory: "node_modules",
        hostLinked: true,
        resolvedPackages: {},
      };
      expect(() => validatePortabilityResult(fixture.record, options)).not.toThrow();
      fixture.record.preparation.hostLinked = false;
      expect(() => validatePortabilityResult(fixture.record, options)).toThrow();
      independentInstallation(fixture);
      fixture.record.dependencyMode = "reuse";
      expect(() => validatePortabilityResult(fixture.record, options)).toThrow();
    } finally {
      fixture.close();
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
  it("verifies_relocated_local_evidence_without_inheriting_CI_checkout_identity", () => {
    const beforeRepository = process.env.GITHUB_REPOSITORY;
    const beforeWorkflow = process.env.GITHUB_WORKFLOW_REF;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_WORKFLOW_REF;
    let fixture: ReturnType<typeof nativeFixture> | undefined;
    try {
      fixture = nativeFixture();
      const { record, artifactRoot } = fixture;
      expect(record.repository).toBeNull();
      expect(record.workflow).toBeNull();
      expect(() =>
        validatePortabilityResult(record, {
          artifactRoot,
          checkLogs: false,
        }),
      ).not.toThrow();
    } finally {
      fixture?.close();
      if (beforeRepository === undefined) delete process.env.GITHUB_REPOSITORY;
      else process.env.GITHUB_REPOSITORY = beforeRepository;
      if (beforeWorkflow === undefined) delete process.env.GITHUB_WORKFLOW_REF;
      else process.env.GITHUB_WORKFLOW_REF = beforeWorkflow;
    }
  });

  it("rejects_incomplete_runtime_compatibility_and_missing_relocation_destination", () => {
    for (const missing of ["node", "react", "artifactRoot"]) {
      const fixture = nativeFixture();
      try {
        const options = { artifactRoot: fixture.artifactRoot, checkLogs: false };
        expect(() => validatePortabilityResult(fixture.record, options)).not.toThrow();
        if (missing === "artifactRoot") {
          delete fixture.record.artifacts;
          expect(() => validatePortabilityResult(fixture.record, { checkLogs: false })).toThrow(
            /retained target evidence/,
          );
        } else {
          delete fixture.record.compatibility[missing];
          expect(() => validatePortabilityResult(fixture.record, options)).toThrow(
            /unsupported portability evidence/,
          );
        }
      } finally {
        fixture.close();
      }
    }
  });

  it("rejects_a_rehashed_failed_coverage_diagnostic_despite_passing_gate_summaries", () => {
    const fixture = nativeFixture();
    try {
      const options = { artifactRoot: fixture.artifactRoot, checkLogs: false };
      expect(() => validatePortabilityResult(fixture.record, options)).not.toThrow();
      const report = "artifacts/coverage/ratchet.json";
      const diagnostic = JSON.parse(readFileSync(path.join(fixture.artifactRoot, report), "utf8"));
      diagnostic.errors = ["Required coverage baseline is missing"];
      fixture.write(report, JSON.stringify(diagnostic));
      fixture.record.evidenceHashes[report] = fixture.hash(report);
      expect(() => validatePortabilityResult(fixture.record, options)).toThrow(
        /Failed target evidence artifacts\/coverage\/ratchet\.json/,
      );
    } finally {
      fixture.close();
    }
  });

  it("requires_original_invocation_logs_when_local_path_validation_is_requested", () => {
    const fixture = nativeFixture();
    try {
      for (const gate of fixture.record.gates)
        gate.log = path.join(fixture.artifactRoot, gate.logPath);
      expect(() => validatePortabilityResult(fixture.record)).not.toThrow();
      rmSync(path.join(fixture.artifactRoot, "unit.log"));
      expect(() => validatePortabilityResult(fixture.record)).toThrow(/retained target evidence/);
    } finally {
      fixture.close();
    }
  });

  it("rejects_rehashed_type_confusion_in_aggregate_project_identity", () => {
    const fixture = nativeFixture();
    try {
      const options = { artifactRoot: fixture.artifactRoot, checkLogs: false };
      expect(() => validatePortabilityResult(fixture.record, options)).not.toThrow();
      const aggregate = fixture.records.find(
        (item: { runner: string }) => item.runner === "aggregate",
      );
      aggregate.expected[0].project = 42;
      fixture.seal();
      expect(() => validatePortabilityResult(fixture.record, options)).toThrow(
        /identity.*contract/,
      );
    } finally {
      fixture.close();
    }
  });
});

describe("additive native runtime provenance", () => {
  it("accepts strict producer runtime while retaining legacy work-orders metadata", () => {
    const fixture = nativeFixture();
    try {
      expect(
        validatePortabilityResult(fixture.record, {
          artifactRoot: fixture.artifactRoot,
          checkLogs: false,
        }),
      ).toBe(fixture.record);
      for (const native of fixture.records)
        native.metadata.runtime = {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          execPath: process.execPath,
        };
      fixture.seal();
      expect(
        validatePortabilityResult(fixture.record, {
          artifactRoot: fixture.artifactRoot,
          checkLogs: false,
        }),
      ).toBe(fixture.record);
    } finally {
      fixture.close();
    }
  });
  it("rejects unknown metadata and malformed additive runtime", () => {
    for (const mutation of [
      "unknown",
      "missing",
      "extra",
      "node",
      "path",
      "arch",
      "platform",
      "null",
    ]) {
      const fixture = nativeFixture();
      try {
        const aggregate = fixture.records.find(
          (native: { runner: string }) => native.runner === "aggregate",
        );
        aggregate.metadata.runtime = {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          execPath: process.execPath,
        };
        if (mutation === "unknown") aggregate.metadata.surprise = true;
        if (mutation === "missing") delete aggregate.metadata.runtime.arch;
        if (mutation === "extra") aggregate.metadata.runtime.verified = true;
        if (mutation === "node") aggregate.metadata.runtime.nodeVersion = "24.22.1";
        if (mutation === "path") aggregate.metadata.runtime.execPath = "node";
        if (mutation === "arch") aggregate.metadata.runtime.arch = "";
        if (mutation === "platform") aggregate.metadata.runtime.platform = "";
        if (mutation === "null") aggregate.metadata.runtime = null;
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
});
