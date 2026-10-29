import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  type CoverageBaseline,
  checkBaselineMonotonicity,
  checkCoverageGroupCompatibility,
  gitListTreeFiles,
  gitShowBytes,
  readVerifiedMergeBase,
} from "./governance.ts";
import { harnessManifestSchema, validateHarnessAuthority } from "./harness-manifest.ts";
import type { CoverageGroup, HarnessManifest } from "./types.ts";
import { relativePath } from "./validate.ts";

const percentage = z.number().finite().min(0).max(100);
const metrics = ["lines", "branches", "functions", "statements"] as const;
const baselineEntrySchema = z
  .object({
    report: relativePath,
    lines: percentage,
    branches: percentage,
    functions: percentage,
    statements: percentage,
  })
  .strict();
export const baselineSchema = z
  .object({
    version: z.literal(1),
    files: z
      .record(relativePath, baselineEntrySchema)
      .refine((files) => Object.keys(files).length > 0, "Empty baseline"),
  })
  .strict();

export const normalizeRepoPath = (file: string, _cwd: string) => {
  if (path.isAbsolute(file)) throw new Error(`Absolute coverage path is forbidden: ${file}`);
  if (file.includes("\\")) throw new Error(`Backslash coverage path is forbidden: ${file}`);
  return relativePath.parse(file);
};

const normalizeReport = (report: unknown, cwd: string) => {
  const errors: string[] = [];
  const files: Record<string, unknown> = {};
  if (!report || typeof report !== "object" || Array.isArray(report))
    return { files, errors: ["Coverage report is not an object"] };
  for (const [rawFile, value] of Object.entries(report)) {
    if (rawFile === "total") continue;
    try {
      const file = normalizeRepoPath(rawFile, cwd);
      if (Object.hasOwn(files, file)) errors.push(`Duplicate normalized coverage file ${file}`);
      else files[file] = value;
    } catch (error) {
      errors.push(`Invalid coverage path ${rawFile}: ${String(error)}`);
    }
  }
  return { files, errors };
};

export const normalizeInRepositoryPath = (file: string, cwd: string) => {
  if (file.includes("\\")) throw new Error(`Backslash coverage path is forbidden: ${file}`);
  if (!path.isAbsolute(file)) return relativePath.parse(file);
  const root = path.resolve(cwd);
  const relative = path.relative(root, path.resolve(file)).replaceAll("\\", "/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative))
    throw new Error(`Coverage path escapes repository: ${file}`);
  return relativePath.parse(relative);
};

export const normalizeGeneratedCoverageReports = (cwd = process.cwd()) => {
  const parsed = harnessManifestSchema.parse(
    JSON.parse(readFileSync(path.join(cwd, "proofline.harness.json"), "utf8")),
  );
  const authority = validateHarnessAuthority(parsed);
  if (authority.errors.length) throw new Error(authority.errors.join("\n"));
  for (const reportPath of new Set(parsed.coverage.map((group) => group.report))) {
    const absoluteReport = path.join(cwd, reportPath);
    const raw = JSON.parse(readFileSync(absoluteReport, "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error(`Coverage report is not an object: ${reportPath}`);
    const normalized: Record<string, unknown> = {};
    for (const [rawFile, value] of Object.entries(raw)) {
      const file = rawFile === "total" ? rawFile : normalizeInRepositoryPath(rawFile, cwd);
      if (Object.hasOwn(normalized, file))
        throw new Error(`Duplicate normalized coverage file ${file} in ${reportPath}`);
      normalized[file] = value;
    }
    writeFileSync(absoluteReport, `${JSON.stringify(normalized)}\n`);
  }
};

export const checkCoverage = (input: unknown, reports: Record<string, unknown>, cwd: string) => {
  const parsed = baselineSchema.safeParse(input);
  if (!parsed.success) return { errors: [`Invalid coverage baseline: ${parsed.error.message}`] };
  const errors: string[] = [];
  for (const [file, baseline] of Object.entries(parsed.data.files)) {
    const normalized = normalizeReport(reports[baseline.report], cwd);
    errors.push(...normalized.errors.map((error) => `${baseline.report}: ${error}`));
    const entry = normalized.files[file];
    if (!entry || typeof entry !== "object") {
      errors.push(`Missing covered file ${file}`);
      continue;
    }
    for (const metric of metrics) {
      const measured = z
        .object({ pct: percentage })
        .safeParse((entry as Record<string, unknown>)[metric]);
      if (!measured.success) errors.push(`Missing or invalid ${metric} metric for ${file}`);
      else if (measured.data.pct < baseline[metric])
        errors.push(`${file} ${metric} ${measured.data.pct} below baseline ${baseline[metric]}`);
    }
  }
  return { errors };
};

export type GovernanceRevisions = { base: string; head: string };

export const revisionArguments = (
  args = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): GovernanceRevisions => {
  const value = (flag: string) => {
    let found: string | undefined;
    for (let index = 0; index < args.length; index++)
      if (args[index] === flag) found = args[index + 1];
    return found;
  };
  return {
    base: value("--base") ?? env.IMPACT_BASE ?? "",
    head: value("--head") ?? env.IMPACT_HEAD ?? "",
  };
};

const filesUnder = (cwd: string, root: string) => {
  const absoluteRoot = path.join(cwd, root);
  if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) return [];
  const result: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) result.push(path.relative(cwd, absolute).replaceAll("\\", "/"));
    }
  };
  visit(absoluteRoot);
  return result;
};

