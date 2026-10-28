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
import { main } from "./main.ts";
import { renderRules } from "./validate.ts";

test("main_executes_only_feature_tag_matches_and_exact_rule_references_in_a_shared_spec", () => {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "impact-main-selection-")));
  const write = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), text);
  };
  const spec = "apps/crm-e2e/src/shared.spec.ts";
  const source = "apps/crm-web/src/feature.ts";
  const evidence = { file: "packages/example/src/value.test.ts", title: "value", line: 2 };
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
      "apps/crm-web/project.json",
      JSON.stringify({
        name: "crm-web",
        targets: { build: { command: 'node -e "process.exit(0)"' } },
      }),
    );
    write(evidence.file, 'import { test } from "vitest";\ntest("value", () => {});\n');
    write("apps/crm-web/src/ui.test.ts", 'import { test } from "vitest";\ntest("ui", () => {});\n');
    write(
      "apps/crm-web/vite.config.ts",
      'export default { test: { include: ["apps/crm-web/src/**/*.test.ts"] } };',
    );
    write(
      "apps/crm-e2e/playwright.config.ts",
      `export default ${JSON.stringify({ testDir: "./src", projects: [{ name: "chromium" }], reporter: [["json", { outputFile: path.join(cwd, "artifacts/ran.json") }]] })};`,
    );
    write(
      spec,
      'import { test } from "@playwright/test";\ntest("feature-only", { tag: "@wanted" }, () => {});\ntest("unrelated", { tag: "@other" }, () => { throw new Error("unselected sibling executed"); });\ntest("rule-only", { tag: "@rule" }, () => {});\n',
    );
    write(source, "export const version = 1;\n");
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
    write(source, "export const version = 2;\n");
    vi.stubEnv("IMPACT_BASE", "HEAD");
    vi.stubEnv("IMPACT_HEAD", "HEAD");
    main(cwd, []);
    const selected = JSON.parse(
      readFileSync(path.join(cwd, "artifacts/impact/selection.json"), "utf8"),
    );
    expect(selected.fallback).toBe("none");
    expect(selected.identities.playwright.map((t: { title: string }) => t.title)).toEqual([
      "feature-only",
      "rule-only",
    ]);
    const report = JSON.parse(readFileSync(path.join(cwd, "artifacts/ran.json"), "utf8"));
    expect(report.stats.expected).toBe(2);
    expect(report.stats.unexpected).toBe(0);
    expect(report.suites[0].specs.map((s: { title: string }) => s.title)).toEqual([
      "feature-only",
      "rule-only",
    ]);
  } finally {
    vi.unstubAllEnvs();
    rmSync(cwd, { recursive: true, force: true });
  }
}, 30000);
