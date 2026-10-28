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
  test("rejects_feature_files_when_vitest_discovery_is_empty", () => {
    expect(validateFeatureMap(fixtureFeatureMap, playwrightTests, []).errors).toHaveLength(1);
  });
  test("accepts feature tags that resolve to discovered Playwright tests", () => {
    expect(
      validateFeatureMap(fixtureFeatureMap, playwrightTests, fixtureFeatureMap.features[0].vitest),
    ).toEqual({ errors: [] });
  });

  test("reports stale tags instead of silently selecting zero Playwright tests", () => {
    const staleMap = {
      ...fixtureFeatureMap,
      features: [{ ...fixtureFeatureMap.features[0], playwrightTags: ["@does-not-exist"] }],
    };

    expect(
      validateFeatureMap(staleMap, playwrightTests, fixtureFeatureMap.features[0].vitest).errors,
    ).toEqual(["Feature quote-workflow references stale Playwright tag @does-not-exist."]);
  });
});
