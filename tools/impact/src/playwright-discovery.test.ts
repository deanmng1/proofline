import { describe, expect, test } from "vitest";

import { parsePlaywrightDiscovery, parsePlaywrightIdentities } from "./playwright-discovery.ts";

describe("Playwright discovery", () => {
  test("preserves_exact_titles_lines_and_tags_and_rejects_missing_identities", () => {
    expect(
      parsePlaywrightIdentities({
        suites: [
          {
            title: "example.spec.ts",
            specs: [],
            suites: [
              {
                title: "suite",
                specs: [
                  { file: "example.spec.ts", title: "test", line: 12, tags: ["rule"], tests: [{}] },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        path: "apps/crm-e2e/src/example.spec.ts",
        title: "suite > test",
        line: 12,
        tags: ["@rule"],
      },
    ]);
    expect(() =>
      parsePlaywrightIdentities({
        suites: [{ specs: [{ file: "example.spec.ts", tests: [{}] }] }],
      }),
    ).toThrow();
    expect(() => parsePlaywrightIdentities({ suites: [] })).toThrow();
  });
  test("uses Playwright-reported tags instead of source-text comments", () => {
    const candidates = parsePlaywrightDiscovery({
      suites: [
        {
          specs: [
            { file: "features/quote.spec.ts", tags: ["quote"], tests: [{}] },
            // A source scanner could incorrectly treat @commission as a test tag.
            { file: "features/quote.spec.ts", tags: [], tests: [{}] },
          ],
        },
      ],
    });

    expect(candidates).toEqual([
      { path: "apps/crm-e2e/src/features/quote.spec.ts", tags: ["@quote"] },
    ]);
  });
});
