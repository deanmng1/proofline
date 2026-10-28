import path from "node:path";
import type {
  ChangedFile,
  ChangeManifest,
  DiscoveredTests,
  FeatureMap,
  ImpactSelection,
  PlaywrightIdentity,
  RuleRegistry,
  TestCandidates,
  VitestIdentity,
} from "./types.ts";
import { validateFeatureMap, validateRules } from "./validate.ts";

type SelectionInput = {
  manifest: ChangeManifest;
  featureMap: FeatureMap;
  candidates: TestCandidates;
  sourceFiles: Record<string, string>;
};

const knownRoots = [
  "apps/crm-web/",
  "apps/crm-e2e/",
  "packages/domain/",
  "packages/api-contracts/",
  "packages/test-kit/",
  "packages/service-bus/",
  "packages/policy-service/",
  "packages/policy-state-service/",
  "packages/finance-service/",
  "packages/insurance-runtime/",
  "tools/impact/",
];

const configurationFiles = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "nx.json",
  "biome.json",
  "test-impact/features.json",
  "test-impact/rules.json",
  "test-impact/rules.schema.json",
  "test-impact/coverage-baseline.json",
]);

const sourceExtensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];

const sortUnique = (values: Iterable<string>) => [...new Set(values)].sort();

const pathVariants = (file: ChangedFile) => [
  file.path,
  ...(file.previousPath ? [file.previousPath] : []),
];

const matchesGlob = (value: string, glob: string) => {
  let expression = "^";

  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === "*") {
      if (glob[index + 1] === "*") {
        expression += ".*";
        index += 1;
      } else {
        expression += "[^/]*";
      }
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }

  return new RegExp(`${expression}$`).test(value);
};

const isConfigurationChange = (file: string) =>
  configurationFiles.has(file) ||
  file.startsWith(".github/") ||
  /(?:^|\/)package\.json$/.test(file) ||
  /(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/.test(file) ||
  file.endsWith("/project.json") ||
  /(?:^|\/)vite\.config\.[^/]+$/.test(file) ||
  /(?:^|\/)playwright\.config\.[^/]+$/.test(file);

const hasUnknownExecutableOwner = (file: string) =>
  /^(apps|packages|tools)\//.test(file) && !knownRoots.some((root) => file.startsWith(root));

const isRuntimeFile = (file: string) =>
  knownRoots.some((root) => file.startsWith(root)) &&
  (file.includes("/src/") || /\.(?:css|json)$/.test(file));

const addReason = (reasons: Map<string, Set<string>>, test: string, reason: string) => {
  const existing = reasons.get(test) ?? new Set<string>();
  existing.add(reason);
  reasons.set(test, existing);
};

const resolveImport = (from: string, specifier: string, sourceFiles: Record<string, string>) => {
  let unextendedPath: string | undefined;

  if (specifier.startsWith(".")) {
    unextendedPath = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  } else if (specifier.startsWith("@/")) {
    unextendedPath = `apps/crm-web/src/${specifier.slice(2)}`;
  } else if (specifier === "@testbed/domain") {
    unextendedPath = "packages/domain/src/index";
  } else if (specifier === "@testbed/api-contracts") {
    unextendedPath = "packages/api-contracts/src/index";
  } else if (specifier === "@testbed/test-kit") {
    unextendedPath = "packages/test-kit/src/index";
  } else if (
    /^@testbed\/(service-bus|policy-service|policy-state-service|finance-service|insurance-runtime)$/.test(
      specifier,
    )
  ) {
    unextendedPath = `packages/${specifier.slice("@testbed/".length)}/src/index`;
  }

  if (!unextendedPath) {
    return undefined;
  }

  return sourceExtensions
    .map((extension) => `${unextendedPath}${extension}`)
    .find((candidate) => Object.hasOwn(sourceFiles, candidate));
};

export const vitestCommand = (test: VitestIdentity) => [
  "exec",
  "vitest",
  "run",
  ...(test.file.startsWith("apps/crm-web/") ? ["--config", "apps/crm-web/vite.config.ts"] : []),
  test.file,
  "--testNamePattern",
  // List output uses " > " between suites; a test title can contain that literal too.
  // Discovery rejects normalized-title collisions before either form can execute.
  `^${test.title
    .split(" > ")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("(?: > | )")}$`,
];

export const playwrightCommand = (tests: PlaywrightIdentity[]) => [
  "exec",
  "playwright",
  "test",
  "--config",
  "apps/crm-e2e/playwright.config.ts",
  "--project=chromium",
  ...tests.map((test) => `${test.path}:${test.line}`),
];

export const selectRuleTests = (
  paths: string[],
  registry: RuleRegistry,
  discovered: DiscoveredTests,
) => {
  const { errors } = validateRules(registry, discovered);
  if (errors.length) throw new Error(errors.join("\n"));
  const selected: DiscoveredTests = { vitest: [], playwright: [] };
  const reasons: Record<string, string[]> = {};
  for (const rule of registry.rules) {
    if (!paths.some((file) => rule.paths.some((glob) => matchesGlob(file, glob)))) continue;
    for (const reference of rule.vitest) {
      const test = discovered.vitest.find(
        (test) => test.file === reference.file && test.title === reference.title,
      );
      if (test && !selected.vitest.includes(test)) selected.vitest.push(test);
      reasons[reference.title] ??= [];
      reasons[reference.title].push(`rule:${rule.id}`);
    }
    for (const reference of rule.playwright) {
      const test = discovered.playwright.find(
        (test) => test.path === reference.path && test.line === reference.line,
      );
      if (test && !selected.playwright.includes(test)) selected.playwright.push(test);
      reasons[reference.title] ??= [];
      reasons[reference.title].push(`rule:${rule.id}`);
    }
  }
  return { ...selected, reasons };
};

const importsFor = (source: string) => {
  const matches = source.matchAll(
    /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
  );
  return [...matches].map((match) => match[1]);
};

const dependencyClosure = (entry: string, sourceFiles: Record<string, string>) => {
  const visited = new Set<string>();
  const pending = [entry];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    const source = sourceFiles[current];
    if (!source) {
      continue;
    }

    for (const specifier of importsFor(source)) {
      const imported = resolveImport(current, specifier, sourceFiles);
      if (imported && !visited.has(imported)) {
        pending.push(imported);
      }
    }
  }

  return visited;
};

