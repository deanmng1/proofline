import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { discoverCandidates, main, runCanonicalFull, runSelection } from "./main.ts";
import { renderRules } from "./validate.ts";

test("runs_only_one_declared_vitest_and_playwright_identity", () => {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "impact-main-selection-")));
  const write = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), text);
  };
  const spec = "checks/browser/src/shared.spec.ts";
  const source = "modules/orders/src/feature.ts";
  const evidence = { file: "libraries/value/src/value.test.ts", title: "value", line: 2 };
  const registry = {
    version: 1 as const,
    rules: [
      {
        id: "SEL-001",
        criticality: "critical" as const,
        description: "Exact selection",
        paths: [source],
        vitest: [evidence],
        playwright: [{ path: spec, title: "rule-only", line: 4, tag: "@rule" }],
      },
    ],
  };
  try {
    symlinkSync(path.join(process.cwd(), "node_modules"), path.join(cwd, "node_modules"), "dir");
    write(".gitignore", "node_modules/\nartifacts/\n.nx/\ntest-results/\n");
    write("package.json", '{"name":"selection-fixture","private":true,"type":"module"}');
    write("nx.json", "{}");
    write(
      "modules/orders/project.json",
      JSON.stringify({
        name: "crm-web",
        targets: {
          test: { command: "pnpm exec vitest run --config modules/orders/vite.config.ts" },
        },
      }),
    );
    write(
      evidence.file,
      'import fs from "node:fs"; import { test } from "vitest";\ntest("value", () => { fs.writeFileSync("unit-ran", "yes"); });\ntest("sibling", () => { throw new Error("unselected unit sibling"); });\n',
    );
    write(
      "modules/orders/src/ui.test.ts",
      'import { test } from "vitest";\ntest("ui", () => {});\n',
    );
    write(
      "modules/orders/vite.config.ts",
      'export default { test: { include: ["modules/orders/src/**/*.test.ts"] } };',
    );
    write(
      "checks/browser/playwright.config.ts",
      `export default ${JSON.stringify({ testDir: "./src", projects: [{ name: "chromium" }], reporter: [["json", { outputFile: path.join(cwd, "artifacts/ran.json") }]] })};`,
    );
    write(
      spec,
      'import { test } from "@playwright/test";\ntest("feature-only", { tag: "@wanted" }, () => {});\ntest("unrelated", { tag: "@other" }, () => { throw new Error("unselected sibling executed"); });\ntest("rule-only", { tag: "@rule" }, () => {});\n',
    );
    write(
      "libraries/value/project.json",
      JSON.stringify({
        name: "example",
        targets: { test: { command: "pnpm exec vitest run libraries/value" } },
      }),
    );
    write(
      "checks/browser/project.json",
      JSON.stringify({
        name: "browser",
        targets: {
          e2e: {
            command: "pnpm exec playwright test --config checks/browser/playwright.config.ts",
          },
        },
      }),
    );
    write(
      `${spec}.backup.spec.ts`,
      'import { test } from "@playwright/test";\n\n\ntest("unselected backup", () => { throw new Error("file pattern widened"); });',
    );
    write(source, "export const version = 1;\n");
    const check = { argv: ["pnpm", "exec", "vitest", "run"], cwd: "." };
    write(
      "proofline.harness.json",
      JSON.stringify({
        version: 1,
        commands: {
          lint: check,
          typecheck: check,
          unit: check,
          browser: {
            argv: [
              "pnpm",
              "exec",
              "playwright",
              "test",
              "--config",
              "checks/browser/playwright.config.ts",
            ],
            cwd: ".",
          },
          coverage: check,
          coverageCheck: check,
          recordCheck: check,
          serve: check,
        },
        workspaces: [
          { path: "modules/orders", unitCommand: "unit", browserCommands: ["browser"] },
          {
            path: "libraries/value",
            unitCommand: "unit",
            browserCommands: [],
            browserOptOutReason: "unit only",
          },
          { path: "checks/browser", unitCommand: null, browserCommands: ["browser"] },
        ],
        browser: {
          projects: ["chromium"],
          crossBrowserSmokeProjects: [],
          localOrigins: ["http://127.0.0.1"],
          testEntrypoint: "serve",
        },
        adapters: { testModeEnvironment: source, auth: source, api: source, providers: [] },
        coverage: [
          {
            workspace: "modules/orders",
            provider: "v8",
            providerVersion: "3",
            sourceGlobs: [source],
            exclusions: [],
            report: "artifacts/coverage.json",
            reportFormat: "istanbul-json-summary",
            metrics: ["lines", "functions", "branches", "statements"],
            aggregation: "per-file",
          },
        ],
        ownership: [
          {
            glob: source,
            entrypoints: [source],
            ruleIds: ["SEL-001"],
            layers: ["domain", "playwright"],
            ruleLayers: [
              { ruleId: "SEL-001", layer: "domain" },
              { ruleId: "SEL-001", layer: "playwright" },
            ],
            testBindings: [
              {
                ...evidence,
                testId: "unit",
                ruleId: "SEL-001",
                layer: "domain",
                runner: "vitest",
                commandKey: "unit",
              },
              {
                file: spec,
                title: "rule-only",
                line: 4,
                tag: "@rule",
                testId: "browser",
                ruleId: "SEL-001",
                layer: "playwright",
                runner: "playwright",
                commandKey: "browser",
              },
            ],
          },
        ],
        ruleRegistry: "test-impact/rules.json",
        lifecycleMatrix: null,
        goldenWorkflowMatrix: "golden.json",
      }),
    );
    write(
      "golden.json",
      JSON.stringify({
        version: 1,
        tenantIsolationMode: "authenticated-contexts",
        rows: [
          {
            id: "journey",
            status: "planned",
            adapterSetup: ["seed"],
            userActions: ["click"],
            urlTransitions: ["/"],
            visibleAssertions: ["value"],
            persistedInvariants: ["one"],
            ruleIds: ["SEL-001"],
            exclusions: [],
          },
        ],
      }),
    );
    write(
      "test-impact/features.json",
      JSON.stringify({
        version: 1,
        features: [{ id: "feature", paths: [source], vitest: [], playwrightTags: ["@wanted"] }],
      }),
    );
    write("test-impact/rules.json", JSON.stringify(registry));
    write("test-impact/rules.md", renderRules(registry));
    for (const args of [
      ["init", "-q"],
      ["add", "."],
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "-qm",
        "fixture",
      ],
    ])
      execFileSync("git", args, { cwd });
    vi.stubEnv("IMPACT_BASE", "HEAD");
    vi.stubEnv("IMPACT_HEAD", "HEAD");
    main(cwd, ["--dry-run"]);
    const unchanged = JSON.parse(
      readFileSync(path.join(cwd, "artifacts/impact/selection.json"), "utf8"),
    );
    expect(unchanged).toMatchObject({
      fallback: "none",
      commandKeys: [],
      identities: { vitest: [], playwright: [] },
    });
    write(source, "export const version = 2;\n");
    vi.stubEnv("IMPACT_BASE", "HEAD");
    vi.stubEnv("IMPACT_HEAD", "HEAD");
    main(cwd, []);
    const selected = JSON.parse(
      readFileSync(path.join(cwd, "artifacts/impact/selection.json"), "utf8"),
    );
    expect(readFileSync(path.join(cwd, "unit-ran"), "utf8")).toBe("yes");
    expect(selected.fallback).toBe("none");
    expect(() =>
      runSelection(cwd, { vitest: [{ ...evidence, title: "missing title" }], playwright: [] }, [
        {
          argv: ["pnpm", "exec", "vitest", "run", "libraries/value"],
          cwd: ".",
          workspace: "libraries/value",
          runner: "vitest",
          dependencies: [],
        },
      ]),
    ).toThrow(/identity did not execute/);

    expect(selected.identities.playwright.map((t: { title: string }) => t.title)).toEqual([
      "rule-only",
    ]);
    const report = JSON.parse(readFileSync(path.join(cwd, "artifacts/ran.json"), "utf8"));
    expect(report.stats.expected).toBe(1);
    expect(report.stats.unexpected).toBe(0);
    // Canonical fallback must execute the registered commands, even when discovery breaks.
    write(
      "canonical.cjs",
      'require("fs").appendFileSync("canonical.log", process.argv[2] + "\\n");',
    );
    const fullManifest = JSON.parse(readFileSync(path.join(cwd, "proofline.harness.json"), "utf8"));
    fullManifest.commands.unit = { argv: ["node", "canonical.cjs", "unit"], cwd: "." };
    fullManifest.commands.browser = { argv: ["node", "canonical.cjs", "browser"], cwd: "." };
    write("proofline.harness.json", JSON.stringify(fullManifest));
    write(
      "libraries/value/project.json",
      JSON.stringify({ name: "example", targets: { test: { command: "unsupported discovery" } } }),
    );
    main(cwd, []);
    expect(readFileSync(path.join(cwd, "canonical.log"), "utf8")).toBe("unit\nbrowser\n");
    const fallback = JSON.parse(
      readFileSync(path.join(cwd, "artifacts/impact/selection.json"), "utf8"),
    );
    expect(fallback.fallback).toBe("canonical-full");
    expect(fallback.commandKeys).toEqual(["unit", "browser"]);
    expect(fallback.errors.join(" ")).toMatch(/target/);
    expect(
      JSON.parse(
        readFileSync(path.join(cwd, "artifacts/impact/discovery.json"), "utf8"),
      ).errors.join(" "),
    ).toMatch(/target/);
    expect(fallback.pathReasons[source].length).toBeGreaterThan(0);
    expect(fallback.rationale[source]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "SEL-001",
          testId: "unit",
          evidence: ["unresolved-manifest-binding"],
        }),
      ]),
    );
    fullManifest.commands.unit.cwd = "node_modules";
    write("proofline.harness.json", JSON.stringify(fullManifest));
    expect(() => main(cwd, ["--dry-run"])).toThrow(/outside repository/);
    expect(
      JSON.parse(readFileSync(path.join(cwd, "artifacts/impact/selection.json"), "utf8"))
        .executionBlocked,
    ).toBe(true);

    expect(report.suites[0].specs.map((s: { title: string }) => s.title)).toEqual(["rule-only"]);
  } finally {
    vi.unstubAllEnvs();
    rmSync(cwd, { recursive: true, force: true });
  }
}, 30000);

