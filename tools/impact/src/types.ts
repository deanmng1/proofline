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
