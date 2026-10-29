import * as childProcess from "node:child_process";
import { execFileSync } from "node:child_process";
import {
  existsSync,
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

vi.mock("node:child_process", { spy: true });
const repositoryVitestCli = path.join(process.cwd(), "node_modules/vitest/vitest.mjs");
const repositoryPlaywrightCli = path.join(process.cwd(), "node_modules/@playwright/test/cli.js");

const linkFixtureDependency = (cwd: string, packageName: string) => {
  const destination = path.join(cwd, "node_modules", packageName);
  mkdirSync(path.dirname(destination), { recursive: true });
  symlinkSync(
    realpathSync(path.join(process.cwd(), "node_modules", packageName)),
    destination,
    "dir",
  );
  const binary = packageName === "vitest" ? "vitest" : "playwright";
  const binaryDestination = path.join(cwd, "node_modules/.bin", binary);
  mkdirSync(path.dirname(binaryDestination), { recursive: true });
  if (!existsSync(binaryDestination))
    symlinkSync(path.join(process.cwd(), "node_modules/.bin", binary), binaryDestination, "file");
};

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
    linkFixtureDependency(cwd, "vitest");
    linkFixtureDependency(cwd, "@playwright/test");
    write(".gitignore", "node_modules/\nartifacts/\n.nx/\ntest-results/\n");
    write("package.json", '{"name":"selection-fixture","private":true,"type":"module"}');
    write("nx.json", "{}");
    write(
      "fixture-runner.cjs",
      `const { spawnSync } = require("node:child_process");
const cli = process.argv[2] === "vitest" ? ${JSON.stringify(repositoryVitestCli)} : ${JSON.stringify(repositoryPlaywrightCli)};
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(3)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
process.stdout.write(result.stdout || ""); process.stderr.write(result.stderr || ""); process.exit(result.status ?? 1);`,
    );
    write(
      "modules/orders/project.json",
      JSON.stringify({
        name: "crm-web",
        targets: {
          test: {
            command: "node fixture-runner.cjs vitest run --config modules/orders/vite.config.ts",
          },
          coverage: { command: "pnpm exec vitest run --coverage" },
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
        targets: { test: { command: "node fixture-runner.cjs vitest run libraries/value" } },
      }),
    );
    write(
      "checks/browser/project.json",
      JSON.stringify({
        name: "browser",
        targets: {
          e2e: {
            command:
              "node fixture-runner.cjs playwright test --config checks/browser/playwright.config.ts",
          },
        },
      }),
    );
    write(
      `${spec}.backup.spec.ts`,
      'import { test } from "@playwright/test";\n\n\ntest("unselected backup", () => { throw new Error("file pattern widened"); });',
    );
    write(source, "export const version = 1;\n");
    const check = { argv: ["node", "fixture-runner.cjs", "vitest", "run"], cwd: "." };
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
              "node",
              "fixture-runner.cjs",
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
            producer: {
              command: { kind: "nx-target", target: "coverage" },
              adapter: {
                kind: "vitest",
                implementation: "vitest-v8",
                version: { kind: "package-json", package: "@vitest/coverage-v8" },
              },
            },
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
    const validManifestText = readFileSync(path.join(cwd, "proofline.harness.json"), "utf8");
    for (const mutation of [
      "workspace-key",
      "binding-key",
      "wrong-runner",
      "wrong-workspace-runner",
      "binding-workspace",
    ]) {
      const invalid = JSON.parse(validManifestText);
      if (mutation === "workspace-key") invalid.workspaces[0].browserCommands = ["missing-browser"];
      if (mutation === "binding-key")
        invalid.ownership[0].testBindings[0].commandKey = "missing-unit";
      if (mutation === "wrong-runner") invalid.ownership[0].testBindings[0].commandKey = "browser";
      if (mutation === "wrong-workspace-runner") invalid.workspaces[0].unitCommand = "browser";
      if (mutation === "binding-workspace") {
        invalid.commands.alternative = { ...invalid.commands.unit, runner: "vitest" };
        invalid.ownership[0].testBindings[0].commandKey = "alternative";
      }
      write("proofline.harness.json", JSON.stringify(invalid));
      const spawn = vi.mocked(childProcess.spawnSync).mockImplementation(() => {
        throw new Error("Unexpected runner spawn");
      });
      try {
        expect(() => main(cwd, [])).toThrow(/Unknown command key|test role|Binding command/);
        expect(spawn).not.toHaveBeenCalled();
        expect(
          JSON.parse(readFileSync(path.join(cwd, "artifacts/impact/selection.json"), "utf8"))
            .executionBlocked,
        ).toBe(true);
      } finally {
        spawn.mockRestore();
      }
    }
    write("proofline.harness.json", validManifestText);
    main(cwd, ["--dry-run"]);
    const unchanged = JSON.parse(
      readFileSync(path.join(cwd, "artifacts/impact/selection.json"), "utf8"),
    );
    expect(unchanged, JSON.stringify(unchanged, null, 2)).toMatchObject({
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
          argv: ["node", "fixture-runner.cjs", "vitest", "run", "libraries/value"],
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
      "libraries/value/src/foo.test.ts",
      'import { test } from "vitest"; import fs from "node:fs"; import "../../../modules/orders/src/feature";\ntest("unbound importing identity", () => { fs.writeFileSync("unexpected-targeted", "bad"); });',
    );
    write(
      "libraries/value/src/foo.test.ts.backup.test.ts",
      'import { test } from "vitest"; import fs from "node:fs";\ntest("unbound importing identity", () => { fs.writeFileSync("unexpected-targeted", "bad"); });',
    );
    execFileSync("git", ["add", "."], { cwd });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "-qm",
        "collision fixture",
      ],
      { cwd },
    );
    write(source, "export const version = 3;\n");
    main(cwd, []);
    const collision = JSON.parse(
      readFileSync(path.join(cwd, "artifacts/impact/selection.json"), "utf8"),
    );
    expect(collision.fallback).toBe("canonical-full");
    expect(collision.errors.join(" ")).toMatch(/ambiguous.*selected.*Vitest/i);
    expect(existsSync(path.join(cwd, "unexpected-targeted"))).toBe(false);
    expect(readFileSync(path.join(cwd, "canonical.log"), "utf8")).toBe("unit\nbrowser\n");
    rmSync(path.join(cwd, "canonical.log"));
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
    symlinkSync(tmpdir(), path.join(cwd, "outside"), "dir");
    fullManifest.commands.unit.cwd = "outside";
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
    linkFixtureDependency(path.join(cwd, "module"), "vitest");
    writeFileSync(path.join(cwd, "package.json"), '{"type":"module"}');
    writeFileSync(
      path.join(cwd, "module/runner.cjs"),
      `const { spawnSync } = require("node:child_process"); const result = spawnSync(process.execPath, [${JSON.stringify(repositoryVitestCli)}, ...process.argv.slice(3)], { encoding: "utf8" }); process.stdout.write(result.stdout || ""); process.stderr.write(result.stderr || ""); process.exit(result.status ?? 1);`,
    );
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
    delete manifest.adapters.runnerEgress;
    manifest.commands.unit = {
      argv: ["node", "runner.cjs", "vitest", "run", "--config", "custom.config.ts"],
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

test("discovers_nested_workspace_once_and_executes_its_own_cwd", () => {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "impact-nested-")));
  try {
    writeFileSync(path.join(cwd, "package.json"), '{"type":"module"}');
    for (const workspace of ["modules/orders", "modules/orders/nested"]) {
      mkdirSync(path.join(cwd, workspace, "tests"), { recursive: true });
      linkFixtureDependency(path.join(cwd, workspace), "vitest");
      writeFileSync(
        path.join(cwd, workspace, "tests.config.ts"),
        'export default { test: { include: ["**/tests/*.test.ts"] } };',
      );
      writeFileSync(
        path.join(cwd, workspace, "tests/value.test.ts"),
        `import { test } from "vitest"; import fs from "node:fs";\ntest("${workspace}", () => { fs.writeFileSync("executed", process.cwd()); });`,
      );
      // Exercise real Vitest with one absolute-reporting and one relative-reporting adapter.
      writeFileSync(
        path.join(cwd, workspace, "runner.cjs"),
        `const { spawnSync } = require("node:child_process"); const path = require("node:path");
const args = process.argv.slice(2); const result = spawnSync(process.execPath, [${JSON.stringify(repositoryVitestCli)}, ...args.slice(1)], { encoding: "utf8" });
if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(result.status ?? 1); }
if (args[1] === "list" && ${workspace.endsWith("nested")}) { const tests = JSON.parse(result.stdout); for (const test of tests) test.file = path.relative(process.cwd(), test.file); process.stdout.write(JSON.stringify(tests)); } else process.stdout.write(result.stdout);`,
      );
    }
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "proofline.harness.json"), "utf8"),
    );
    delete manifest.adapters.runnerEgress;
    manifest.workspaces = [
      {
        path: "modules/orders",
        unitCommand: "parent",
        browserCommands: [],
        browserOptOutReason: "unit",
      },
      {
        path: "modules/orders/nested",
        unitCommand: "nested",
        browserCommands: [],
        browserOptOutReason: "unit",
      },
    ];
    for (const workspace of manifest.workspaces)
      manifest.commands[workspace.unitCommand] = {
        argv: ["node", "runner.cjs", "vitest", "run", "--config", "tests.config.ts"],
        cwd: workspace.path,
        runner: "vitest",
      };
    const discovery = discoverCandidates(cwd, manifest);
    expect(discovery.identities.vitest.map((test) => test.file)).toEqual([
      "modules/orders/tests/value.test.ts",
      "modules/orders/nested/tests/value.test.ts",
    ]);
    const nested = discovery.identities.vitest.find(
      (test) => test.title === "modules/orders/nested",
    );
    expect(nested).toBeDefined();
    if (!nested) throw new Error("Missing nested identity");
    runSelection(cwd, { vitest: [nested], playwright: [] }, discovery.plans);
    expect(readFileSync(path.join(cwd, "modules/orders/nested/executed"), "utf8")).toBe(
      path.join(cwd, "modules/orders/nested"),
    );
    expect(existsSync(path.join(cwd, "modules/orders/executed"))).toBe(false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}, 30000);
