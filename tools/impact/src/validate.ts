import type { FeatureMap, PlaywrightCandidate } from "./types.ts";

export const validateFeatureMap = (
  featureMap: FeatureMap,
  playwrightTests: PlaywrightCandidate[],
  vitestTests: string[] = [],
) => {
  const errors: string[] = [];
  const knownTags = new Set(playwrightTests.flatMap((test) => test.tags));
  const knownVitestFiles = new Set(vitestTests);

  for (const feature of featureMap.features) {
    for (const tag of feature.playwrightTags) {
      if (!knownTags.has(tag)) {
        errors.push(`Feature ${feature.id} references stale Playwright tag ${tag}.`);
      }
    }

    for (const test of feature.vitest) {
      if (vitestTests.length > 0 && !knownVitestFiles.has(test)) {
        errors.push(`Feature ${feature.id} references missing Vitest file ${test}.`);
      }
    }
  }

  return { errors };
};
