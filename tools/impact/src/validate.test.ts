import { describe, expect, test } from "vitest";

import { fixtureFeatureMap } from "../fixtures/repository.ts";
import { validateFeatureMap } from "./validate.ts";

const playwrightTests = [
  {
    path: "apps/crm-e2e/src/features/quote-bind-finance.spec.ts",
    tags: ["@quote", "@policy", "@finance"],
  },
  { path: "apps/crm-e2e/src/features/commission-refund.spec.ts", tags: ["@commission"] },
];

describe("feature-map validation", () => {
  test("accepts feature tags that resolve to discovered Playwright tests", () => {
    expect(validateFeatureMap(fixtureFeatureMap, playwrightTests)).toEqual({ errors: [] });
  });

  test("reports stale tags instead of silently selecting zero Playwright tests", () => {
    const staleMap = {
      ...fixtureFeatureMap,
      features: [{ ...fixtureFeatureMap.features[0], playwrightTags: ["@does-not-exist"] }],
    };

    expect(validateFeatureMap(staleMap, playwrightTests).errors).toEqual([
      "Feature quote-workflow references stale Playwright tag @does-not-exist.",
    ]);
  });
});
