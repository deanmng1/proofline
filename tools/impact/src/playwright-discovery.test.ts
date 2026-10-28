import { describe, expect, test } from "vitest";

import { parsePlaywrightDiscovery } from "./playwright-discovery.ts";

describe("Playwright discovery", () => {
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
