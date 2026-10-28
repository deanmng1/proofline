import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { validateHarness } from "./harness-manifest.ts";
import { main } from "./main.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const fixture = () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "harness-manifest-"));
  roots.push(cwd);
  const write = (file: string, value: unknown) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), typeof value === "string" ? value : JSON.stringify(value));
  };
  write("package.json", {
    scripts: { check: "node -e \"require('fs').writeFileSync('EXECUTED', 'bad')\"" },
  });
  write("app/project.json", { name: "fixture", root: "app", targets: { test: {}, e2e: {} } });
  write("app/src/value.ts", "export const value = 1;");
  write(
    "app/src/value.test.ts",
    'import { describe, test } from "vitest";\ndescribe("values", () => {\n  test("works", () => {});\n});\n',
  );
  write(
    "app/src/value.spec.ts",
    'import { test } from "@playwright/test";\ntest("@smoke visible", () => {});\n',
  );
  const lifecycle = {
    version: 1,
    unchangedStateConvention: "null-or-same",
    rows: [
      {
        state: "quoted",
        operation: "bind",
        role: "agent",
        tenantScope: "own",
        expectedResult: "accepted",
        nextState: "bound",
        ruleIds: ["RULE-001"],
        testLayer: "service",
      },
    ],
  };
  const golden = {
    version: 1,
    tenantIsolationMode: "authenticated-contexts",
    rows: [
      {
        id: "journey",
        status: "planned",
        adapterSetup: ["fresh authenticated scenario"],
        userActions: ["click bind"],
        urlTransitions: ["/quotes", "/policies/1"],
        visibleAssertions: ["Policy bound heading"],
        persistedInvariants: ["one policy"],
        ruleIds: ["RULE-001"],
        exclusions: [],
      },
    ],
  };
  write("lifecycle.json", lifecycle);
  write("golden.json", golden);
  const command = { argv: ["pnpm", "check"], cwd: "." };
  const manifest = {
    version: 1,
    commands: {
      lint: command,
      typecheck: command,
      unit: command,
      browser: command,
      coverage: command,
      coverageCheck: command,
      recordCheck: command,
      serve: command,
    },
    workspaces: [
      { path: "app", unitCommand: "unit", browserCommands: ["browser"], browserOptOutReason: "" },
    ],
    browser: {
      projects: ["chromium"],
      crossBrowserSmokeProjects: [],
      localOrigins: ["http://127.0.0.1"],
      testEntrypoint: "serve",
    },
    adapters: {
      testModeEnvironment: "app/src/value.ts",
      auth: "app/src/value.ts",
      api: "app/src/value.ts",
      providers: [],
    },
    coverage: [
      {
        workspace: "app",
        provider: "v8",
        providerVersion: "3.2.7",
        sourceGlobs: ["app/src/**/*.ts"],
        exclusions: [{ glob: "app/src/**/*.test.ts", reason: "tests" }],
        report: "artifacts/coverage/app/coverage-summary.json",
        reportFormat: "istanbul-json-summary",
        metrics: ["lines", "functions", "branches", "statements"],
        aggregation: "per-file",
      },
    ],
    ownership: [
      {
        glob: "app/src/**",
        entrypoints: ["app/src/value.ts"],
        ruleIds: ["RULE-001"],
        layers: ["service", "playwright"],
        ruleLayers: [
          { ruleId: "RULE-001", layer: "service" },
          { ruleId: "RULE-001", layer: "playwright" },
        ],
        testBindings: [
          {
            ruleId: "RULE-001",
            layer: "service",
            testId: "rule-unit",
            commandKey: "unit",
            runner: "vitest",
            file: "app/src/value.test.ts",
            title: "values > works",
            line: 3,
          },
          {
            ruleId: "RULE-001",
            layer: "playwright",
            testId: "rule-browser",
            commandKey: "browser",
            runner: "playwright",
            file: "app/src/value.spec.ts",
            title: "@smoke visible",
            line: 2,
            tag: "@smoke",
          },
        ],
      },
    ],
    lifecycleMatrix: "lifecycle.json",
    goldenWorkflowMatrix: "golden.json",
  };
  const registry = {
    version: 1,
    rules: [
      {
        id: "RULE-001",
        description: "fixture",
        criticality: "critical",
        paths: ["app/src/**"],
        vitest: [{ file: "app/src/value.test.ts", title: "values > works", line: 3 }],
        playwright: [
          { path: "app/src/value.spec.ts", title: "@smoke visible", line: 2, tag: "@smoke" },
        ],
      },
    ],
  };
  write("rules.json", registry);
  return {
    cwd,
    manifest: { ...manifest, ruleRegistry: "rules.json" },
    write,
    lifecycle,
    golden,
    registry,
  };
};