test("uses_structured_runner_and_canonical_commands_with_their_declared_cwd", () => {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "impact-cwd-")));
  try {
    mkdirSync(path.join(cwd, "module/tests"), { recursive: true });
    symlinkSync(path.join(process.cwd(), "node_modules"), path.join(cwd, "node_modules"), "dir");
    writeFileSync(path.join(cwd, "package.json"), '{"type":"module"}');
    writeFileSync(
      path.join(cwd, "module/custom.config.ts"),
      'export default { test: { include: ["tests/*.test.ts"] } };',
    );
    writeFileSync(
      path.join(cwd, "module/tests/value.test.ts"),
      'import { test } from "vitest"; import fs from "node:fs";\ntest("literal [x].*", () => { fs.writeFileSync("../unit-cwd", process.cwd()); });\ntest("sibling", () => { throw new Error("sibling ran"); });',
    );
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "proofline.harness.json"), "utf8"),
    );
    manifest.commands.unit = {
      argv: ["pnpm", "exec", "vitest", "run", "--config", "custom.config.ts"],
      cwd: "module",
    };
    manifest.workspaces = [
      { path: "module", unitCommand: "unit", browserCommands: [], browserOptOutReason: "unit" },
    ];
    const discovery = discoverCandidates(cwd, manifest);
    expect(discovery.identities.vitest.map((test) => test.file)).toEqual([
      "module/tests/value.test.ts",
      "module/tests/value.test.ts",
    ]);
    runSelection(
      cwd,
      { vitest: [discovery.identities.vitest[0]], playwright: [] },
      discovery.plans,
    );
    expect(readFileSync(path.join(cwd, "unit-cwd"), "utf8")).toBe(path.join(cwd, "module"));
    writeFileSync(
      path.join(cwd, "module/canonical.cjs"),
      'require("fs").appendFileSync("../canonical-cwd", process.argv[2] + ":" + process.cwd() + "\\n");',
    );
    manifest.commands.unit = { argv: ["node", "canonical.cjs", "unit"], cwd: "module" };
    manifest.commands.browser = { argv: ["node", "canonical.cjs", "browser"], cwd: "module" };
    manifest.workspaces.push({
      path: "another",
      unitCommand: "unit",
      browserCommands: ["browser"],
    });
    runCanonicalFull(cwd, manifest);
    expect(readFileSync(path.join(cwd, "canonical-cwd"), "utf8")).toBe(
      `unit:${cwd}/module\nbrowser:${cwd}/module\n`,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
