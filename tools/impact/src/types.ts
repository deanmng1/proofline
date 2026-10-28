export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "untracked";

export type ChangedFile = {
  path: string;
  previousPath?: string;
  status: ChangeStatus;
};

export type ChangeManifest = {
  base: string | null;
  head: string;
  files: ChangedFile[];
  uncertainty: string[];
};

export type Feature = {
  id: string;
  paths: string[];
  vitest: string[];
  playwrightTags: string[];
};

export type FeatureMap = {
  version: number;
  features: Feature[];
};

export type PlaywrightCandidate = {
  path: string;
  tags: string[];
  title?: string;
  line?: number;
};

export type VitestIdentity = { file: string; title: string; line: number };
export type PlaywrightIdentity = { path: string; title: string; line: number; tags: string[] };
export type DiscoveredTests = { vitest: VitestIdentity[]; playwright: PlaywrightIdentity[] };
export type RuleRegistry = {
  version: 1;
  rules: {
    id: string;
    description: string;
    criticality: "critical" | "standard";
    paths: string[];
    vitest: VitestIdentity[];
    playwright: { path: string; title: string; line: number; tag: string }[];
  }[];
};

export type TestCandidates = {
  vitest: string[];
  playwright: PlaywrightCandidate[];
};

export type ImpactSelection = {
  vitestFiles: string[];
  playwrightTests: string[];
  reasons: Record<string, string[]>;
  fallback: "none" | "all-tests";
  errors: string[];
};