const groupSources = (cwd: string, group: CoverageGroup) =>
  filesUnder(cwd, group.workspace).filter(
    (file) =>
      group.sourceGlobs.some((glob) => path.matchesGlob(file, glob)) &&
      !group.exclusions.some((exclusion) => path.matchesGlob(file, exclusion.glob)),
  );

const parseJson = <T>(
  bytes: Buffer | undefined,
  label: string,
  schema: z.ZodType<T>,
  errors: string[],
) => {
  if (!bytes) return undefined;
  try {
    const json = JSON.parse(bytes.toString("utf8"));
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      errors.push(`Invalid ${label}: ${parsed.error.message}`);
      return undefined;
    }
    return parsed.data;
  } catch (error) {
    errors.push(`Invalid ${label} JSON: ${String(error)}`);
    return undefined;
  }
};

const validateReportPathUniqueness = (manifest: HarnessManifest) => {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const group of manifest.coverage) {
    const normalized = path.posix.normalize(group.report);
    if (normalized.startsWith("../") || normalized.startsWith("/") || normalized.includes("\\"))
      errors.push(`Invalid coverage report path ${group.report}`);
    if (seen.has(normalized))
      errors.push(`Duplicate normalized coverage report path ${normalized}`);
    seen.add(normalized);
  }
  return errors;
};

type GroupResult = {
  workspace: string;
  provider: string;
  providerVersion: string;
  report: string;
  reportFormat: string;
  aggregation: string;
  metrics: string[];
  sourceGlobs: string[];
  exclusions: Array<{ glob: string; reason: string }>;
  sources: string[];
  excluded: string[];
  measurements: Record<string, Record<string, number>>;
  errors: string[];
};

const shellWords = (command: string) => {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (const character of command) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\" && quote !== "'") escaped = true;
    else if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
    } else if (character === "'" || character === '"') quote = character;
    else if (/\s/.test(character)) {
      if (current) words.push(current);
      current = "";
    } else current += character;
  }
  if (escaped || quote) throw new Error("Unterminated coverage command quoting");
  if (current) words.push(current);
  return words;
};

const coverageFlagValues = (words: string[], name: string) => {
  const prefix = `--coverage.${name}=`;
  const exact = `--coverage.${name}`;
  const values: string[] = [];
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (word.startsWith(prefix)) values.push(word.slice(prefix.length));
    else if (word === exact) values.push(words[++index] ?? "");
  }
  return values;
};

const coverageProvenanceErrors = (cwd: string, group: CoverageGroup) => {
  const errors: string[] = [];
  let command = "";
  try {
    const project = JSON.parse(
      readFileSync(path.join(cwd, group.workspace, "project.json"), "utf8"),
    ) as { targets?: { coverage?: { command?: unknown } } };
    command =
      typeof project.targets?.coverage?.command === "string"
        ? project.targets.coverage.command
        : "";
  } catch (error) {
    errors.push(`Missing coverage target for ${group.workspace}: ${String(error)}`);
  }
  try {
    const words = shellWords(command);
    const singletonFlag = (name: string, expected: string) => {
      const values = coverageFlagValues(words, name);
      if (values.length !== 1 || values[0] !== expected)
        errors.push(
          `Coverage target for ${group.workspace} must bind exactly one ${name}=${expected}; received ${values.join(", ") || "none"}`,
        );
    };
    singletonFlag("provider", group.provider);
    singletonFlag("reportsDirectory", path.posix.dirname(group.report));
    const reporters = coverageFlagValues(words, "reporter");
    if (!reporters.includes("json-summary"))
      errors.push(`Coverage target for ${group.workspace} does not emit ${group.reportFormat}`);
    for (const name of ["reporter", "include", "exclude"]) {
      const values = coverageFlagValues(words, name);
      if (values.some((value) => !value))
        errors.push(`Coverage target for ${group.workspace} has an empty ${name} flag`);
      if (new Set(values).size !== values.length)
        errors.push(`Coverage target for ${group.workspace} has duplicate ${name} flags`);
    }
    if (coverageFlagValues(words, "include").length !== 1)
      errors.push(`Coverage target for ${group.workspace} must declare exactly one include flag`);
  } catch (error) {
    errors.push(`Invalid coverage target command for ${group.workspace}: ${String(error)}`);
  }
  const providerPackage = `@vitest/coverage-${group.provider}`;
  try {
    const provider = JSON.parse(
      readFileSync(path.join(cwd, "node_modules", providerPackage, "package.json"), "utf8"),
    ) as { version?: unknown };
    if (provider.version !== group.providerVersion)
      errors.push(
        `Coverage provider version for ${group.workspace} is ${String(provider.version)}, expected ${group.providerVersion}`,
      );
  } catch (error) {
    errors.push(`Unable to resolve coverage provider ${providerPackage}: ${String(error)}`);
  }
  return errors;
};