test("accepts_static_contracts_without_executing_commands", () => {
  const { cwd, manifest } = fixture();
  expect(validateHarness({ cwd, manifest }).errors).toEqual([]);
  expect(existsSync(path.join(cwd, "EXECUTED"))).toBe(false);
});

test("rejects_invalid_or_non_executable_harness_metadata", () => {
  const { cwd, manifest } = fixture();
  for (const mutate of [
    (m: typeof manifest) => {
      m.version = 2;
    },
    (m: typeof manifest) => {
      m.commands.unit.cwd = "/tmp";
    },
    (m: typeof manifest) => {
      m.adapters.api = "../outside.ts";
    },
    (m: typeof manifest) => {
      m.commands.unit.argv = [];
    },
    (m: typeof manifest) => {
      m.commands.unit.argv = ["pnpm", "missing-script"];
    },
    (m: typeof manifest) => {
      m.commands.unit.argv = ["nonexistent-harness-executable"];
    },
    (m: typeof manifest) => {
      m.workspaces[0].path = "missing";
    },
    (m: typeof manifest) => {
      m.coverage[0].workspace = "unregistered";
    },
    (m: typeof manifest) => {
      m.coverage[0].metrics = ["lines"];
    },
    (m: typeof manifest) => {
      m.browser.testEntrypoint = "unknown";
    },
  ]) {
    const bad = structuredClone(manifest);
    mutate(bad);
    expect(validateHarness({ cwd, manifest: bad }).errors.length).toBeGreaterThan(0);
  }
});

test("rejects_duplicate_or_unbound_ownership", () => {
  const { cwd, manifest } = fixture();
  for (const mutate of [
    (m: typeof manifest) => {
      m.ownership.push(structuredClone(m.ownership[0]));
    },
    (m: typeof manifest) => {
      m.ownership[0].testBindings = [];
    },
    (m: typeof manifest) => {
      m.ownership[0].ruleIds.push("RULE-002");
    },
    (m: typeof manifest) => {
      m.ownership[0].layers.push("contract");
    },
    (m: typeof manifest) => {
      m.ownership[0].testBindings[0].commandKey = "unknown";
    },
    (m: typeof manifest) => {
      m.ownership[0].testBindings[1].testId = "rule-unit";
    },
  ]) {
    const bad = structuredClone(manifest);
    mutate(bad);
    expect(validateHarness({ cwd, manifest: bad }).errors.length).toBeGreaterThan(0);
  }
});

test("rejects_empty_browser_opt_out_without_reason", () => {
  const { cwd, manifest } = fixture();
  manifest.workspaces[0].browserCommands = [];
  expect(validateHarness({ cwd, manifest }).errors.join(" ")).toMatch(/browserOptOutReason/);
  manifest.workspaces[0].browserOptOutReason = "Service only workspace";
  manifest.ownership[0].testBindings = manifest.ownership[0].testBindings.filter(
    (binding) => binding.runner === "vitest",
  );
  manifest.ownership[0].layers = ["service"];
  manifest.ownership[0].ruleLayers = [{ ruleId: "RULE-001", layer: "service" }];
  expect(validateHarness({ cwd, manifest }).errors).toEqual([]);
});

