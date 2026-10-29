import path from "node:path";
import ts from "typescript";
import type {
  ChangeManifest,
  DiscoveredTests,
  HarnessManifest,
  HarnessTestBinding,
  ImpactSelection,
  PlaywrightIdentity,
  RuleRegistry,
  VitestIdentity,
} from "./types.ts";
import { validateRules } from "./validate.ts";
import { resolveWorkspace } from "./workspaces.ts";

const unique = (values: string[]) => [...new Set(values)].sort();
const configuration = (file: string) =>
  /(?:^|\/)(?:package\.json|project\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|nx\.json|biome\.json|proofline\.harness\.json|tsconfig[^/]*\.json|(?:vite|vitest|playwright)\.config\.[^/]+)$/.test(
    file,
  ) ||
  file.startsWith(".github/") ||
  file.startsWith("test-impact/");
const executable = (file: string) => /\.(?:[cm]?[jt]sx?|css|json|html|vue|svelte|wasm)$/.test(file);
const pattern = (title: string) =>
  `^${title
    .split(" > ")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("(?: > | )")}$`;
export const vitestCommand = (test: VitestIdentity, config?: string) => [
  "exec",
  "vitest",
  "run",
  ...(config ? ["--config", config] : []),
  test.file,
  "--testNamePattern",
  pattern(test.title),
];
export const playwrightCommand = (tests: PlaywrightIdentity[], config?: string) => [
  "exec",
  "playwright",
  "test",
  ...(config ? ["--config", config] : []),
  ...tests.map(
    (test) => `(?:^|/)${test.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$:${test.line}`,
  ),
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
    if (!paths.some((file) => rule.paths.some((glob) => path.matchesGlob(file, glob)))) continue;
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

const imports = (file: string, text: string) => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const result: { target?: string; dynamic: boolean }[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    )
      result.push({ target: node.moduleSpecifier.text, dynamic: false });
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      result.push({
        target:
          node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])
            ? node.arguments[0].text
            : undefined,
        dynamic: true,
      });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
};
const resolve = (file: string, target: string | undefined, sources: Record<string, string>) => {
  if (!target?.startsWith(".")) return undefined;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
  return ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"]
    .map((ext) => base + ext)
    .find((candidate) => Object.hasOwn(sources, candidate));
};

export const canonicalCommandKeys = (manifest: HarnessManifest) => [
  ...new Set([
    "unit",
    "browser",
    ...manifest.workspaces.flatMap((workspace) => [
      ...(workspace.unitCommand ? [workspace.unitCommand] : []),
      ...workspace.browserCommands,
    ]),
  ]),
];

