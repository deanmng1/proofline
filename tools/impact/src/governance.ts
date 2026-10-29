import { isUtf8 } from "node:buffer";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { ChangedFile, CoverageGroup, HarnessManifest } from "./types.ts";
import { relativePath } from "./validate.ts";

export type GitOutput = { ok: true; stdout: string } | { ok: false; error: string };
export type GitOverride = (cwd: string, args: string[]) => GitOutput | undefined;

const executeGit = (cwd: string, args: string[]): GitOutput => {
  try {
    return {
      ok: true,
      stdout: execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const gitWithOverride = (cwd: string, args: string[], override?: GitOverride) =>
  override?.(cwd, args) ?? executeGit(cwd, args);

const resolvedCommit = (cwd: string, revision: string, override?: GitOverride) => {
  const result = gitWithOverride(cwd, ["rev-parse", "--verify", `${revision}^{commit}`], override);
  return result.ok ? result.stdout.trim() : undefined;
};

export type VerifiedMergeBase = {
  requestedBase: string;
  requestedHead: string;
  resolvedBase: string | null;
  resolvedHead: string | null;
  mergeBase: string | null;
  checkoutHead: string | null;
  historyComplete: boolean;
  errors: string[];
};

export const readVerifiedMergeBase = ({
  cwd,
  base,
  head,
  requireCheckoutMatch = true,
  git,
}: {
  cwd: string;
  base: string;
  head: string;
  requireCheckoutMatch?: boolean;
  git?: GitOverride;
}): VerifiedMergeBase => {
  const errors: string[] = [];
  const requestedBase = base?.trim() ?? "";
  const requestedHead = head?.trim() ?? "";
  const shallow = gitWithOverride(cwd, ["rev-parse", "--is-shallow-repository"], git);
  const historyComplete = shallow.ok && shallow.stdout.trim() === "false";
  if (!historyComplete) errors.push("Shallow or unverifiable repository history");
  if (!requestedBase) errors.push("Missing base revision");
  if (!requestedHead) errors.push("Missing head revision");
  const resolvedBase = requestedBase ? resolvedCommit(cwd, requestedBase, git) : undefined;
  const resolvedHead = requestedHead ? resolvedCommit(cwd, requestedHead, git) : undefined;
  const checkoutHead = resolvedCommit(cwd, "HEAD", git);
  if (requestedBase && !resolvedBase) errors.push(`Unresolved supplied base: ${requestedBase}`);
  if (requestedHead && !resolvedHead) errors.push(`Unresolved supplied head: ${requestedHead}`);
  if (requireCheckoutMatch && resolvedHead && checkoutHead !== resolvedHead)
    errors.push(
      `Checkout HEAD ${checkoutHead ?? "unresolved"} differs from supplied head ${resolvedHead}`,
    );

  let mergeBase: string | undefined;
  if (resolvedBase && resolvedHead) {
    const result = gitWithOverride(cwd, ["merge-base", "--all", resolvedBase, resolvedHead], git);
    if (!result.ok) errors.push(`Unable to resolve merge base: ${result.error}`);
    else {
      const candidates = result.stdout.trim().split(/\s+/).filter(Boolean);
      if (candidates.length === 0) errors.push("No merge base for supplied revisions");
      else if (candidates.length > 1)
        errors.push(`Multiple merge bases for supplied revisions: ${candidates.join(", ")}`);
      else mergeBase = candidates[0];
    }
  }
  return {
    requestedBase,
    requestedHead,
    resolvedBase: resolvedBase ?? null,
    resolvedHead: resolvedHead ?? null,
    mergeBase: mergeBase ?? null,
    checkoutHead: checkoutHead ?? null,
    historyComplete,
    errors,
  };
};

export const gitShowBytes = (cwd: string, revision: string, file: string) => {
  try {
    return {
      bytes: execFileSync("git", ["show", `${revision}:${file}`], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      }),
      error: undefined,
    };
  } catch (error) {
    return {
      bytes: undefined,
      error: `git show ${revision}:${file} failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

export const gitListTreeFiles = (cwd: string, revision: string) => {
  try {
    const stdout = execFileSync("git", ["ls-tree", "-r", "--name-only", "-z", revision], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { files: stdout.split("\0").filter(Boolean), error: undefined };
  } catch (error) {
    return {
      files: [] as string[],
      error: `git ls-tree ${revision} failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

type CoverageThreshold = {
  report: string;
  lines: number;
  branches: number;
  functions: number;
  statements: number;
};

export type CoverageBaseline = { version: 1; files: Record<string, CoverageThreshold> };
const coverageMetrics = ["lines", "branches", "functions", "statements"] as const;

export const checkBaselineMonotonicity = ({
  baseBaseline,
  proposedBaseline,
}: {
  baseBaseline: CoverageBaseline;
  proposedBaseline: CoverageBaseline;
}) => {
  const errors: string[] = [];
  for (const [source, baseEntry] of Object.entries(baseBaseline.files)) {
    const proposedEntry = proposedBaseline.files[source];
    if (!proposedEntry) {
      errors.push(`Deleted coverage source ${source}`);
      continue;
    }
    if (proposedEntry.report !== baseEntry.report)
      errors.push(
        `Coverage report changed for ${source}: ${baseEntry.report} -> ${proposedEntry.report}`,
      );
    for (const metric of coverageMetrics)
      if (proposedEntry[metric] < baseEntry[metric])
        errors.push(
          `${source} ${metric} threshold lowered from ${baseEntry[metric]} to ${proposedEntry[metric]}`,
        );
  }
  return { errors };
};

const groupIdentity = (group: CoverageGroup) => group.report;
const sorted = (values: string[]) => [...values].sort();
const containsGlobMagic = (value: string) =>
  ["*", "?", "{", "}", "[", "]"].some((token) => value.includes(token));
const isTestSource = (value: string) => /\.(?:test|spec)\.tsx?$/.test(value);
const hasExplicitTestOnlyReason = (value: string) =>
  /\bnon-production test sources?\b/i.test(value) ||
  /\btest sources?\s+(?:is|are)\s+not\s+(?:instrumented\s+)?production sources?\b/i.test(value);
const comparableGroupFields = (group: CoverageGroup) => ({
  workspace: group.workspace,
  provider: group.provider,
  providerVersion: group.providerVersion,
  sourceGlobs: sorted(group.sourceGlobs),
  exclusions: [...group.exclusions]
    .map((entry) => ({ glob: entry.glob, reason: entry.reason }))
    .sort((left, right) => left.glob.localeCompare(right.glob)),
  report: group.report,
  reportFormat: group.reportFormat,
  metrics: sorted(group.metrics),
  aggregation: group.aggregation,
  producer: group.producer ?? null,
});

export const checkCoverageGroupCompatibility = ({
  baseGroups,
  proposedGroups,
  baseSources,
  baseRepositoryFiles,
}: {
  baseGroups: CoverageGroup[];
  proposedGroups: CoverageGroup[];
  baseSources?: string[];
  baseRepositoryFiles?: string[];
}) => {
  const errors: string[] = [];
  for (const [label, groups] of [
    ["base", baseGroups],
    ["proposed", proposedGroups],
  ] as const) {
    const counts = new Map<string, number>();
    for (const group of groups)
      counts.set(groupIdentity(group), (counts.get(groupIdentity(group)) ?? 0) + 1);
    for (const [identity, count] of counts)
      if (count > 1) errors.push(`Duplicate ${label} coverage group identity ${identity}`);
  }
  const proposedByIdentity = new Map(proposedGroups.map((group) => [groupIdentity(group), group]));
  for (const baseGroup of baseGroups) {
    const proposed = proposedByIdentity.get(groupIdentity(baseGroup));
    if (!proposed) {
      errors.push(`Deleted coverage group ${baseGroup.report}`);
      continue;
    }
    const before = comparableGroupFields(baseGroup);
    const after = comparableGroupFields(proposed);
    for (const field of Object.keys(before) as Array<keyof typeof before>)
      if (field === "producer" && !baseGroup.producer) continue;
      else if ((field === "sourceGlobs" || field === "exclusions") && baseSources) continue;
      else if (JSON.stringify(before[field]) !== JSON.stringify(after[field]))
        errors.push(`Coverage ${field} changed for group ${baseGroup.workspace}`);
    if (baseSources) {
      for (const baseGlob of baseGroup.sourceGlobs) {
        const retained = proposed.sourceGlobs.some(
          (proposedGlob) =>
            proposedGlob === baseGlob ||
            (!containsGlobMagic(baseGlob) && path.matchesGlob(baseGlob, proposedGlob)),
        );
        if (!retained)
          errors.push(
            `Coverage sourceGlobs removed or narrowed for group ${baseGroup.workspace}: ${baseGlob}`,
          );
      }
      for (const exclusion of baseGroup.exclusions)
        if (
          !proposed.exclusions.some(
            (candidate) =>
              candidate.glob === exclusion.glob && candidate.reason === exclusion.reason,
          )
        )
          errors.push(`Coverage exclusions removed or changed for group ${baseGroup.workspace}`);
      const baseExclusionKeys = new Set(
        baseGroup.exclusions.map((entry) => `${entry.glob}\0${entry.reason}`),
      );
      for (const exclusion of proposed.exclusions) {
        if (baseExclusionKeys.has(`${exclusion.glob}\0${exclusion.reason}`)) continue;
        if (containsGlobMagic(exclusion.glob))
          errors.push(
            `New coverage exclusion must name one existing base path exactly: ${exclusion.glob}`,
          );
        else if (
          !baseRepositoryFiles?.includes(exclusion.glob) &&
          !(isTestSource(exclusion.glob) && hasExplicitTestOnlyReason(exclusion.reason))
        )
          errors.push(
            `New coverage exclusion is not proven to exist at the merge base: ${exclusion.glob}`,
          );
      }
      const baseEffectiveSources = new Set([
        ...baseSources.filter(
          (file) =>
            baseGroup.sourceGlobs.some((glob) => path.matchesGlob(file, glob)) &&
            !baseGroup.exclusions.some((entry) => path.matchesGlob(file, entry.glob)),
        ),
        ...(baseRepositoryFiles ?? []).filter(
          (file) =>
            baseGroup.sourceGlobs.some((glob) => path.matchesGlob(file, glob)) &&
            !baseGroup.exclusions.some((entry) => path.matchesGlob(file, entry.glob)),
        ),
      ]);
      for (const source of baseEffectiveSources) {
        const exclusion = proposed.exclusions.find((entry) => path.matchesGlob(source, entry.glob));
        const exactTestOnlyExclusion =
          exclusion?.glob === source &&
          isTestSource(source) &&
          hasExplicitTestOnlyReason(exclusion.reason);
        if (
          !proposed.sourceGlobs.some((glob) => path.matchesGlob(source, glob)) ||
          (exclusion && !exactTestOnlyExclusion)
        )
          errors.push(`Previously governed coverage source is excluded or unclassified: ${source}`);
      }
    }
  }
  return { errors };
};

export type ExecutionRecord = {
  eventId: string;
  scope?: string[];
  [key: string]: unknown;
};

export const verifyRecordPrefix = ({
  baseRecord,
  proposedRecord,
  validate,
}: {
  baseRecord: Buffer;
  proposedRecord: Buffer;
  validate?: (text: string) => { errors: string[]; records?: ExecutionRecord[] };
}) => {
  const errors: string[] = [];
  if (!proposedRecord.subarray(0, baseRecord.length).equals(baseRecord))
    errors.push("Proposed execution record does not preserve the byte-exact base prefix");
  const inspectBytes = (name: string, bytes: Buffer) => {
    if (!isUtf8(bytes)) errors.push(`${name} is not valid UTF-8`);
    if (bytes.length === 0 || bytes.at(-1) !== 10)
      errors.push(`${name} must end with exactly one LF`);
    if (bytes.length > 1 && bytes.at(-2) === 10) errors.push(`${name} has an extra trailing LF`);
    if (bytes.includes(13)) errors.push(`${name} contains CR or CRLF bytes`);
  };
  inspectBytes("Base execution record", baseRecord);
  inspectBytes("Proposed execution record", proposedRecord);
  const appendedBytes = proposedRecord.subarray(baseRecord.length);
  if (appendedBytes.length) inspectBytes("Appended execution record", appendedBytes);

  const fallbackValidate = (text: string) => {
    const records: ExecutionRecord[] = [];
    const seen = new Set<string>();
    const localErrors: string[] = [];
    const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
    for (const [index, line] of lines.entries()) {
      try {
        const parsed = JSON.parse(line) as ExecutionRecord;
        if (!parsed || typeof parsed.eventId !== "string") throw new Error("missing eventId");
        if (seen.has(parsed.eventId))
          localErrors.push(`Line ${index + 1}: duplicate record ID ${parsed.eventId}`);
        seen.add(parsed.eventId);
        records.push(parsed);
      } catch (error) {
        localErrors.push(`Line ${index + 1}: malformed record: ${String(error)}`);
      }
    }
    return { errors: localErrors, records };
  };
  const validation = (validate ?? fallbackValidate)(proposedRecord.toString("utf8"));
  errors.push(...validation.errors);
  const baseValidation = (validate ?? fallbackValidate)(baseRecord.toString("utf8"));
  errors.push(...baseValidation.errors.map((error) => `Base history: ${error}`));
  const baseLines = baseRecord.toString("utf8").slice(0, -1).split("\n").length;
  const appendedRecords = errors.some((error) => /prefix|malformed|duplicate|CR|LF/i.test(error))
    ? []
    : (validation.records ?? []).slice(baseLines);
  return { errors: [...new Set(errors)], appendedRecords };
};

const normalizePath = (value: string) => relativePath.parse(value.replace(/\/$/, ""));
const pathContains = (root: string, file: string) => file === root || file.startsWith(`${root}/`);

const fixedGovernedPaths = [
  "proofline.harness.json",
  "test-impact/coverage-baseline.json",
  "package.json",
  ".github/workflows/verify.yml",
  "docs/TESTING.md",
  "docs/PORTABLE_TEST_AUTOMATION.md",
];
const fixedGovernedRoots = ["tools/impact"];
const generatedPaths = ["artifacts", "playwright-report", "test-results", ".nx"];

const isGenerated = (file: string) => generatedPaths.some((root) => pathContains(root, file));
const matchesManifestOwnership = (file: string, manifest: HarnessManifest) =>
  manifest.ownership.some((owner) => path.matchesGlob(file, owner.glob));

const isGovernedByManifest = (file: string, manifest: HarnessManifest) => {
  if (file === "test-impact/execution-record.jsonl" || file === "test-impact/rules.md")
    return false;
  if (fixedGovernedPaths.includes(file)) return true;
  if (fixedGovernedRoots.some((root) => pathContains(root, file))) return true;
  if (
    [
      manifest.adapters.testModeEnvironment,
      manifest.adapters.auth,
      manifest.adapters.api,
      ...manifest.adapters.providers,
    ].includes(file)
  )
    return true;
  if (manifest.workspaces.some((workspace) => file === `${workspace.path}/project.json`))
    return true;
  if (
    [manifest.ruleRegistry, manifest.goldenWorkflowMatrix, manifest.lifecycleMatrix]
      .filter((value): value is string => Boolean(value))
      .includes(file)
  )
    return true;
  return matchesManifestOwnership(file, manifest);
};

export const verifyChangedHarnessEvidence = ({
  changedFiles,
  appendedRecords,
  manifest,
  baseManifest,
}: {
  changedFiles: ChangedFile[];
  appendedRecords: ExecutionRecord[];
  manifest: HarnessManifest;
  baseManifest?: HarnessManifest;
}) => {
  const errors: string[] = [];
  const excludedGeneratedPaths: string[] = [];
  const scopes = appendedRecords.flatMap((record) => record.scope ?? []).map(normalizePath);
  for (const change of changedFiles) {
    for (const rawFile of [change.previousPath, change.path].filter((value): value is string =>
      Boolean(value),
    )) {
      let file: string;
      try {
        file = normalizePath(rawFile);
      } catch {
        errors.push(`Invalid changed path ${rawFile}`);
        continue;
      }
      if (isGenerated(file)) {
        excludedGeneratedPaths.push(file);
        continue;
      }
      const governed = [manifest, baseManifest]
        .filter((value): value is HarnessManifest => Boolean(value))
        .some((candidate) => isGovernedByManifest(file, candidate));
      if (governed && !scopes.some((scope) => pathContains(scope, file)))
        errors.push(`Changed governed path lacks newly appended record scope: ${file}`);
    }
  }
  return {
    errors: [...new Set(errors)],
    excludedGeneratedPaths: [...new Set(excludedGeneratedPaths)].sort(),
  };
};

export const readGovernedChanges = ({
  cwd,
  revisions,
}: {
  cwd: string;
  revisions: VerifiedMergeBase;
}) => {
  const errors: string[] = [];
  const parse = (output: Buffer) => {
    const values = output.toString().split("\0").filter(Boolean);
    const changes: ChangedFile[] = [];
    for (let index = 0; index < values.length; ) {
      const raw = values[index++] ?? "";
      const kind = raw[0];
      if (kind === "R" || kind === "C") {
        const previousPath = values[index++];
        const file = values[index++];
        if (previousPath && file)
          changes.push({ path: file, previousPath, status: kind === "R" ? "renamed" : "added" });
      } else {
        const file = values[index++];
        if (file)
          changes.push({
            path: file,
            status: kind === "A" ? "added" : kind === "D" ? "deleted" : "modified",
          });
      }
    }
    return changes;
  };
  const invoke = (args: string[]) => {
    try {
      return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      errors.push(
        `Unable to read changed paths: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Buffer.alloc(0);
    }
  };
  const committed =
    revisions.mergeBase && revisions.resolvedHead
      ? parse(
          invoke([
            "diff",
            "--name-status",
            "-z",
            "--find-renames",
            `${revisions.mergeBase}...${revisions.resolvedHead}`,
          ]),
        )
      : [];
  const working = parse(invoke(["diff", "--name-status", "-z", "--find-renames", "HEAD"]));
  const untracked: ChangedFile[] = invoke(["ls-files", "--others", "--exclude-standard", "-z"])
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((file) => ({ path: file, status: "untracked" as const }));
  const byIdentity = new Map<string, ChangedFile>();
  for (const change of [...committed, ...working, ...untracked])
    byIdentity.set(`${change.previousPath ?? ""}\0${change.path}`, change);
  return { files: [...byIdentity.values()], errors };
};