test("rejects_stale_exact_test_identity", () => {
  const { cwd, manifest } = fixture();
  for (const key of ["title", "tag", "line"] as const) {
    const bad = structuredClone(manifest);
    const binding = bad.ownership[0].testBindings[1];
    if (key === "line") binding.line = 999;
    else binding[key] = "stale";
    expect(validateHarness({ cwd, manifest: bad }).errors.length).toBeGreaterThan(0);
  }
  const discovered = {
    vitest: [{ file: "app/src/value.test.ts", title: "values > works", line: 3 }],
    playwright: [
      { path: "app/src/value.spec.ts", title: "@smoke visible", line: 2, tags: ["@smoke"] },
    ],
  };
  expect(validateHarness({ cwd, manifest, discovered }).errors).toEqual([]);
  discovered.playwright[0].tags = ["@other"];
  expect(validateHarness({ cwd, manifest, discovered }).errors.join(" ")).toMatch(/identity/);
  discovered.vitest.push(discovered.vitest[0]);
  expect(validateHarness({ cwd, manifest, discovered }).errors.join(" ")).toMatch(/ambiguous/);
});

test("rejects_invalid_lifecycle_and_golden_workflow_rows", () => {
  const { cwd, manifest, lifecycle, golden, write } = fixture();
  for (const [expectedResult, nextState] of [
    ["accepted", null],
    ["rejected", "bound"],
    ["no-op", "bound"],
    ["unknown", null],
  ]) {
    write("lifecycle.json", {
      ...lifecycle,
      rows: [{ ...lifecycle.rows[0], expectedResult, nextState }],
    });
    expect(validateHarness({ cwd, manifest }).errors.join(" ")).toMatch(/lifecycle/i);
  }
  write("lifecycle.json", lifecycle);
  for (const key of [
    "adapterSetup",
    "userActions",
    "urlTransitions",
    "visibleAssertions",
    "persistedInvariants",
    "ruleIds",
  ]) {
    write("golden.json", { ...golden, rows: [{ ...golden.rows[0], [key]: [] }] });
    expect(validateHarness({ cwd, manifest }).errors.join(" ")).toMatch(/golden/i);
  }
  write("golden.json", golden);
  write("lifecycle.json", {
    ...lifecycle,
    rows: [{ ...lifecycle.rows[0], expectedResult: "no-op", nextState: null }],
  });
  expect(validateHarness({ cwd, manifest }).errors).toEqual([]);
});

test("rejects_symlink_escape_and_new_unregistered_nx_workspace", () => {
  const { cwd, manifest, write } = fixture();
  symlinkSync(tmpdir(), path.join(cwd, "external"));
  manifest.commands.unit.cwd = "external";
  expect(validateHarness({ cwd, manifest }).errors.join(" ")).toMatch(/outside|escape/);
  manifest.commands.unit.cwd = ".";
  write("new-app/project.json", { name: "new-app" });
  expect(validateHarness({ cwd, manifest }).errors.join(" ")).toMatch(/unregistered.*new-app/i);
});

test("harness_cli_writes_validation_artifact_before_failure", () => {
  const { cwd, manifest, write } = fixture();
  write("proofline.harness.json", manifest);
  main(cwd, ["--validate-harness"]);
  const artifact = () =>
    JSON.parse(readFileSync(path.join(cwd, "artifacts/harness/validation.json"), "utf8"));
  expect(artifact().errors).toEqual([]);
  write("proofline.harness.json", "{bad");
  expect(() => main(cwd, ["--validate-harness"])).toThrow();
  expect(artifact().errors.length).toBeGreaterThan(0);
  expect(existsSync(path.join(cwd, "EXECUTED"))).toBe(false);
});

test("rejects_binding_command_mismatch_duplicate_ids_and_missing_rule_layer_pairs", () => {
  const { cwd, manifest } = fixture();
  for (const commandKey of ["lint", "browser"]) {
    const bad = structuredClone(manifest);
    bad.ownership[0].testBindings[0].commandKey = commandKey;
    expect(validateHarness({ cwd, manifest: bad }).errors.join(" ")).toMatch(
      /command.*workspace|runner/i,
    );
  }
  const duplicate = structuredClone(manifest);
  duplicate.ownership.push({
    ...structuredClone(duplicate.ownership[0]),
    glob: "app/src/value.ts",
  });
  expect(validateHarness({ cwd, manifest: duplicate }).errors.join(" ")).toMatch(/duplicate.*ID/i);
  const pair = structuredClone(manifest);
  pair.ownership[0].ruleLayers.push({ ruleId: "RULE-001", layer: "contract" });
  expect(validateHarness({ cwd, manifest: pair }).errors.join(" ")).toMatch(/rule.layer/i);
});