const inspectGroup = ({
  cwd,
  group,
  baseline,
}: {
  cwd: string;
  group: CoverageGroup;
  baseline: CoverageBaseline;
}): GroupResult => {
  const errors: string[] = [];
  errors.push(...coverageProvenanceErrors(cwd, group));
  const sources = groupSources(cwd, group).sort();
  if (sources.length === 0)
    errors.push(`Coverage group ${group.workspace} has no effective source files`);
  const excluded = filesUnder(cwd, group.workspace)
    .filter((file) => group.exclusions.some((entry) => path.matchesGlob(file, entry.glob)))
    .sort();
  let rawReport: unknown;
  try {
    rawReport = JSON.parse(readFileSync(path.join(cwd, group.report), "utf8"));
  } catch (error) {
    errors.push(`Missing or invalid coverage report ${group.report}: ${String(error)}`);
  }
  const report = normalizeReport(rawReport, cwd);
  errors.push(...report.errors.map((error) => `${group.report}: ${error}`));
  const measurements: Record<string, Record<string, number>> = {};

  for (const source of Object.keys(baseline.files).filter(
    (file) =>
      group.sourceGlobs.some((glob) => path.matchesGlob(file, glob)) &&
      !group.exclusions.some((entry) => path.matchesGlob(file, entry.glob)),
  ))
    if (!sources.includes(source))
      errors.push(
        `Baseline source ${source} is missing from the working tree for ${group.workspace}`,
      );

  for (const reportFile of Object.keys(report.files)) {
    const classified =
      group.sourceGlobs.some((glob) => path.matchesGlob(reportFile, glob)) ||
      group.exclusions.some((entry) => path.matchesGlob(reportFile, entry.glob));
    if (!classified)
      errors.push(`Unclassified coverage report source ${reportFile} in ${group.report}`);
  }
  for (const source of sources) {
    const threshold = baseline.files[source];
    if (!threshold) {
      errors.push(`Unclassified coverage source ${source}: missing from proposed baseline`);
      continue;
    }
    if (threshold.report !== group.report)
      errors.push(
        `Coverage source ${source} references ${threshold.report}, expected ${group.report}`,
      );
    const entry = report.files[source];
    if (!entry || typeof entry !== "object") {
      errors.push(`Missing covered file ${source} in ${group.report}`);
      continue;
    }
    const measuredValues: Record<string, number> = {};
    for (const metric of metrics) {
      const measured = z
        .object({ pct: percentage })
        .safeParse((entry as Record<string, unknown>)[metric]);
      if (!measured.success) errors.push(`Missing or invalid ${metric} metric for ${source}`);
      else {
        measuredValues[metric] = measured.data.pct;
        if (measured.data.pct < threshold[metric])
          errors.push(
            `${source} ${metric} ${measured.data.pct} below baseline ${threshold[metric]}`,
          );
      }
    }
    measurements[source] = measuredValues;
  }
  return {
    workspace: group.workspace,
    provider: group.provider,
    providerVersion: group.providerVersion,
    report: group.report,
    reportFormat: group.reportFormat,
    aggregation: group.aggregation,
    metrics: [...group.metrics],
    sourceGlobs: [...group.sourceGlobs],
    exclusions: group.exclusions.map((entry) => ({ ...entry })),
    sources,
    excluded,
    measurements,
    errors,
  };
};

