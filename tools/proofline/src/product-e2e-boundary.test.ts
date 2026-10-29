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
    const forbidden = [
      { name: "raw BrowserContext", pattern: /\bbrowser\s*\.\s*newContext\s*\(/g },
      { name: "test-owned routing", pattern: /\.\s*(?:route|routeWebSocket)\s*\(/g },
      {
        name: "browser storage mutation",
        pattern: /\b(?:localStorage|sessionStorage)\s*\.\s*(?:setItem|removeItem|clear)\s*\(/g,
      },
    ];
    for (const file of files) {
      const contents = await readFile(path.join(sourceRoot, file), "utf8");
      for (const rule of forbidden)
        for (const match of contents.matchAll(rule.pattern)) {
          const line = contents.slice(0, match.index).split("\n").length;
          violations.push(`${file}:${line} ${rule.name}`);
        }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
