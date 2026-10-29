import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { readChangedFiles } from "./changed-files.ts";
import { normalizeRepoPath } from "./coverage-policy.ts";
import { harnessManifestSchema, validateHarness } from "./harness-manifest.ts";
import { parsePlaywrightIdentities } from "./playwright-discovery.ts";
import { canonicalCommandKeys, selectImpact } from "./select.ts";
import type { DiscoveredTests, HarnessCommand, HarnessManifest, ImpactSelection } from "./types.ts";
import { renderRules, rulesSchema, validateRules } from "./validate.ts";

const walkFiles = (cwd: string, directory: string): string[] => {
  if (!existsSync(path.join(cwd, directory))) return [];
  return readdirSync(path.join(cwd, directory), { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name.startsWith(".") ||
      [
        "node_modules",
        "dist",
        "artifacts",
        "coverage",
        "test-results",
        "playwright-report",
      ].includes(entry.name)
    )
      return [];
    const relative = path.posix.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(cwd, relative) : entry.isFile() ? [relative] : [];
  });
};
type RunnerPlan = HarnessCommand & {
  workspace: string;
  runner: "vitest" | "playwright";
  dependencies: string[];
};
const json = (cwd: string, file: string) => JSON.parse(readFileSync(path.join(cwd, file), "utf8"));
// Nx target strings are metadata only: accept simple argv, never evaluate a shell.
const argv = (command: string): string[] => {
  if (!/^[\w./:@= -]+$/.test(command))
    throw new Error(`Unsupported runner command metadata: ${command}`);
  return command.trim().split(/\s+/);
};
const plansFor = (cwd: string, manifest: HarnessManifest): RunnerPlan[] => {
  const plans: RunnerPlan[] = [];
  for (const workspace of manifest.workspaces) {
    const projectFile = `${workspace.path}/project.json`;
    const project = existsSync(path.join(cwd, projectFile)) ? json(cwd, projectFile) : undefined;
    for (const runner of ["vitest", "playwright"] as const) {
      if (runner === "vitest" ? !workspace.unitCommand : !workspace.browserCommands.length)
        continue;
      if (runner === "playwright" && workspace.browserCommands.length > 1)
        throw new Error(`Ambiguous browser command adapters:${workspace.path}`);
      const targets = Object.values(project?.targets ?? {}).filter(
        (target) =>
          typeof (target as { command?: string }).command === "string" &&
          new RegExp(`\\b${runner} ${runner === "vitest" ? "run" : "test"}\\b`).test(
            (target as { command: string }).command,
          ),
      ) as { command: string; dependsOn?: { projects: string[]; target: string }[] }[];
      // Coverage/watch targets are not diagnostic test targets.
      const targetsWithoutCoverage = targets.filter(
        (target) => !target.command.includes("--coverage"),
      );
      if (targetsWithoutCoverage.length > 1)
        throw new Error(`Ambiguous ${runner} target:${workspace.path}`);
      const target = targetsWithoutCoverage[0];
      if (project && !target) {
        if (runner === "playwright") continue; // An application can delegate browser coverage to its browser workspace.
        throw new Error(`Missing ${runner} target:${workspace.path}`);
      }
      const key =
        runner === "vitest" ? (workspace.unitCommand as string) : workspace.browserCommands[0];
      const command = target ? { argv: argv(target.command), cwd: "." } : manifest.commands[key];
      if (!command.argv.includes(runner)) throw new Error(`No exact ${runner} adapter:${key}`);
      const dependencies = (target?.dependsOn ?? []).flatMap((dependency) => {
        if (!Array.isArray(dependency.projects) || !dependency.target)
          throw new Error(`Unsupported target dependency:${workspace.path}`);
        return dependency.projects.map((project) => `${project}:${dependency.target}`);
      });
      plans.push({ ...command, workspace: workspace.path, runner, dependencies });
    }
  }
  return plans;
};
const invoke = (cwd: string, command: HarnessCommand, capture = false) => {
  const [binary, ...args] = command.argv;
  const result = spawnSync(binary, args, {
    cwd: path.join(cwd, command.cwd),
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `Command failed (${result.status}): ${command.argv.join(" ")}\n${result.stderr ?? ""}\n${result.stdout ?? ""}`,
    );
  return capture ? JSON.parse(result.stdout) : undefined;
};
const listCommand = (plan: RunnerPlan) => {
  const command = { argv: [...plan.argv], cwd: plan.cwd };
  if (plan.runner === "vitest") {
    command.argv[command.argv.indexOf("vitest") + 1] = "list";
    command.argv.push("--json", "--includeTaskLocation");
  } else command.argv.push("--project=chromium", "--list", "--reporter=json");
  return command;
};
export const discoverCandidates = (cwd: string, manifest: HarnessManifest) => {
  const files = [
    ...new Set(manifest.workspaces.flatMap((workspace) => walkFiles(cwd, workspace.path))),
  ].sort();
  const sourceFiles = Object.fromEntries(
    files
      .filter((file) => /\.[cm]?[jt]sx?$/.test(file))
      .map((file) => [file, readFileSync(path.join(cwd, file), "utf8")]),
  );
  const identities: DiscoveredTests = { vitest: [], playwright: [] };
  const plans = plansFor(cwd, manifest);
  for (const plan of plans) {
    const report = invoke(cwd, listCommand(plan), true);
    if (plan.runner === "vitest") {
      const tests = z
        .array(
          z.object({
            name: z.string().min(1),
            file: z.string().min(1),
            location: z.object({ line: z.number().int().positive() }),
          }),
        )
        .parse(report);
      identities.vitest.push(
        ...tests.map((test) => ({
          file: normalizeRepoPath(test.file, cwd),
          title: test.name,
          line: test.location.line,
        })),
      );
    } else {
      const root = report.config?.rootDir;
      if (typeof root !== "string") throw new Error("Missing Playwright discovery rootDir");
      identities.playwright.push(
        ...parsePlaywrightIdentities(report, root).map((test) => ({
          ...test,
          path: normalizeRepoPath(test.path, cwd),
        })),
      );
    }
  }
  for (const file of files.filter((file) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))) {
    if (
      !identities.vitest.some((test) => test.file === file) &&
      !identities.playwright.some((test) => test.path === file)
    )
      throw new Error(`Undiscovered test file:${file}`);
  }
  for (const test of identities.vitest)
    if (
      identities.vitest.filter(
        (other) =>
          other.file === test.file &&
          other.title.replaceAll(" > ", " ") === test.title.replaceAll(" > ", " "),
      ).length !== 1
    )
      throw new Error(`Ambiguous Vitest identity:${test.file}:${test.title}`);
  for (const test of identities.playwright)
    if (
      identities.playwright.filter((other) => other.path === test.path && other.line === test.line)
        .length !== 1
    )
      throw new Error(`Ambiguous Playwright identity:${test.path}:${test.line}`);
  return { identities, sourceFiles, plans };
};
export const runCanonicalFull = (cwd: string, manifest: HarnessManifest) => {
  const errors: string[] = [];
  for (const key of canonicalCommandKeys(manifest)) {
    try {
      invoke(cwd, manifest.commands[key]);
    } catch (error) {
      errors.push(String(error));
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
};
export const runSelection = (cwd: string, selection: DiscoveredTests, plans: RunnerPlan[]) => {
  const built = new Set<string>();
  for (const runner of ["vitest", "playwright"] as const) {
    for (const test of selection[runner]) {
      const file = "file" in test ? test.file : test.path;
      const matches = plans.filter(
        (plan) => plan.runner === runner && file.startsWith(`${plan.workspace}/`),
      );
      if (matches.length !== 1) throw new Error(`Ambiguous exact runner:${file}`);
      const plan = matches[0];
      for (const dependency of plan.dependencies)
        if (!built.has(dependency)) {
          invoke(cwd, {
            argv: [...plan.argv.slice(0, plan.argv.indexOf(runner)), "nx", "run", dependency],
            cwd: ".",
          });
          built.add(dependency);
        }
      // Keep runner configuration/flags; remove existing positional file filters.
      const index = plan.argv.indexOf(runner);
      const options: string[] = [];
      for (let i = index + 2; i < plan.argv.length; i++) {
        const arg = plan.argv[i];
        if (!arg.startsWith("-")) continue;
        options.push(arg);
        if (!arg.includes("=") && plan.argv[i + 1] && !plan.argv[i + 1].startsWith("-"))
          options.push(plan.argv[++i]);
      }
      const relative = path.relative(path.join(cwd, plan.cwd), path.join(cwd, file));
      const exact =
        runner === "vitest"
          ? [
              relative,
              "--testNamePattern",
              `^${test.title
                .split(" > ")
                .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                .join("(?: > | )")}$`,
            ]
          : [
              "--project=chromium",
              `^${path.join(cwd, file).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$:${test.line}`,
            ];
      const command = {
        cwd: plan.cwd,
        argv: [...plan.argv.slice(0, index + 2), ...options, ...exact],
      };
      if (runner === "vitest") {
        const report = invoke(
          cwd,
          { ...command, argv: [...command.argv, "--reporter=json"] },
          true,
        );
        const passed = report.testResults
          .flatMap(
            (result: { assertionResults: { fullName: string; status: string }[] }) =>
              result.assertionResults,
          )
          .filter((result: { status: string }) => result.status === "passed");
        if (passed.length !== 1 || !new RegExp(exact[2]).test(passed[0].fullName))
          throw new Error(`Selected identity did not execute exactly once:${file}:${test.title}`);
      } else invoke(cwd, command);
    }
  }
};
const writeArtifact = (cwd: string, name: string, value: unknown) => {
  const directory = path.join(cwd, "artifacts/impact");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
};
export const main = (cwd = process.cwd(), args = process.argv.slice(2)) => {
  if (args.includes("--generate-rules")) {
    const manifest = harnessManifestSchema.parse(json(cwd, "proofline.harness.json"));
    const registry = rulesSchema.parse(json(cwd, manifest.ruleRegistry));
    writeFileSync(
      path.join(cwd, manifest.ruleRegistry.replace(/\.json$/, ".md")),
      renderRules(registry),
    );
    return;
  }
  if (args.includes("--validate-harness")) {
    let errors: string[];
    try {
      errors = validateHarness({ cwd, manifest: json(cwd, "proofline.harness.json") }).errors;
    } catch (error) {
      errors = [String(error)];
    }
    mkdirSync(path.join(cwd, "artifacts/harness"), { recursive: true });
    writeFileSync(
      path.join(cwd, "artifacts/harness/validation.json"),
      `${JSON.stringify({ errors }, null, 2)}\n`,
    );
    if (errors.length) throw new Error(errors.join("\n"));
    return;
  }
  const changes = readChangedFiles({ cwd });
  writeArtifact(cwd, "manifest.json", changes);
  writeArtifact(cwd, "discovery.json", {
    vitest: [],
    playwright: [],
    errors: ["Discovery has not completed"],
  });
  let manifest: HarnessManifest;
  try {
    manifest = harnessManifestSchema.parse(json(cwd, "proofline.harness.json"));
  } catch (error) {
    writeArtifact(cwd, "selection.json", {
      fallback: "canonical-full",
      commandKeys: ["unit", "browser"],
      rationale: Object.fromEntries(
        changes.files
          .flatMap((file) => [file.path, ...(file.previousPath ? [file.previousPath] : [])])
          .map((file) => [file, []]),
      ),
      pathReasons: Object.fromEntries(
        changes.files
          .flatMap((file) => [file.path, ...(file.previousPath ? [file.previousPath] : [])])
          .map((file) => [file, [String(error)]]),
      ),
      errors: [String(error)],
      executionBlocked: true,
    });
    throw error;
  }
  const commandValidation = validateHarness({ cwd, manifest });
  if (commandValidation.commandErrors.length) {
    const blocked = selectImpact({
      manifest,
      changes: {
        ...changes,
        uncertainty: [...changes.uncertainty, ...commandValidation.commandErrors],
      },
      discovered: { vitest: [], playwright: [] },
      sourceFiles: {},
    });
    writeArtifact(cwd, "selection.json", {
      ...blocked,
      executionBlocked: true,
      dryRun: args.includes("--dry-run"),
    });
    throw new Error(commandValidation.commandErrors.join("\n"));
  }
  let selection: ImpactSelection;
  let plans: RunnerPlan[] = [];
  try {
    const discovery = discoverCandidates(cwd, manifest);
    plans = discovery.plans;
    writeArtifact(cwd, "discovery.json", discovery.identities);
    const registry = rulesSchema.parse(json(cwd, manifest.ruleRegistry));
    const errors = [
      ...validateHarness({ cwd, manifest, discovered: discovery.identities }).errors,
      ...validateRules(
        registry,
        discovery.identities,
        readFileSync(path.join(cwd, manifest.ruleRegistry.replace(/\.json$/, ".md")), "utf8"),
        manifest,
      ).errors,
    ];
    selection = selectImpact({
      manifest,
      changes: { ...changes, uncertainty: [...changes.uncertainty, ...errors] },
      discovered: discovery.identities,
      sourceFiles: discovery.sourceFiles,
    });
  } catch (error) {
    writeArtifact(cwd, "discovery.json", { vitest: [], playwright: [], errors: [String(error)] });
    selection = selectImpact({
      manifest,
      changes: { ...changes, uncertainty: [...changes.uncertainty, String(error)] },
      discovered: { vitest: [], playwright: [] },
      sourceFiles: {},
    });
  }
  writeArtifact(cwd, "selection.json", {
    ...selection,
    dryRun: args.includes("--dry-run"),
    executionBlocked: false,
  });
  process.stdout.write(
    `${JSON.stringify({ fallback: selection.fallback, commandKeys: selection.commandKeys, vitest: selection.identities.vitest.length, playwright: selection.identities.playwright.length, artifacts: "artifacts/impact" }, null, 2)}\n`,
  );
  if (!args.includes("--dry-run")) {
    if (selection.fallback === "canonical-full") runCanonicalFull(cwd, manifest);
    else runSelection(cwd, selection.identities, plans);
  }
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
