import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { main } from "./main.ts";
import { parsePlaywrightIdentities } from "./playwright-discovery.ts";
import * as selection from "./select.ts";
import * as validation from "./validate.ts";

const vitest = [
  {
    file: "packages/domain/src/commission.test.ts",
    title: "commission rules > refund adjustments retain the original accrual and hold period",
    line: 84,
  },
];
const playwright = [
  {
    path: "apps/crm-e2e/src/features/commission-refund.spec.ts",
    title: "commission corrections > refund",
    line: 36,
    tags: ["@refund"],
  },
];
const rule = {
  id: "COM-003",
  description: "Incremental refunds",
  criticality: "critical",
  paths: ["packages/domain/src/commission.ts"],
  vitest,
  playwright: [{ ...playwright[0], tag: "@refund", tags: undefined }],
};
// Keep serialized registry fixtures identical to on-disk JSON (no undefined properties).
const registry = () => JSON.parse(JSON.stringify({ version: 1, rules: [rule] }));
const discovered = { vitest, playwright };

describe("machine-readable regression contract", () => {
  test("retains_fail_closed_artifacts_when_registry_or_discovery_is_missing", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "impact-contract-"));
    try {
      expect(() => main(cwd, ["--dry-run"])).toThrow();
      const artifact = JSON.parse(
        readFileSync(path.join(cwd, "artifacts/impact/selection.json"), "utf8"),
      );
      expect(artifact.fallback).toBe("all-tests");
      expect(artifact.errors.length).toBeGreaterThan(0);
      expect(artifact.executionBlocked).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
  test("rejects_undiscovered_rule_evidence", () => {
    expect(
      validation.validateRules(registry(), { vitest: [], playwright }).errors.join(" "),
    ).toMatch(/undiscovered/);
    const bad = registry();
    bad.rules[0].playwright[0].title = "another test in the same spec";
    expect(validation.validateRules(bad, discovered).errors.join(" ")).toMatch(/undiscovered/);
  });
  test("rejects_duplicate_rule_ids", () => {
    const bad = registry();
    bad.rules.push(bad.rules[0]);
    expect(validation.validateRules(bad, discovered).errors.join(" ")).toMatch(/duplicate/i);
  });
  test("rejects_a_critical_rule_without_deterministic_evidence", () => {
    const bad = registry();
    bad.rules[0].vitest = [];
    expect(validation.validateRules(bad, discovered).errors.join(" ")).toMatch(/deterministic/);
  });
  test("rejects_ambiguous_and_malformed_evidence", () => {
    expect(
      validation
        .validateRules(registry(), { vitest: [...vitest, ...vitest], playwright })
        .errors.join(" "),
    ).toMatch(/ambiguous/);
    expect(validation.validateRules({}, discovered).errors.length).toBeGreaterThan(0);
    const bad = registry();
    bad.rules[0].paths = ["../outside.ts"];
    expect(validation.validateRules(bad, discovered).errors.length).toBeGreaterThan(0);
  });
  test("selects_all_rule_tests_for_an_owned_source_path", () => {
    const result = selection.selectRuleTests(
      ["packages/domain/src/commission.ts"],
      registry(),
      discovered,
    );
    expect(result.vitest).toEqual(vitest);
    expect(result.playwright).toEqual(playwright);
    expect(result.reasons[vitest[0].title]).toContain("rule:COM-003");
  });
  test("rejects_markdown_registry_drift", () => {
    expect(
      validation.validateRules(registry(), discovered, "stale markdown").errors.join(" "),
    ).toMatch(/drift/);
    expect(
      validation.validateRules(registry(), discovered, validation.renderRules(registry())).errors,
    ).toEqual([]);
  });
  test("runs_only_the_selected_test_identity", () => {
    const command = selection.vitestCommand(vitest[0]);
    const run = spawnSync("pnpm", [...command, "--reporter=json"], { encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    const report = JSON.parse(run.stdout);
    const passed = report.testResults
      .flatMap(
        (file: { assertionResults: { fullName: string; status: string }[] }) =>
          file.assertionResults,
      )
      .filter((result: { status: string }) => result.status === "passed");
    expect(passed.map((result: { fullName: string }) => result.fullName)).toEqual([
      "commission rules refund adjustments retain the original accrual and hold period",
    ]);
  });
  test("preserves_literal_title_separators_and_regex_characters", () => {
    mkdirSync("artifacts", { recursive: true });
    const directory = mkdtempSync(path.join(process.cwd(), "artifacts/identity-"));
    const file = path.join(directory, "identity.test.ts");
    try {
      writeFileSync(
        file,
        'import { test } from "vitest";\ntest("literal > name [x].*", () => {});\ntest("literal > name [x].* sibling", () => { throw new Error("Unselected sibling ran"); });\n',
      );
      const run = spawnSync(
        "pnpm",
        [
          ...selection.vitestCommand({ file, title: "literal > name [x].*", line: 2 }),
          "--reporter=json",
        ],
        { encoding: "utf8" },
      );
      expect(run.status, run.stderr).toBe(0);
      const report = JSON.parse(run.stdout);
      expect(report.numPassedTests).toBe(1);
      expect(report.numPendingTests).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  test("uses_crm_configuration_for_crm_identity", () => {
    expect(
      selection.vitestCommand({
        file: "apps/crm-web/src/features/crm-workflow.test.tsx",
        title: "suite > selected",
        line: 1,
      }),
    ).toContain("apps/crm-web/vite.config.ts");
  });
  test("selects_one_playwright_location_without_its_sibling_test", () => {
    const run = spawnSync(
      "pnpm",
      [
        ...selection.playwrightCommand([
          {
            path: "apps/crm-e2e/src/auth.spec.ts",
            title: "signs in through the mock auth flow",
            line: 4,
            tags: [],
          },
        ]),
        "--list",
        "--reporter=json",
      ],
      { encoding: "utf8" },
    );
    expect(run.status, run.stderr).toBe(0);
    expect(parsePlaywrightIdentities(JSON.parse(run.stdout))).toEqual([
      {
        path: "apps/crm-e2e/src/auth.spec.ts",
        title: "signs in through the mock auth flow",
        line: 4,
        tags: [],
      },
    ]);
  });
  test("enables_flaky_failure_only_in_ci", () => {
    for (const ci of ["true", ""]) {
      const run = spawnSync(
        "pnpm",
        [
          "exec",
          "playwright",
          "test",
          "--config",
          "apps/crm-e2e/playwright.config.ts",
          "--list",
          "--reporter=json",
        ],
        { encoding: "utf8", env: { ...process.env, CI: ci } },
      );
      expect(run.status).toBe(0);
      expect(JSON.parse(run.stdout).config.failOnFlakyTests).toBe(Boolean(ci));
    }
  });
});
