import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("Proofline product E2E boundary", () => {
  test("product_e2e_specs_delegate_transport_and_storage_to_fixtures", async () => {
    const sourceRoot = path.resolve("apps/crm-e2e/src");
    const files = (await readdir(sourceRoot, { recursive: true }))
      .filter(
        (file) =>
          /\.tsx?$/.test(file) &&
          !file.startsWith(`fixtures${path.sep}`) &&
          !file.startsWith("fixtures/") &&
          !file.endsWith(".d.ts"),
      )
      .sort();
    const violations: string[] = [];
    for (const file of files) {
      const contents = await readFile(path.join(sourceRoot, file), "utf8");
      violations.push(...findProductE2EViolations(file, contents));
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  test.each([
    ["features/direct-customer-to-quotes.spec.ts", 'await page.goto("/app/crm/quotes");'],
    ["proofline/direct-quotes-to-policy.spec.ts", "await page.goto(policyPath);"],
  ])("rejects_forbidden_crm_screen_to_screen_goto in %s", (file, contents) => {
    expect(findProductE2EViolations(file, contents)).toEqual([
      `${file}:1 forbidden CRM screen navigation`,
    ]);
  });

  test("allows_declared_initial_and_guard_navigation_helpers", () => {
    expect(
      findProductE2EViolations(
        "helpers.ts",
        `export async function openInitialPath(page, path) {
  // proofline-navigation: initial
  await page.goto(path);
}
export async function revisitProtectedPath(page, path) {
  // proofline-navigation: guard
  await page.goto(path);
}`,
      ),
    ).toEqual([]);
    expect(
      findProductE2EViolations(
        "proofline/workflow.spec.ts",
        `await openInitialPath(page, "/app/crm/customers");
await revisitProtectedPath(page, policyPath);`,
      ),
    ).toEqual([]);
  });

  test("rejects_undeclared_navigation_even_inside_the_shared_helper_module", () => {
    expect(
      findProductE2EViolations(
        "helpers.ts",
        `export async function jumpBetweenScreens(page, path) {
  await page.goto(path);
}`,
      ),
    ).toEqual(["helpers.ts:2 forbidden CRM screen navigation"]);
  });
});

const forbidden = [
  { name: "raw BrowserContext", pattern: /\bbrowser\s*\.\s*newContext\s*\(/g },
  { name: "test-owned routing", pattern: /\.\s*(?:route|routeWebSocket)\s*\(/g },
  {
    name: "browser storage mutation",
    pattern: /\b(?:localStorage|sessionStorage)\s*\.\s*(?:setItem|removeItem|clear)\s*\(/g,
  },
];

const declaredNavigationHelpers = new Map([
  ["proofline-navigation: initial", "openInitialPath"],
  ["proofline-navigation: guard", "revisitProtectedPath"],
]);

function isDeclaredNavigation(file: string, contents: string, matchIndex: number): boolean {
  if (file !== "helpers.ts") return false;
  const prefix = contents.slice(0, matchIndex);
  const lines = prefix.split("\n");
  const annotation = lines
    .at(-2)
    ?.trim()
    .replace(/^\/\/\s*/, "");
  if (!annotation) return false;
  const expectedHelper = declaredNavigationHelpers.get(annotation);
  if (!expectedHelper) return false;
  const declarations = [...prefix.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)];
  return declarations.at(-1)?.[1] === expectedHelper;
}

function findProductE2EViolations(file: string, contents: string): string[] {
  const violations: string[] = [];
  for (const rule of forbidden)
    for (const match of contents.matchAll(rule.pattern)) {
      const line = contents.slice(0, match.index).split("\n").length;
      violations.push(`${file}:${line} ${rule.name}`);
    }
  for (const match of contents.matchAll(/\.\s*goto\s*\(/g)) {
    if (isDeclaredNavigation(file, contents, match.index)) continue;
    const line = contents.slice(0, match.index).split("\n").length;
    violations.push(`${file}:${line} forbidden CRM screen navigation`);
  }
  return violations;
}
