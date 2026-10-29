import {
  accessSync,
  constants,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import ts from "typescript";
import { z } from "zod";
import type { DiscoveredTests } from "./types.ts";
import { relativePath, rulesSchema } from "./validate.ts";
import { resolveWorkspace } from "./workspaces.ts";

const text = z.string().refine((value) => value.trim().length > 0, "Expected non-empty text");
const strings = z.array(text).min(1);
const layer = z.enum(["domain", "service", "runtime", "contract", "ui", "playwright"]);
const commandSchema = z
  .object({
    argv: z.array(text).min(1),
    cwd: z.union([z.literal("."), relativePath]),
    runner: z.enum(["vitest", "playwright"]).optional(),
  })
  .strict();
const identity = { file: relativePath, title: text, line: z.number().int().positive() };
const bindingBase = { ruleId: text, layer, testId: text, commandKey: text, ...identity };
const bindingSchema = z.discriminatedUnion("runner", [
  z.object({ ...bindingBase, runner: z.literal("vitest") }).strict(),
  z
    .object({
      ...bindingBase,
      runner: z.literal("playwright"),
      tag: z
        .string()
        .regex(/^@[^\s]+$/)
        .optional(),
    })
    .strict(),
]);
const ownershipSchema = z
  .object({
    glob: relativePath,
    entrypoints: z.array(relativePath).min(1),
    ruleIds: strings,
    layers: z.array(layer).min(1),
    ruleLayers: z.array(z.object({ ruleId: text, layer }).strict()).min(1),
    testBindings: z.array(bindingSchema).min(1),
  })
  .strict();
const metrics = ["lines", "functions", "branches", "statements"] as const;
const packageName = z
  .string()
  .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i, "Expected package name");
const coverageProducerSchema = z
  .object({
    command: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("nx-target"), target: text }).strict(),
      z.object({ kind: z.literal("manifest-command"), commandKey: text }).strict(),
    ]),
    adapter: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("vitest"),
          implementation: text,
          version: z.object({ kind: z.literal("package-json"), package: packageName }).strict(),
        })
        .strict(),
      z
        .object({
          kind: z.literal("istanbul-summary"),
          implementation: text,
          reportFormatArg: text,
          reportPathArg: text,
          version: z.object({ kind: z.literal("package-json"), package: packageName }).strict(),
        })
        .strict(),
    ]),
  })
  .strict();
const coverageSchema = z
  .object({
    workspace: relativePath,
    provider: text,
    providerVersion: text,
    sourceGlobs: z.array(relativePath).min(1),
    exclusions: z.array(z.object({ glob: relativePath, reason: text }).strict()),
    report: relativePath,
    reportFormat: z.literal("istanbul-json-summary"),
    metrics: z
      .array(z.enum(metrics))
      .length(4)
      .refine((values) => new Set(values).size === 4, "All four coverage metrics are required"),
    aggregation: z.literal("per-file"),
    // Optional only so merge-base manifests written before producer adapters remain parseable.
    // Proposed manifests are required to declare it by semantic validation below.
    producer: coverageProducerSchema.optional(),
  })
  .strict();
export const harnessManifestSchema = z
  .object({
    version: z.literal(1),
    commands: z
      .record(text, commandSchema)
      .refine(
        (commands) =>
          [
            "lint",
            "typecheck",
            "unit",
            "browser",
            "coverage",
            "coverageCheck",
            "recordCheck",
          ].every((key) => commands[key]),
        "Missing canonical command",
      ),
    workspaces: z
      .array(
        z
          .object({
            path: relativePath,
            unitCommand: text.nullable(),
            browserCommands: z.array(text),
            browserDiscoveryCommand: text.optional(),
            browserOptOutReason: z.string().optional(),
          })
          .strict()
          .refine(
            (workspace) =>
              workspace.browserCommands.length || workspace.browserOptOutReason?.trim(),
            "Empty browser commands require browserOptOutReason",
          ),
      )
      .min(1),
    browser: z
      .object({
        projects: z
          .array(z.enum(["chromium", "firefox", "webkit"]))
          .min(1)
          .refine((projects) => projects.includes("chromium"), "Chromium is required"),
        crossBrowserSmokeProjects: z.array(z.enum(["firefox", "webkit"])),
        localOrigins: z
          .array(
            z
              .string()
              .url()
              .refine((origin) => {
                const url = new URL(origin);
                return (
                  ["http:", "https:"].includes(url.protocol) &&
                  ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
                  url.pathname === "/" &&
                  !url.search &&
                  !url.hash &&
                  !url.username &&
                  !url.password
                );
              }, "Expected a loopback origin"),
          )
          .min(1),
        testEntrypoint: text,
      })
      .strict(),
    adapters: z
      .object({
        testModeEnvironment: relativePath,
        auth: relativePath,
        api: relativePath,
        providers: z.array(relativePath),
        runnerEgress: relativePath.optional(),
      })
      .strict(),
    coverage: z.array(coverageSchema).min(1),
    ownership: z.array(ownershipSchema).min(1),
    ruleRegistry: relativePath,
    lifecycleMatrix: relativePath.nullable(),
    goldenWorkflowMatrix: relativePath,
  })
  .strict();