const testCandidates = (candidates: TestCandidates) => [
  ...candidates.vitest,
  ...candidates.playwright.map((candidate) => candidate.path),
];

const selectAll = (candidates: TestCandidates, errors: string[], reasons: string[]) => {
  const impactReasons = new Map<string, Set<string>>();
  for (const test of testCandidates(candidates)) {
    for (const reason of reasons) {
      addReason(impactReasons, test, reason);
    }
  }

  return {
    vitestFiles: [...new Set(candidates.vitest)],
    playwrightTests: [...new Set(candidates.playwright.map((candidate) => candidate.path))],
    reasons: Object.fromEntries(
      [...impactReasons.entries()].map(([test, testReasons]) => [test, sortUnique(testReasons)]),
    ),
    fallback: "all-tests" as const,
    errors: sortUnique(errors),
  };
};

export const selectImpact = ({
  manifest,
  featureMap,
  candidates,
  sourceFiles,
}: SelectionInput): ImpactSelection => {
  const validation = validateFeatureMap(featureMap, candidates.playwright, candidates.vitest);
  const fallbackReasons = [
    ...manifest.uncertainty.map((uncertainty) => `uncertainty:${uncertainty}`),
    ...validation.errors.map((error) => `metadata:${error}`),
  ];

  for (const changed of manifest.files) {
    for (const changedPath of pathVariants(changed)) {
      if (isConfigurationChange(changedPath)) {
        fallbackReasons.push(`configuration:${changedPath}`);
      }
      if (hasUnknownExecutableOwner(changedPath)) {
        fallbackReasons.push(`unknown-owner:${changedPath}`);
      }
    }
  }

  if (fallbackReasons.length > 0) {
    return selectAll(candidates, validation.errors, sortUnique(fallbackReasons));
  }

  const reasons = new Map<string, Set<string>>();
  const vitestCandidates = new Set(candidates.vitest);
  const playwrightCandidates = new Map<string, Set<string>>();
  for (const candidate of candidates.playwright) {
    const tags = playwrightCandidates.get(candidate.path) ?? new Set<string>();
    for (const tag of candidate.tags) tags.add(tag);
    playwrightCandidates.set(candidate.path, tags);
  }
  const allCandidates = testCandidates(candidates);
  const closures = new Map(
    allCandidates.map((candidate) => [candidate, dependencyClosure(candidate, sourceFiles)]),
  );
  const unmappedRuntimePaths: string[] = [];

  for (const changed of manifest.files) {
    const changedTestDirectly = pathVariants(changed).some((changedPath) =>
      allCandidates.includes(changedPath),
    );
    let hasSelectionEvidence = changedTestDirectly;

    for (const candidate of allCandidates) {
      if (pathVariants(changed).includes(candidate)) {
        addReason(reasons, candidate, "direct-test-edit");
        continue;
      }

      const closure = closures.get(candidate) ?? new Set<string>();
      for (const changedPath of pathVariants(changed)) {
        if (closure.has(changedPath)) {
          addReason(reasons, candidate, `static-import:${changedPath}`);
          hasSelectionEvidence = true;
        }
      }
    }

    const matchedFeatures = changedTestDirectly
      ? []
      : featureMap.features.filter((feature) =>
          pathVariants(changed).some((changedPath) =>
            feature.paths.some((pattern) => matchesGlob(changedPath, pattern)),
          ),
        );

    for (const feature of matchedFeatures) {
      hasSelectionEvidence = true;
      for (const test of feature.vitest) {
        if (vitestCandidates.has(test)) {
          addReason(reasons, test, `feature:${feature.id}`);
        }
      }

      for (const [test, tags] of playwrightCandidates) {
        if (feature.playwrightTags.some((tag) => tags.has(tag))) {
          addReason(reasons, test, `feature:${feature.id}`);
        }
      }
    }

    for (const changedPath of pathVariants(changed)) {
      if (isRuntimeFile(changedPath) && !hasSelectionEvidence) {
        unmappedRuntimePaths.push(changedPath);
      }
    }
  }

  if (unmappedRuntimePaths.length > 0) {
    return selectAll(
      candidates,
      validation.errors,
      sortUnique(unmappedRuntimePaths.map((changedPath) => `unmapped-runtime:${changedPath}`)),
    );
  }

  const selected = sortUnique(reasons.keys());
  return {
    vitestFiles: selected.filter((test) => vitestCandidates.has(test)),
    playwrightTests: selected.filter((test) => playwrightCandidates.has(test)),
    reasons: Object.fromEntries(
      selected.map((test) => [test, sortUnique(reasons.get(test) ?? [])]),
    ),
    fallback: "none",
    errors: validation.errors,
  };
};