export const selectImpact = ({
  manifest,
  changes,
  discovered,
  sourceFiles,
}: {
  manifest: HarnessManifest;
  changes: ChangeManifest;
  discovered: DiscoveredTests;
  sourceFiles: Record<string, string>;
}): ImpactSelection => {
  const errors = [...changes.uncertainty];
  const identities: DiscoveredTests = { vitest: [], playwright: [] };
  const commandKeys: string[] = [];
  const rationale: ImpactSelection["rationale"] = {};
  const bindings = new Map<HarnessTestBinding, VitestIdentity | PlaywrightIdentity>();
  for (const owner of manifest.ownership) {
    for (const binding of owner.testBindings) {
      const matches =
        binding.runner === "vitest"
          ? discovered.vitest.filter(
              (test) =>
                test.file === binding.file &&
                test.title === binding.title &&
                test.line === binding.line,
            )
          : discovered.playwright.filter(
              (test) =>
                test.path === binding.file &&
                test.title === binding.title &&
                test.line === binding.line &&
                (!binding.tag || test.tags.includes(binding.tag)),
            );
      const runnable =
        binding.runner === "vitest"
          ? discovered.vitest.filter(
              (test) =>
                test.file.toLowerCase().includes(binding.file.toLowerCase()) &&
                test.title.replaceAll(" > ", " ") === binding.title.replaceAll(" > ", " "),
            )
          : discovered.playwright.filter(
              (test) => test.path === binding.file && test.line === binding.line,
            );
      if (matches.length !== 1 || runnable.length !== 1)
        errors.push(`missing or ambiguous binding:${binding.testId}`);
      else bindings.set(binding, matches[0]);
    }
  }
  const dependencies = new Map(
    Object.entries(sourceFiles).map(([file, text]) => [file, imports(file, text)]),
  );
  const closure = (entry: string) => {
    const visited = new Set<string>();
    const pending = [entry];
    while (pending.length) {
      const file = pending.pop() as string;
      if (visited.has(file)) continue;
      visited.add(file);
      for (const dependency of dependencies.get(file) ?? []) {
        const target = resolve(file, dependency.target, sourceFiles);
        if (dependency.dynamic) {
          const owners = target
            ? manifest.ownership.filter(
                (owner) =>
                  path.matchesGlob(target, owner.glob) && owner.entrypoints.includes(target),
              )
            : [];
          if (
            owners.length !== 1 ||
            !owners[0].testBindings.length ||
            owners[0].testBindings.some((binding) => !bindings.has(binding))
          )
            errors.push(
              `unresolved dynamic dependency:${file}:${dependency.target ?? "<expression>"}`,
            );
        }
        if (target) pending.push(target);
      }
    }
    return visited;
  };
  for (const changed of changes.files) {
    for (const file of [changed.path, ...(changed.previousPath ? [changed.previousPath] : [])]) {
      rationale[file] = [];
      if (configuration(file)) errors.push(`configuration:${file}`);
      const owners = manifest.ownership.filter((owner) => path.matchesGlob(file, owner.glob));
      const workspace = resolveWorkspace(file, manifest.workspaces);
      if (!owners.length && !executable(file) && (!workspace || /\.(?:md|txt)$/.test(file)))
        continue;
      if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
        errors.push(`direct test change requires full validation:${file}`);
      if (changed.status !== "modified") errors.push(`structural change:${changed.status}:${file}`);
      if (!workspace) errors.push(`unmapped workspace:${file}`);
      if (owners.length !== 1) {
        errors.push(`missing or ambiguous ownership:${file}`);
        continue;
      }
      const owner = owners[0];
      if (
        !owner.testBindings.length ||
        owner.ruleLayers.some(
          (pair) =>
            !owner.testBindings.some(
              (binding) => binding.ruleId === pair.ruleId && binding.layer === pair.layer,
            ),
        )
      )
        errors.push(`unbound ownership:${file}`);
      const reachable = closure(file);
      const relatedOwners = new Map<
        (typeof manifest.ownership)[number],
        Extract<ImpactSelection["rationale"][string][number]["evidence"][number], object>[]
      >([[owner, []]]);
      for (const importer of reachable)
        for (const dependency of dependencies.get(importer) ?? []) {
          if (!dependency.dynamic) continue;
          const target = resolve(importer, dependency.target, sourceFiles);
          if (target && dependency.target)
            for (const targetOwner of manifest.ownership.filter(
              (item) => path.matchesGlob(target, item.glob) && item.entrypoints.includes(target),
            )) {
              const edges = relatedOwners.get(targetOwner) ?? [];
              edges.push({
                kind: "dynamic-import",
                importer,
                specifier: dependency.target,
                resolvedTarget: target,
                targetOwner: targetOwner.glob,
              });
              relatedOwners.set(targetOwner, edges);
            }
        }
      for (const [selectedOwner, dynamicEdges] of relatedOwners)
        for (const binding of selectedOwner.testBindings) {
          const identity = bindings.get(binding);
          if (!identity) {
            const declaredIdentity =
              binding.runner === "vitest"
                ? { file: binding.file, title: binding.title, line: binding.line }
                : {
                    path: binding.file,
                    title: binding.title,
                    line: binding.line,
                    tags: binding.tag ? [binding.tag] : [],
                  };
            rationale[file].push({
              ownership: selectedOwner.glob,
              ruleId: binding.ruleId,
              layer: binding.layer,
              testId: binding.testId,
              commandKey: binding.commandKey,
              identity: declaredIdentity,
              evidence: ["unresolved-manifest-binding"],
            });
            continue;
          }
          const evidence: ImpactSelection["rationale"][string][number]["evidence"] = [
            "manifest-binding",
            ...dynamicEdges,
          ];
          if (closure(binding.file).has(file))
            evidence.push(binding.file === file ? "direct-test-edit" : "static-import");
          rationale[file].push({
            ownership: selectedOwner.glob,
            ruleId: binding.ruleId,
            layer: binding.layer,
            testId: binding.testId,
            commandKey: binding.commandKey,
            identity,
            evidence,
          });
          commandKeys.push(binding.commandKey);
          if (
            binding.runner === "vitest" &&
            !identities.vitest.includes(identity as VitestIdentity)
          )
            identities.vitest.push(identity as VitestIdentity);
          if (
            binding.runner === "playwright" &&
            !identities.playwright.includes(identity as PlaywrightIdentity)
          )
            identities.playwright.push(identity as PlaywrightIdentity);
        }
      // Static dependencies add exact identities only after reviewed ownership succeeds.
      for (const runner of ["vitest", "playwright"] as const) {
        for (const identity of discovered[runner]) {
          const testFile = "file" in identity ? identity.file : identity.path;
          if (
            !closure(testFile).has(file) ||
            (identities[runner] as (VitestIdentity | PlaywrightIdentity)[]).includes(identity)
          )
            continue;
          const testWorkspace = resolveWorkspace(testFile, manifest.workspaces);
          const key =
            runner === "vitest"
              ? testWorkspace?.unitCommand
              : (testWorkspace?.browserDiscoveryCommand ??
                (testWorkspace?.browserCommands.length === 1
                  ? testWorkspace.browserCommands[0]
                  : undefined));
          if (!key) {
            errors.push(`unmapped diagnostic identity:${testFile}`);
            continue;
          }
          rationale[file].push({
            ownership: owner.glob,
            ruleId: null,
            layer: null,
            testId: null,
            commandKey: key,
            identity,
            evidence: ["static-import"],
          });
          commandKeys.push(key);
          (identities[runner] as (VitestIdentity | PlaywrightIdentity)[]).push(identity);
        }
      }
    }
  }
  // File filters are substring matches in Vitest. Validate the complete selected union,
  // including diagnostic import evidence, before any test body can be executed.
  for (const identity of identities.vitest) {
    const exact = discovered.vitest.filter(
      (test) =>
        test.file === identity.file && test.title === identity.title && test.line === identity.line,
    );
    const runnable = discovered.vitest.filter(
      (test) =>
        test.file.toLowerCase().includes(identity.file.toLowerCase()) &&
        test.title.replaceAll(" > ", " ") === identity.title.replaceAll(" > ", " "),
    );
    if (exact.length !== 1 || runnable.length !== 1)
      errors.push(`ambiguous selected Vitest identity:${identity.file}:${identity.title}`);
  }
  const pathReasons = Object.fromEntries(
    Object.keys(rationale).map((file) => [file, errors.filter((error) => error.includes(file))]),
  );
  for (const file of Object.keys(pathReasons))
    if (errors.length && !pathReasons[file].length) pathReasons[file] = [...errors];
  return {
    pathReasons,
    fallback: errors.length ? "canonical-full" : "none",
    commandKeys: errors.length
      ? canonicalCommandKeys(manifest)
      : canonicalCommandKeys(manifest).filter((key) => commandKeys.includes(key)),
    identities: errors.length ? { vitest: [], playwright: [] } : identities,
    rationale,
    errors: unique(errors),
  };
};