export type HarnessCommand = z.infer<typeof commandSchema>;
export type HarnessTestBinding = z.infer<typeof bindingSchema>;
export type HarnessOwnership = z.infer<typeof ownershipSchema>;
export type CoverageGroup = z.infer<typeof coverageSchema>;
export type HarnessManifest = z.infer<typeof harnessManifestSchema>;

export const validateHarnessAuthority = (input: unknown) => {
  const parsed = harnessManifestSchema.safeParse(input);
  if (!parsed.success) return { errors: [`Invalid harness manifest: ${parsed.error.message}`] };
  const manifest = parsed.data;
  const errors: string[] = [];
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) errors.push(`Duplicate ${label}`);
  };
  const workspaces = manifest.workspaces.map((workspace) => workspace.path);
  unique(workspaces, "workspace path");
  unique(
    manifest.coverage.map((group) => group.report),
    "coverage report",
  );
  unique(
    manifest.coverage.map((group) =>
      JSON.stringify([
        group.workspace,
        [...group.sourceGlobs].sort(),
        group.exclusions.map((entry) => entry.glob).sort(),
      ]),
    ),
    "coverage source group",
  );
  for (const group of manifest.coverage) {
    if (!workspaces.includes(group.workspace))
      errors.push(`Unknown coverage workspace: ${group.workspace}`);
    if (!group.producer) errors.push(`Missing coverage producer: ${group.report}`);
    else if (
      group.producer.command.kind === "manifest-command" &&
      !manifest.commands[group.producer.command.commandKey]
    )
      errors.push(`Unknown coverage producer command: ${group.producer.command.commandKey}`);
    unique(group.sourceGlobs, "coverage source glob");
    unique(
      group.exclusions.map((entry) => entry.glob),
      "coverage exclusion glob",
    );
    for (const glob of [...group.sourceGlobs, ...group.exclusions.map((entry) => entry.glob)])
      if (!glob.startsWith(`${group.workspace}/`))
        errors.push(`Coverage glob outside workspace: ${glob}`);
  }
  unique(
    manifest.ownership.map((owner) => owner.glob),
    "ownership glob",
  );
  unique(
    manifest.ownership.flatMap((owner) => owner.testBindings.map((binding) => binding.testId)),
    "binding ID",
  );
  return { errors };
};

const lifecycleRow = z
  .object({
    state: text,
    operation: text,
    role: text,
    tenantScope: text,
    expectedResult: z.enum(["accepted", "rejected", "no-op"]),
    nextState: text.nullable(),
    ruleIds: strings,
    testLayer: layer,
  })
  .strict()
  .superRefine((row, context) => {
    if (
      row.expectedResult === "accepted"
        ? row.nextState === null
        : row.nextState !== null && row.nextState !== row.state
    )
      context.addIssue({
        code: "custom",
        message:
          "Accepted rows require a nextState; rejected/no-op rows require null or unchanged state",
      });
  });
export const lifecycleMatrixSchema = z
  .object({
    version: z.literal(1),
    unchangedStateConvention: z.literal("null-or-same"),
    rows: z.array(lifecycleRow).min(1),
  })
  .strict();
export type LifecycleMatrix = z.infer<typeof lifecycleMatrixSchema>;
const goldenEvidence = z
  .object({
    rowId: text,
    commandKey: text,
    file: relativePath,
    title: text,
    line: z.number().int().positive(),
    tag: z.string().regex(/^@[^\s]+$/),
    ruleIds: strings,
  })
  .strict();
