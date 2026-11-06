import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
// @ts-expect-error Portable source inventory API.
import { selectReusableCorePaths } from "../core-inventory.mjs";
// @ts-expect-error Portable source generator API.
import { prepareTarget } from "../validate-portability.mjs";

test("portability generator copies the shared core inventory without source operator tooling", () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "proofline-inventory-"));
  let target: string | undefined;
  const nestedOperators = [
    "tools/proofline/operators/onboarding.mjs",
    "tools/proofline/operators/onboarding-files.mjs",
    "tools/proofline/operators/reliability.mjs",
    "tools/proofline/operators/reliability-api.mjs",
    "tools/proofline/operators/deep/repository-safeguards.mjs",
    "tools/proofline/operators/deep/repository-safeguards-api.mjs",
  ];
  try {
    for (const [file, bytes] of [
      ["tools/impact/src/types.ts", "export type Rule = string;\n"],
      ["tools/proofline/core-inventory.mjs", "export const inventory = [];\n"],
      ["tools/proofline/reliability.mjs", "source operator only\n"],
      ["tools/proofline/onboarding-files.mjs", "source operator only\n"],
      ...nestedOperators.map((file) => [file, "source operator only\n"]),
      ["tools/impact/operators/reliability-api.mjs", "reusable impact helper\n"],
      ["tools/proofline/operators/my-reliability.mjs", "reusable helper\n"],
      ["tools/proofline/operators/onboardingish.mjs", "reusable helper\n"],
      ["tools/proofline/reliability/shared.mjs", "reusable helper\n"],
      ["examples/work-orders/README.md", "Independent target\n"],
    ]) {
      mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
      writeFileSync(path.join(fixture, file), bytes);
    }
    const result = prepareTarget({ repositoryRoot: fixture, dependencyMode: "independent" });
    target = result.target;
    expect(result.files).toEqual([
      "tools/impact/operators/reliability-api.mjs",
      "tools/impact/src/types.ts",
      "tools/proofline/core-inventory.mjs",
      "tools/proofline/operators/my-reliability.mjs",
      "tools/proofline/operators/onboardingish.mjs",
      "tools/proofline/reliability/shared.mjs",
    ]);
    for (const file of nestedOperators)
      expect(existsSync(path.join(target as string, file))).toBe(false);
    expect(readFileSync(path.join(target as string, "tools/impact/src/types.ts"), "utf8")).toBe(
      "export type Rule = string;\n",
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
    if (target) rmSync(target, { recursive: true, force: true });
  }
});

test("core inventory selects reusable files while keeping source operators and target products out", () => {
  expect(
    selectReusableCorePaths([
      "tools/proofline/onboarding.mjs",
      "tools/proofline/onboarding-git.mjs",
      "tools/proofline/reliability.mjs",
      "tools/proofline/reliability-api.mjs",
      "tools/proofline/repository-safeguards.mjs",
      "tools/proofline/repository-safeguards-api.mjs",
      "tools/proofline/operators/onboarding.mjs",
      "tools/proofline/operators/onboarding-git.mjs",
      "tools/proofline/operators/reliability.mjs",
      "tools/proofline/operators/reliability-api.mjs",
      "tools/proofline/operators/deep/repository-safeguards.mjs",
      "tools/proofline/operators/deep/repository-safeguards-api.mjs",
      "tools/proofline/operators/my-reliability.mjs",
      "tools/proofline/operators/onboardingish.mjs",
      "tools/proofline/operators/repository-safeguardsish.mjs",
      "tools/proofline/reliability/shared.mjs",
      "tools/proofline/core-inventory.mjs",
      "tools/proofline/run-guarded.mjs",
      "tools/proofline/run-guarded.d.mts",
      "tools/proofline/src/core-inventory.test.ts",
      "tools/proofline/test-fixtures/portability-native.json",
      "tools/impact/fixtures/test.ts",
      "tools/impact/test-fixtures/git.ts",
      "tools/impact/src/main.ts",
      "tools/impact/operators/reliability-api.mjs",
      "tools/proofline/project.json",
      "examples/work-orders/client/app.jsx",
      "apps/crm-web/src/main.tsx",
      ".github/proofline-safeguards.json",
    ]),
  ).toEqual([
    "tools/impact/operators/reliability-api.mjs",
    "tools/impact/src/main.ts",
    "tools/impact/test-fixtures/git.ts",
    "tools/proofline/core-inventory.mjs",
    "tools/proofline/operators/my-reliability.mjs",
    "tools/proofline/operators/onboardingish.mjs",
    "tools/proofline/operators/repository-safeguardsish.mjs",
    "tools/proofline/reliability/shared.mjs",
    "tools/proofline/run-guarded.d.mts",
    "tools/proofline/run-guarded.mjs",
  ]);
});

test("core inventory rejects unsafe or duplicate source paths before returning an inventory", () => {
  for (const paths of [
    null,
    ["tools/proofline/a.mjs", "tools/proofline/a.mjs"],
    ["../tools/proofline/a.mjs"],
    ["/tools/proofline/a.mjs"],
    ["tools/proofline/../a.mjs"],
    ["tools//proofline/a.mjs"],
    ["tools\\proofline\\a.mjs"],
    ["tools/proofline/a\u0000.mjs"],
    ["C:/tools/proofline/a.mjs"],
    ["tools/proofline/./a.mjs"],
    [""],
    [42],
  ])
    expect(() => selectReusableCorePaths(paths)).toThrow();
});

test("core inventory preserves input and gives deterministic sorted output", () => {
  const input = Object.freeze([
    "tools/proofline/serve-test-app.mjs",
    "tools/impact/src/types.ts",
    "tools/proofline/canonical-runner.mjs",
  ]);
  expect(selectReusableCorePaths(input)).toEqual([
    "tools/impact/src/types.ts",
    "tools/proofline/canonical-runner.mjs",
    "tools/proofline/serve-test-app.mjs",
  ]);
  expect(input[0]).toBe("tools/proofline/serve-test-app.mjs");
  expect(selectReusableCorePaths([])).toEqual([]);
});
