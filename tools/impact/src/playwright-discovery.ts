import type { PlaywrightCandidate, PlaywrightIdentity } from "./types.ts";

type DiscoverySpec = {
  file?: string;
  tags?: unknown;
  tests?: unknown[];
  title?: string;
  line?: number;
};

type DiscoverySuite = {
  title?: string;
  specs?: DiscoverySpec[];
  suites?: DiscoverySuite[];
};

type PlaywrightDiscovery = {
  suites?: DiscoverySuite[];
  errors?: unknown[];
};

export function parsePlaywrightIdentities(report: PlaywrightDiscovery): PlaywrightIdentity[] {
  if (report.errors?.length || !Array.isArray(report.suites))
    throw new Error("Invalid Playwright discovery");
  const result: PlaywrightIdentity[] = [];
  const visit = (suite: DiscoverySuite, titles: string[]) => {
    for (const spec of suite.specs ?? []) {
      if (
        !spec.file ||
        !spec.title ||
        !Number.isInteger(spec.line) ||
        (spec.line ?? 0) < 1 ||
        !spec.tests?.length ||
        !Array.isArray(spec.tags) ||
        spec.tags.some((tag) => typeof tag !== "string")
      )
        throw new Error("Missing Playwright identity");
      result.push({
        path: `apps/crm-e2e/src/${spec.file}`,
        title: [...titles, spec.title].join(" > "),
        line: spec.line as number,
        tags: spec.tags.map((tag: string) => (tag.startsWith("@") ? tag : `@${tag}`)),
      });
    }
    for (const child of suite.suites ?? []) visit(child, [...titles, child.title ?? ""]);
  };
  for (const suite of report.suites) visit(suite, []);
  if (!result.length) throw new Error("Empty Playwright discovery");
  return result;
}

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