const goldenRow = z
  .object({
    id: text,
    status: z.enum(["planned", "implemented", "excluded"]),
    adapterSetup: strings,
    userActions: z.array(text),
    urlTransitions: z.array(text),
    visibleAssertions: z.array(text),
    persistedInvariants: strings,
    ruleIds: strings,
    evidence: z.array(goldenEvidence).default([]),
    exclusions: z.array(
      z
        .object({
          operation: text,
          reason: text,
          ownerLayer: z.enum(["domain", "service", "runtime", "contract", "ui"]),
          ruleIds: strings,
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((row, context) => {
    if (row.status === "excluded") {
      if (
        !row.exclusions.length ||
        row.userActions.length ||
        row.urlTransitions.length ||
        row.visibleAssertions.length ||
        row.evidence.length
      )
        context.addIssue({
          code: "custom",
          message:
            "Excluded workflows require explicit owners/reasons and no claimed browser actions",
        });
    } else if (
      !row.userActions.length ||
      !row.urlTransitions.length ||
      !row.visibleAssertions.length
    )
      context.addIssue({
        code: "custom",
        message: "Golden workflows require actions, URL transitions, and visible assertions",
      });
    if (row.status === "implemented" && !row.evidence.length)
      context.addIssue({
        code: "custom",
        message: "Implemented golden workflows require exact browser evidence",
      });
    for (const evidence of row.evidence)
      if (evidence.rowId !== row.id)
        context.addIssue({
          code: "custom",
          message: `Golden evidence row ID ${evidence.rowId} does not match ${row.id}`,
        });
    const evidenceRules = new Set(row.evidence.flatMap((evidence) => evidence.ruleIds));
    if (
      row.status === "implemented" &&
      (evidenceRules.size !== new Set(row.ruleIds).size ||
        row.ruleIds.some((rule) => !evidenceRules.has(rule)))
    )
      context.addIssue({
        code: "custom",
        message: "Golden evidence must cover exactly the workflow rule IDs",
      });
    for (const evidence of row.evidence)
      for (const rule of evidence.ruleIds)
        if (!row.ruleIds.includes(rule))
          context.addIssue({
            code: "custom",
            message: `Golden evidence claims rule ${rule} outside workflow ${row.id}`,
          });
  });
export const goldenWorkflowMatrixSchema = z
  .object({
    version: z.literal(1),
    tenantIsolationMode: z.enum(["visible-switch", "authenticated-contexts"]),
    rows: z.array(goldenRow).min(1),
  })
  .strict();
export type GoldenWorkflowMatrix = z.infer<typeof goldenWorkflowMatrixSchema>;

const discoveredSchema = z
  .object({
    vitest: z.array(z.object(identity).strict()),
    playwright: z.array(
      z
        .object({
          path: relativePath,
          title: text,
          line: z.number().int().positive(),
          tags: z.array(text),
        })
        .strict(),
    ),
  })
  .strict();

// Parse literal declarations only. Dynamic/parameterized identities require runner-supplied
// discovery; never evaluate a test module (or a manifest command) during static validation.
const staticIdentities = (cwd: string, bindings: HarnessTestBinding[]): DiscoveredTests => {
  const result: DiscoveredTests = { vitest: [], playwright: [] };
  for (const file of new Set(bindings.map((binding) => binding.file))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(path.join(cwd, file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const runner = bindings.find((binding) => binding.file === file)?.runner;
    const literal = (node: ts.Node | undefined): string | undefined =>
      node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        ? node.text
        : undefined;
    const visit = (node: ts.Node, suites: string[], inheritedTags: string[]) => {
      if (ts.isCallExpression(node)) {
        const call = node.expression.getText(source);
        const isSuite = ["describe", "test.describe"].includes(call);
        const isTest = ["test", "it"].includes(call);
        const title = literal(node.arguments[0]);
        if ((isSuite || isTest) && title !== undefined) {
          const tags = [...inheritedTags, ...(title.match(/@[^\s]+/g) ?? [])];
          const options = node.arguments[1];
          if (options && ts.isObjectLiteralExpression(options)) {
            for (const property of options.properties) {
              if (
                ts.isPropertyAssignment(property) &&
                property.name.getText(source).replaceAll(/["']/g, "") === "tag"
              ) {
                const values = ts.isArrayLiteralExpression(property.initializer)
                  ? property.initializer.elements
                  : [property.initializer];
                for (const value of values) {
                  const tag = literal(value);
                  if (tag) tags.push(tag);
                }
              }
            }
          }
          if (isTest) {
            const fullTitle = [...suites, title].join(" > ");
            const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
            if (runner === "vitest") result.vitest.push({ file, title: fullTitle, line });
            else result.playwright.push({ path: file, title: fullTitle, line, tags });
            return;
          }
          for (const argument of node.arguments)
            if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))
              visit(argument.body, [...suites, title], tags);
          return;
        }
      }
      if (ts.isSourceFile(node) || ts.isBlock(node)) {
        for (const statement of node.statements)
          if (ts.isExpressionStatement(statement))
            visit(statement.expression, suites, inheritedTags);
      }
    };
    visit(source, [], []);
  }
  return result;
};

const validateHarnessUnchecked = ({
  cwd,
  manifest: input,
  discovered,
}: {
  cwd: string;
  manifest: unknown;
  discovered?: DiscoveredTests;
}): { errors: string[]; commandErrors: string[] } => {
  const parsed = harnessManifestSchema.safeParse(input);
  if (!parsed.success)
    return {
      errors: [`Invalid harness manifest: ${parsed.error.message}`],
      commandErrors: [`Invalid harness manifest: ${parsed.error.message}`],
    };
  const manifest = parsed.data;
  const errors: string[] = [];
  const root = realpathSync(cwd);
  const inspectPath = (relative: string, kind: "file" | "directory" | "output" = "file") => {
    const absolute = path.join(root, relative);
    let existing = absolute;
    while (!existsSync(existing) && existing !== root) existing = path.dirname(existing);
    const resolved = realpathSync(existing);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      errors.push(`Path escapes outside repository: ${relative}`);
      return false;
    }
    if (
      kind !== "output" &&
      (!existsSync(absolute) ||
        (kind === "file" ? !statSync(absolute).isFile() : !statSync(absolute).isDirectory()))
    ) {
      errors.push(`Missing ${kind}: ${relative}`);
      return false;
    }
    return true;
  };
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) errors.push(`Duplicate ${label}`);
  };
  const commandErrors: string[] = [];
  const commandError = (message: string) => {
    errors.push(message);
    commandErrors.push(message);
  };
  const commandKey = (key: string) => {
    if (!manifest.commands[key]) commandError(`Unknown command key: ${key}`);
  };
  const canonicalRunners: Record<string, "vitest" | "playwright" | null> = {
    lint: null,
    typecheck: null,
    unit: "vitest",
    browser: "playwright",
    coverage: null,
    coverageCheck: null,
    recordCheck: null,
  };
  const commandRole = (key: string, runner: "vitest" | "playwright") => {
    const actual = Object.hasOwn(canonicalRunners, key)
      ? canonicalRunners[key]
      : manifest.commands[key]?.runner;
    if (actual !== runner) commandError(`Command ${key} has no ${runner} test role`);
  };
  const executable = (name: string) => {
    if (name.includes("/") || name.includes("\\")) return false;
    return [
      path.join(root, "node_modules/.bin"),
      ...(process.env.PATH ?? "").split(path.delimiter),
    ].some((directory) => {
      try {
        accessSync(path.join(directory, name), constants.X_OK);
        return statSync(path.join(directory, name)).isFile();
      } catch {
        return false;
      }
    });
  };
  for (const [key, command] of Object.entries(manifest.commands)) {
    if (
      command.runner &&
      Object.hasOwn(canonicalRunners, key) &&
      command.runner !== canonicalRunners[key]
    )
      errors.push(`Command ${key} runner conflicts with its canonical role`);
    if (!inspectPath(command.cwd, "directory")) continue;
    const [binary, ...args] = command.argv;
    if (!executable(binary)) {
      errors.push(`${key}: unknown executable ${binary}`);
      continue;
    }
    if (["pnpm", "npm", "yarn"].includes(binary)) {
      if (args[0] === "exec") {
        try {
          if (!args[1] || args[1].includes("/") || args[1].includes("\\"))
            throw new Error("Invalid package binary name");
          const binaryPath = path.join(root, "node_modules/.bin", args[1]);
          accessSync(binaryPath, constants.X_OK);
          if (!statSync(binaryPath).isFile()) throw new Error("Not a package binary file");
        } catch {
          errors.push(`${key}: missing or non-executable package executable`);
        }
      } else {
        try {
          const packageFile = path.posix.join(
            command.cwd === "." ? "" : command.cwd,
            "package.json",
          );
          if (!inspectPath(packageFile)) continue;
          const pkg = JSON.parse(readFileSync(path.join(root, packageFile), "utf8"));
          const script = args[0] === "run" ? args[1] : args[0];
          if (!script || typeof pkg.scripts?.[script] !== "string" || !pkg.scripts[script].trim())
            errors.push(`${key}: missing package script ${script}`);
        } catch (error) {
          errors.push(`${key}: invalid package scripts: ${String(error)}`);
        }
      }
    } else if (binary === "node") {
      const script = args.find((arg) => !arg.startsWith("-"));
      if (
        !script ||
        !relativePath.safeParse(script).success ||
        !inspectPath(path.posix.join(command.cwd, script))
      )
        errors.push(`${key}: missing repository Node entrypoint`);
    }
  }
  commandErrors.push(...errors);
  const workspacePaths = manifest.workspaces.map((workspace) => workspace.path);
  unique(workspacePaths, "workspace");
  for (const workspace of manifest.workspaces) {
    inspectPath(workspace.path, "directory");
    if (workspace.unitCommand) {
      commandKey(workspace.unitCommand);
      commandRole(workspace.unitCommand, "vitest");
    } else if (!workspace.browserCommands.length)
      commandError(`${workspace.path}: workspace has no test command`);
    for (const key of workspace.browserCommands) {
      commandKey(key);
      commandRole(key, "playwright");
    }
    if (workspace.browserCommands.length) {
      const discovery =
        workspace.browserDiscoveryCommand ??
        (workspace.browserCommands.length === 1 ? workspace.browserCommands[0] : undefined);
      if (!discovery)
        commandError(
          `${workspace.path}: multiple browser commands require browserDiscoveryCommand`,
        );
      else if (!workspace.browserCommands.includes(discovery))
        commandError(`${workspace.path}: browserDiscoveryCommand must name a browser command`);
      else commandRole(discovery, "playwright");
    } else if (workspace.browserDiscoveryCommand)
      commandError(`${workspace.path}: browserDiscoveryCommand requires browserCommands`);
    unique(workspace.browserCommands, "workspace browser command");
  }
  if (manifest.adapters.runnerEgress) {
    const runnerEgress = manifest.adapters.runnerEgress;
    inspectPath(runnerEgress);
    const usesRunnerEgress = (command: HarnessCommand) => {
      const [binary, ...args] = command.argv;
      if (binary === "node") return args.find((arg) => !arg.startsWith("-")) === runnerEgress;
      if (!["pnpm", "npm", "yarn"].includes(binary)) return false;
      const script = args[0] === "run" ? args[1] : args[0];
      if (!script) return false;
      try {
        const packageFile = path.posix.join(command.cwd === "." ? "" : command.cwd, "package.json");
        const pkg = JSON.parse(readFileSync(path.join(root, packageFile), "utf8"));
        const body = pkg.scripts?.[script];
        return (
          typeof body === "string" &&
          new RegExp(
            `^node(?:\\s+--[\\w-]+(?:=[^\\s]+)?)?\\s+${runnerEgress.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?:\\s|$)`,
          ).test(body.trim())
        );
      } catch {
        return false;
      }
    };
    const runnerCommands = new Set([
      "unit",
      "browser",
      ...manifest.workspaces.flatMap((workspace) => [
        ...(workspace.unitCommand ? [workspace.unitCommand] : []),
        ...workspace.browserCommands,
      ]),
    ]);
    for (const key of runnerCommands)
      if (manifest.commands[key] && !usesRunnerEgress(manifest.commands[key]))
        commandError(`Test command ${key} bypasses the runner egress adapter`);
  }
  const files: string[] = [];
  const projectRoots = new Set<string>();
  const projectNames = new Set<string>();
  const findProjects = (directory: string) => {
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
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
        continue;
      const relative = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) findProjects(relative);
      else if (entry.isFile()) {
        files.push(relative);
        if (entry.name !== "project.json") continue;
        projectRoots.add(directory);
        if (!workspacePaths.includes(directory))
          errors.push(`Unregistered Nx workspace: ${directory}`);
        try {
          const project = z
            .object({
              name: text,
              root: relativePath.optional(),
              targets: z.record(z.unknown()).optional(),
            })
            .passthrough()
            .parse(JSON.parse(readFileSync(path.join(root, relative), "utf8")));
          if (project.root && project.root !== directory)
            errors.push(`Workspace root mismatch: ${relative}`);
          if (projectNames.has(project.name))
            errors.push(`Duplicate workspace name: ${project.name}`);
          projectNames.add(project.name);
          const workspace = manifest.workspaces.find((item) => item.path === directory);
          if (workspace?.unitCommand && project.targets && !project.targets.test)
            errors.push(`Workspace ${directory} has no unit test target`);
        } catch (error) {
          errors.push(`Invalid workspace metadata ${relative}: ${String(error)}`);
        }
      }
    }
  };
  findProjects("");
  if (projectRoots.size)
    for (const workspace of workspacePaths)
      if (!projectRoots.has(workspace)) errors.push(`Not an Nx workspace: ${workspace}`);
  const inspectGlob = (glob: string) => {
    const literalPrefix = glob.split(/[?*[{]/)[0];
    const prefix =
      literalPrefix === glob
        ? glob
        : literalPrefix.endsWith("/")
          ? literalPrefix.slice(0, -1)
          : path.posix.dirname(literalPrefix);
    if (prefix) inspectPath(prefix, prefix === glob ? "file" : "directory");
    if (!files.some((file) => path.matchesGlob(file, glob)))
      errors.push(`Missing source group: ${glob}`);
  };
  commandKey(manifest.browser.testEntrypoint);
  unique(manifest.browser.projects, "browser project");
  unique(manifest.browser.crossBrowserSmokeProjects, "smoke project");
  for (const project of manifest.browser.crossBrowserSmokeProjects)
    if (!manifest.browser.projects.includes(project))
      errors.push(`Smoke project ${project} is not enabled`);
  for (const project of manifest.browser.projects)
    if (project !== "chromium" && !manifest.browser.crossBrowserSmokeProjects.includes(project))
      errors.push(`Enabled browser ${project} requires a declared smoke scope`);
  for (const file of [
    manifest.adapters.testModeEnvironment,
    manifest.adapters.auth,
    manifest.adapters.api,
    ...manifest.adapters.providers,
  ])
    inspectPath(file);
  unique(
    manifest.coverage.map((group) => group.report),
    "coverage report",
  );
  unique(
    manifest.coverage.map((group) =>
      JSON.stringify([
        group.workspace,
        [...group.sourceGlobs].sort(),
        group.exclusions.map((exclusion) => exclusion.glob).sort(),
      ]),
    ),
    "coverage source group",
  );
  for (const file of files) {
    const reports = manifest.coverage
      .filter(
        (group) =>
          group.sourceGlobs.some((glob) => path.matchesGlob(file, glob)) &&
          !group.exclusions.some((exclusion) => path.matchesGlob(file, exclusion.glob)),
      )
      .map((group) => group.report);
    if (reports.length > 1) errors.push(`Ambiguous coverage source ${file}: ${reports.join(", ")}`);
  }
  for (const group of manifest.coverage) {
    unique(group.sourceGlobs, "coverage source glob");
    unique(
      group.exclusions.map((exclusion) => exclusion.glob),
      "coverage exclusion glob",
    );
    for (const glob of group.sourceGlobs) inspectGlob(glob);
    if (!workspacePaths.includes(group.workspace))
      errors.push(`Unknown coverage workspace: ${group.workspace}`);
    if (!group.producer) errors.push(`Missing coverage producer: ${group.report}`);
    else if (group.producer.command.kind === "manifest-command")
      commandKey(group.producer.command.commandKey);
    else {
      try {
        const project = JSON.parse(
          readFileSync(path.join(root, group.workspace, "project.json"), "utf8"),
        ) as { targets?: Record<string, { command?: unknown }> };
        const coverageCommand = project.targets?.[group.producer.command.target]?.command;
        if (typeof coverageCommand !== "string")
          errors.push(
            `Missing coverage producer target ${group.producer.command.target}: ${group.workspace}`,
          );
        else if (
          manifest.adapters.runnerEgress &&
          !new RegExp(
            `^node\\s+${manifest.adapters.runnerEgress.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+vitest(?:\\s|$)`,
          ).test(coverageCommand.trim())
        )
          commandError(
            `Coverage target ${group.workspace}:${group.producer.command.target} bypasses the runner egress adapter`,
          );
      } catch (error) {
        errors.push(`Invalid coverage producer target ${group.workspace}: ${String(error)}`);
      }
    }
    for (const glob of [
      ...group.sourceGlobs,
      ...group.exclusions.map((exclusion) => exclusion.glob),
    ])
      if (!glob.startsWith(`${group.workspace}/`))
        errors.push(`Coverage glob outside workspace: ${glob}`);
    inspectPath(group.report, "output");
  }
  unique(
    manifest.ownership.map((owner) => owner.glob),
    "ownership glob",
  );
  const bindings = manifest.ownership.flatMap((owner) => owner.testBindings);
  unique(
    bindings.map((binding) => binding.testId),
    "binding ID",
  );
  for (const file of files)
    if (manifest.ownership.filter((owner) => path.matchesGlob(file, owner.glob)).length > 1)
      errors.push(`Ambiguous ownership for ${file}`);
  const readableBindings: HarnessTestBinding[] = [];
  for (const owner of manifest.ownership) {
    if (!workspacePaths.some((workspace) => owner.glob.startsWith(`${workspace}/`)))
      errors.push(`Ownership outside registered workspace: ${owner.glob}`);
    inspectGlob(owner.glob);
    for (const entrypoint of owner.entrypoints) {
      inspectPath(entrypoint);
      if (!path.matchesGlob(entrypoint, owner.glob))
        errors.push(`Entrypoint outside ownership: ${entrypoint}`);
    }
    unique(
      owner.ruleLayers.map((pair) => `${pair.ruleId}:${pair.layer}`),
      "rule/layer pair",
    );
    for (const pair of owner.ruleLayers) {
      if (
        !owner.ruleIds.includes(pair.ruleId) ||
        !owner.layers.includes(pair.layer) ||
        !owner.testBindings.some(
          (binding) => binding.ruleId === pair.ruleId && binding.layer === pair.layer,
        )
      )
        errors.push(`Unbound rule/layer ${pair.ruleId}/${pair.layer}`);
    }
    unique(owner.ruleIds, "owned rule");
    unique(owner.layers, "owned layer");
    unique(
      owner.testBindings.map((binding) => `${binding.ruleId}:${binding.layer}:${binding.testId}`),
      "test binding",
    );
    for (const rule of owner.ruleIds)
      if (!owner.testBindings.some((binding) => binding.ruleId === rule))
        errors.push(`Unbound rule ${rule} for ${owner.glob}`);
    for (const ownedLayer of owner.layers)
      if (!owner.testBindings.some((binding) => binding.layer === ownedLayer))
        errors.push(`Unbound layer ${ownedLayer} for ${owner.glob}`);
    for (const binding of owner.testBindings) {
      commandKey(binding.commandKey);
      commandRole(binding.commandKey, binding.runner);
      if (!owner.ruleIds.includes(binding.ruleId) || !owner.layers.includes(binding.layer))
        errors.push(`Unowned binding ${binding.testId}`);
      if ((binding.layer === "playwright") !== (binding.runner === "playwright"))
        commandError(`Runner/layer mismatch ${binding.testId}`);
      if (
        !owner.ruleLayers.some(
          (pair) => pair.ruleId === binding.ruleId && pair.layer === binding.layer,
        )
      )
        errors.push(`Undeclared rule/layer ${binding.testId}`);
      const workspace = resolveWorkspace(binding.file, manifest.workspaces);
      if (
        !workspace ||
        (binding.runner === "vitest"
          ? workspace.unitCommand !== binding.commandKey
          : !workspace.browserCommands.includes(binding.commandKey))
      )
        commandError(`Binding command does not apply to runner/workspace: ${binding.testId}`);
      if (inspectPath(binding.file)) readableBindings.push(binding);
    }
  }
  if (inspectPath(manifest.ruleRegistry)) {
    try {
      const catalog = rulesSchema.parse(
        JSON.parse(readFileSync(path.join(root, manifest.ruleRegistry), "utf8")),
      );
      unique(
        catalog.rules.map((rule) => rule.id),
        "catalog rule ID",
      );
      for (const rule of catalog.rules)
        if (!manifest.ownership.some((owner) => owner.ruleIds.includes(rule.id)))
          errors.push(`Unowned catalog rule ${rule.id}`);
      for (const binding of bindings) {
        const rule = catalog.rules.find((rule) => rule.id === binding.ruleId);
        const matches =
          binding.runner === "vitest"
            ? rule?.vitest.some(
                (test) =>
                  test.file === binding.file &&
                  test.title === binding.title &&
                  test.line === binding.line,
              )
            : rule?.playwright.some(
                (test) =>
                  test.path === binding.file &&
                  test.title === binding.title &&
                  test.line === binding.line &&
                  (!binding.tag || test.tag === binding.tag),
              );
        if (!matches) errors.push(`Rule catalog drift for binding ${binding.testId}`);
      }
    } catch (error) {
      errors.push(`Invalid rule catalog: ${String(error)}`);
    }
  }
  let actual: DiscoveredTests = { vitest: [], playwright: [] };
  try {
    actual = discoveredSchema.parse(discovered ?? staticIdentities(root, readableBindings));
    for (const binding of bindings) {
      const matches =
        binding.runner === "vitest"
          ? actual.vitest.filter(
              (test) =>
                test.file === binding.file &&
                test.title === binding.title &&
                test.line === binding.line,
            )
          : actual.playwright.filter(
              (test) =>
                test.path === binding.file &&
                test.title === binding.title &&
                test.line === binding.line &&
                (!binding.tag || test.tags.includes(binding.tag)),
            );
      const runnable =
        binding.runner === "vitest"
          ? actual.vitest.filter(
              (test) =>
                test.file === binding.file &&
                test.title.replaceAll(" > ", " ") === binding.title.replaceAll(" > ", " "),
            )
          : actual.playwright.filter(
              (test) => test.path === binding.file && test.line === binding.line,
            );
      if (matches.length !== 1 || runnable.length !== 1)
        errors.push(
          `Stale or ambiguous test identity ${binding.testId}: ${binding.file}:${binding.line} ${binding.title}`,
        );
    }
  } catch (error) {
    errors.push(`Invalid test identity discovery: ${String(error)}`);
  }
  const ruleIds = new Set(manifest.ownership.flatMap((owner) => owner.ruleIds));
  const checkRules = (rules: string[], label: string) => {
    for (const rule of rules) if (!ruleIds.has(rule)) errors.push(`${label}: unowned rule ${rule}`);
  };
  const readMatrix = <T>(file: string, schema: z.ZodType<T>, label: string): T | undefined => {
    if (!inspectPath(file)) return;
    try {
      return schema.parse(JSON.parse(readFileSync(path.join(root, file), "utf8")));
    } catch (error) {
      errors.push(`Invalid ${label} matrix: ${String(error)}`);
    }
  };
  if (manifest.lifecycleMatrix) {
    const matrix = readMatrix(manifest.lifecycleMatrix, lifecycleMatrixSchema, "lifecycle");
    if (matrix) {
      unique(
        matrix.rows.map((row) =>
          JSON.stringify([row.state, row.operation, row.role, row.tenantScope]),
        ),
        "lifecycle case",
      );
      for (const row of matrix.rows) {
        checkRules(row.ruleIds, "lifecycle");
        for (const rule of row.ruleIds)
          if (
            !bindings.some((binding) => binding.ruleId === rule && binding.layer === row.testLayer)
          )
            errors.push(`Unbound lifecycle rule/layer ${rule}/${row.testLayer}`);
      }
    }
  }
  const golden = readMatrix(
    manifest.goldenWorkflowMatrix,
    goldenWorkflowMatrixSchema,
    "golden workflow",
  );
  if (golden) {
    unique(
      golden.rows.map((row) => row.id),
      "golden workflow ID",
    );
    for (const row of golden.rows) {
      checkRules(row.ruleIds, "golden workflow");
      for (const evidence of row.evidence ?? []) {
        checkRules(evidence.ruleIds, `golden evidence ${row.id}`);
        const workspace = resolveWorkspace(evidence.file, manifest.workspaces);
        if (!workspace?.browserCommands.includes(evidence.commandKey))
          errors.push(`Golden evidence ${row.id} has an unmapped browser command`);
        else commandRole(evidence.commandKey, "playwright");
        const matches = actual.playwright.filter(
          (test) =>
            test.path === evidence.file &&
            test.title === evidence.title &&
            test.line === evidence.line &&
            test.tags.includes(evidence.tag),
        );
        const runnable = actual.playwright.filter(
          (test) => test.path === evidence.file && test.line === evidence.line,
        );
        if (matches.length !== 1 || runnable.length !== 1)
          errors.push(
            `Stale or ambiguous golden evidence ${row.id}: ${evidence.file}:${evidence.line} ${evidence.title}`,
          );
      }
      for (const exclusion of row.exclusions) {
        checkRules(exclusion.ruleIds, "golden exclusion");
        for (const rule of exclusion.ruleIds)
          if (
            !bindings.some(
              (binding) => binding.ruleId === rule && binding.layer === exclusion.ownerLayer,
            )
          )
            errors.push(`Unbound golden exclusion ${rule}/${exclusion.ownerLayer}`);
      }
    }
  }
  return { errors, commandErrors };
};

// Keep the public static-validation contract total even for malformed/unreadable repositories.
export const validateHarness = (
  options: Parameters<typeof validateHarnessUnchecked>[0],
): { errors: string[]; commandErrors: string[] } => {
  try {
    return validateHarnessUnchecked(options);
  } catch (error) {
    const errors = [`Harness filesystem/metadata validation failed: ${String(error)}`];
    return { errors, commandErrors: errors };
  }
};
