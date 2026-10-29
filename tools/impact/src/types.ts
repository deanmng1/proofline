export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "untracked";

export type {
  CoverageGroup,
  GoldenWorkflowMatrix,
  HarnessCommand,
  HarnessManifest,
  HarnessOwnership,
  HarnessTestBinding,
  LifecycleMatrix,
} from "./harness-manifest.ts";

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
  revisions?: {
    requestedBase: string | null;
    requestedHead: string;
    resolvedBase: string | null;
    resolvedHead: string | null;
    mergeBase: string | null;
    checkoutHead: string | null;
    historyComplete: boolean;
  };
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
  fallback: "none" | "canonical-full";
  commandKeys: string[];
  identities: DiscoveredTests;
  pathReasons: Record<string, string[]>;
  rationale: Record<
    string,
    {
      ownership: string;
      ruleId: string | null;
      layer: string | null;
      testId: string | null;
      commandKey: string;
      identity: VitestIdentity | PlaywrightIdentity;
      evidence: string[];
    }[]
  >;
  errors: string[];
};
