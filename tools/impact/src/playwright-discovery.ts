import type { PlaywrightCandidate } from "./types.ts";

type DiscoverySpec = {
  file?: string;
  tags?: unknown;
  tests?: unknown[];
};

type DiscoverySuite = {
  specs?: DiscoverySpec[];
  suites?: DiscoverySuite[];
};

type PlaywrightDiscovery = {
  suites?: DiscoverySuite[];
};

export function parsePlaywrightDiscovery(report: PlaywrightDiscovery): PlaywrightCandidate[] {
  const tagsByPath = new Map<string, Set<string>>();
  const visitSuite = (suite: DiscoverySuite) => {
    for (const spec of suite.specs ?? []) {
      if (!spec.file || !spec.tests?.length) {
        continue;
      }
      const path = `apps/crm-e2e/src/${spec.file}`;
      const tags = Array.isArray(spec.tags)
        ? spec.tags
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => (tag.startsWith("@") ? tag : `@${tag}`))
        : [];
      const currentTags = tagsByPath.get(path) ?? new Set<string>();
      for (const tag of tags) {
        currentTags.add(tag);
      }
      tagsByPath.set(path, currentTags);
    }
    for (const child of suite.suites ?? []) {
      visitSuite(child);
    }
  };

  for (const suite of report.suites ?? []) {
    visitSuite(suite);
  }

  return [...tagsByPath.entries()]
    .map(([path, tags]) => ({ path, tags: [...tags].sort() }))
    .sort((left, right) => left.path.localeCompare(right.path));
}