export const coverageMain = (
  cwd = process.cwd(),
  requested: GovernanceRevisions = revisionArguments(),
) => {
  const artifactDirectory = path.join(cwd, "artifacts/coverage");
  mkdirSync(artifactDirectory, { recursive: true });
  const errors: string[] = [];
  const revisions = readVerifiedMergeBase({ cwd, ...requested, requireCheckoutMatch: true });
  errors.push(...revisions.errors);
  const artifact: { revisions: typeof revisions; groups: GroupResult[]; errors: string[] } = {
    revisions,
    groups: [],
    errors,
  };
  try {
    let proposedManifest: HarnessManifest | undefined;
    let proposedBaseline: CoverageBaseline | undefined;
    try {
      const parsed = harnessManifestSchema.safeParse(
        JSON.parse(readFileSync(path.join(cwd, "proofline.harness.json"), "utf8")),
      );
      if (!parsed.success)
        errors.push(`Invalid proposed harness manifest: ${parsed.error.message}`);
      else {
        proposedManifest = parsed.data;
        errors.push(...validateHarnessAuthority(parsed.data).errors);
      }
    } catch (error) {
      errors.push(`Invalid proposed harness manifest JSON: ${String(error)}`);
    }
    try {
      const parsed = baselineSchema.safeParse(
        JSON.parse(readFileSync(path.join(cwd, "test-impact/coverage-baseline.json"), "utf8")),
      );
      if (!parsed.success)
        errors.push(`Invalid proposed coverage baseline: ${parsed.error.message}`);
      else proposedBaseline = parsed.data;
    } catch (error) {
      errors.push(`Invalid proposed coverage baseline JSON: ${String(error)}`);
    }

    let baseManifest: HarnessManifest | undefined;
    let baseBaseline: CoverageBaseline | undefined;
    let baseRepositoryFiles: string[] | undefined;
    if (revisions.mergeBase) {
      const baseTree = gitListTreeFiles(cwd, revisions.mergeBase);
      if (baseTree.error) errors.push(baseTree.error);
      else baseRepositoryFiles = baseTree.files;
      const manifestObject = gitShowBytes(cwd, revisions.mergeBase, "proofline.harness.json");
      if (manifestObject.error) errors.push(manifestObject.error);
      baseManifest = parseJson(
        manifestObject.bytes,
        "base harness manifest",
        harnessManifestSchema,
        errors,
      );
      const baselineObject = gitShowBytes(
        cwd,
        revisions.mergeBase,
        "test-impact/coverage-baseline.json",
      );
      if (baselineObject.error) errors.push(baselineObject.error);
      baseBaseline = parseJson(
        baselineObject.bytes,
        "base coverage baseline",
        baselineSchema,
        errors,
      );
    }

    if (proposedManifest) errors.push(...validateReportPathUniqueness(proposedManifest));
    if (baseManifest && proposedManifest) {
      errors.push(
        ...checkCoverageGroupCompatibility({
          baseGroups: baseManifest.coverage,
          proposedGroups: proposedManifest.coverage,
          baseSources: Object.keys(baseBaseline?.files ?? {}),
          baseRepositoryFiles,
        }).errors,
      );
    }
    if (baseBaseline && proposedBaseline)
      errors.push(...checkBaselineMonotonicity({ baseBaseline, proposedBaseline }).errors);

    if (proposedManifest && proposedBaseline) {
      for (const source of Object.keys(proposedBaseline.files)) {
        const owners = proposedManifest.coverage.filter(
          (group) =>
            group.sourceGlobs.some((glob) => path.matchesGlob(source, glob)) &&
            !group.exclusions.some((entry) => path.matchesGlob(source, entry.glob)),
        );
        if (owners.length === 0) errors.push(`Unclassified coverage source ${source}`);
        else if (owners.length > 1) errors.push(`Ambiguous coverage source ${source}`);
      }
      artifact.groups = proposedManifest.coverage.map((group) =>
        inspectGroup({ cwd, group, baseline: proposedBaseline as CoverageBaseline }),
      );
      errors.push(...artifact.groups.flatMap((group) => group.errors));
    }
  } catch (error) {
    errors.push(`Coverage governance failed unexpectedly: ${String(error)}`);
  } finally {
    artifact.errors = [...new Set(errors)];
    writeFileSync(
      path.join(artifactDirectory, "ratchet.json"),
      `${JSON.stringify(artifact, null, 2)}\n`,
    );
  }
  if (artifact.errors.length) throw new Error(artifact.errors.join("\n"));
  process.stdout.write(
    `Coverage ratchets passed for ${artifact.groups.length} manifest source groups.\n`,
  );
  return artifact;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--normalize-reports")) normalizeGeneratedCoverageReports();
  else coverageMain();
}