test("rejects_catalog_drift_malformed_projects_and_invalid_source_groups", () => {
  const { cwd, manifest, write, registry } = fixture();
  registry.rules[0].id = "RULE-999";
  write("rules.json", registry);
  expect(validateHarness({ cwd, manifest }).errors.join(" ")).toMatch(/catalog/i);
  write("app/project.json", "{bad");
  expect(() => validateHarness({ cwd, manifest })).not.toThrow();
  expect(validateHarness({ cwd, manifest }).errors.join(" ")).toMatch(/workspace/i);
  expect(() => validateHarness({ cwd: path.join(cwd, "missing"), manifest })).not.toThrow();
  const bad = structuredClone(manifest);
  bad.coverage[0].sourceGlobs = ["app/missing.ts"];
  expect(validateHarness({ cwd, manifest: bad }).errors.join(" ")).toMatch(/missing.ts/);
});

test("uses_supplied_discovery_for_dynamic_tests_and_rejects_unregistered_declarations", () => {
  const { cwd, manifest, write, registry } = fixture();
  write(
    "app/src/value.test.ts",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture intentionally contains a dynamic test title.
    'import { test } from "vitest";\nfor (const value of [1]) test(`value ${value}`, () => {});\n',
  );
  const binding = manifest.ownership[0].testBindings[0];
  binding.title = "value 1";
  binding.line = 2;
  registry.rules[0].vitest = [{ file: binding.file, title: binding.title, line: binding.line }];
  write("rules.json", registry);
  expect(validateHarness({ cwd, manifest }).errors.join(" ")).toMatch(/identity/);
  const discovered = {
    vitest: registry.rules[0].vitest,
    playwright: [
      { path: "app/src/value.spec.ts", title: "@smoke visible", line: 2, tags: ["@smoke"] },
    ],
  };
  expect(validateHarness({ cwd, manifest, discovered }).errors).toEqual([]);
  write("app/src/value.test.ts", 'function neverCalled() {\n test("value 1", () => {});\n}\n');
  expect(validateHarness({ cwd, manifest }).errors.join(" ")).toMatch(/identity/);
});

test("accepts_stateless_contracts_and_honest_browser_exclusions", () => {
  const { cwd, manifest, golden, write } = fixture();
  expect(validateHarness({ cwd, manifest: { ...manifest, lifecycleMatrix: null } }).errors).toEqual(
    [],
  );
  const excluded = {
    ...golden.rows[0],
    status: "excluded",
    userActions: [],
    urlTransitions: [],
    visibleAssertions: [],
    exclusions: [
      {
        operation: "cancel",
        ownerLayer: "service",
        reason: "No user-visible control",
        ruleIds: ["RULE-001"],
      },
    ],
  };
  write("golden.json", { ...golden, rows: [excluded] });
  expect(validateHarness({ cwd, manifest }).errors).toEqual([]);
  excluded.exclusions[0].reason = "";
  write("golden.json", { ...golden, rows: [excluded] });
  expect(validateHarness({ cwd, manifest }).errors.join(" ")).toMatch(/golden/i);
});

test("rejects_package_binaries_that_exist_but_are_not_executable", () => {
  const { cwd, manifest, write } = fixture();
  write("node_modules/.bin/inert", "#!/bin/sh\nexit 0\n");
  manifest.commands.unit.argv = ["pnpm", "exec", "inert"];
  expect(validateHarness({ cwd, manifest }).errors.join(" ")).toMatch(/executable/);
});

test("preserves_exact_test_title_whitespace", () => {
  const { cwd, manifest } = fixture();
  manifest.ownership[0].testBindings[0].title += " ";
  expect(validateHarness({ cwd, manifest }).errors.join(" ")).toMatch(/identity|catalog/);
});
