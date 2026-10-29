import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { type GovernanceRevisions, revisionArguments } from "./coverage-policy.ts";
import {
  type ExecutionRecord,
  gitShowBytes,
  readGovernedChanges,
  readVerifiedMergeBase,
  verifyChangedHarnessEvidence,
  verifyRecordPrefix,
} from "./governance.ts";
import type { HarnessManifest } from "./harness-manifest.ts";
import { harnessManifestSchema, validateHarnessAuthority } from "./harness-manifest.ts";
import { relativePath, renderRules, rulesSchema } from "./validate.ts";

const commandTableStart = "<!-- proofline-canonical-commands:start -->";
const commandTableEnd = "<!-- proofline-canonical-commands:end -->";

export const renderCanonicalCommandTable = (manifest: HarnessManifest) =>
  [
    commandTableStart,
    "| Command key | Working directory | Runner | Exact argv (JSON) |",
    "| --- | --- | --- | --- |",
    ...Object.entries(manifest.commands).map(
      ([key, command]) =>
        `| ${key} | ${command.cwd} | ${command.runner ?? ""} | ${JSON.stringify(command.argv)} |`,
    ),
    commandTableEnd,
  ].join("\n");

export const validateCanonicalCommandDocumentation = (
  manifest: HarnessManifest,
  documentation: string,
) => {
  const errors: string[] = [];
  const starts = documentation.split(commandTableStart).length - 1;
  const ends = documentation.split(commandTableEnd).length - 1;
  if (starts !== 1 || ends !== 1) {
    return {
      errors: [
        `Canonical command documentation must contain exactly one table (${starts} starts, ${ends} ends).`,
      ],
    };
  }
  const body = documentation.split(commandTableStart)[1]?.split(commandTableEnd)[0] ?? "";
  const rows = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !/^\|\s*(?:Command key|---)/.test(line));
  const parsed = new Map<string, { cwd: string; runner?: string; argv: unknown; count: number }>();
  for (const row of rows) {
    const cells = row
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length !== 4) {
      errors.push(`Malformed canonical command documentation row: ${row}`);
      continue;
    }
    const [key, cwd, runner, argvText] = cells;
    let argv: unknown;
    try {
      argv = JSON.parse(argvText);
    } catch {
      errors.push(`Canonical command ${key} argv is not valid JSON.`);
      continue;
    }
    const previous = parsed.get(key);
    parsed.set(key, { cwd, runner: runner || undefined, argv, count: (previous?.count ?? 0) + 1 });
  }
  for (const [key, command] of Object.entries(manifest.commands)) {
    const documented = parsed.get(key);
    if (!documented) {
      errors.push(`Canonical command ${key} is missing from documentation.`);
      continue;
    }
    if (documented.count !== 1)
      errors.push(`Canonical command ${key} appears ${documented.count} times in documentation.`);
    if (documented.cwd !== command.cwd)
      errors.push(`Canonical command ${key} cwd does not match the manifest.`);
    if (documented.runner !== command.runner)
      errors.push(`Canonical command ${key} runner does not match the manifest.`);
    if (JSON.stringify(documented.argv) !== JSON.stringify(command.argv))
      errors.push(`Canonical command ${key} argv does not match the manifest.`);
  }
  for (const key of parsed.keys())
    if (!Object.hasOwn(manifest.commands, key))
      errors.push(`Stale canonical command documentation row: ${key}.`);
  return { errors };
};

const recordPath = z
  .string()
  .refine(
    (value) => relativePath.safeParse(value.replace(/\/$/, "")).success,
    "Expected a repository-relative file or directory path",
  );

export const recordSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
    recordedAt: z.string().datetime({ offset: true }),
    phase: z.enum(["design", "review", "planning", "implementation", "verification", "decision"]),
    kind: z.string(),
    status: z.enum(["completed", "passed", "failed", "deferred"]),
    summary: z.string().min(1),
    scope: z.array(recordPath).optional(),
    command: z.string().optional(),
    exitCode: z.number().int().optional(),
    evidence: z.array(z.string()).optional(),
    artifacts: z.array(recordPath).optional(),
    decisions: z
      .array(
        z
          .object({ ruling: z.string(), reason: z.string(), costIfWrong: z.string().optional() })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const validateRecords = (text: string) => {
  const errors: string[] = [];
  const records: ExecutionRecord[] = [];
  const ids = new Set<string>();
  if (!text.endsWith("\n")) errors.push("Execution record must end with exactly one LF");
  if (text.endsWith("\n\n")) errors.push("Execution record has an extra trailing LF");
  if (text.includes("\r")) errors.push("Execution record must not contain CR or CRLF bytes");
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  for (const [index, line] of lines.entries()) {
    try {
      const parsed = recordSchema.parse(JSON.parse(line));
      if (ids.has(parsed.eventId))
        errors.push(`Line ${index + 1}: duplicate record ID ${parsed.eventId}`);
      ids.add(parsed.eventId);
      records.push(parsed);
    } catch (error) {
      errors.push(`Line ${index + 1}: malformed record: ${String(error)}`);
    }
  }
  return { errors, records };
};

export const recordMain = (
  cwd = process.cwd(),
  requested: GovernanceRevisions = revisionArguments(),
) => {
  const errors: string[] = [];
  const revisions = readVerifiedMergeBase({ cwd, ...requested, requireCheckoutMatch: true });
  errors.push(...revisions.errors);
  const recordRelativePath = "test-impact/execution-record.jsonl";
  const recordAbsolutePath = path.join(cwd, recordRelativePath);
  const proposedRecordDiagnostic: {
    path: string;
    status: "unreadable" | "read";
    bytes: number | null;
    validationErrors: string[];
  } = {
    path: recordRelativePath,
    status: "unreadable",
    bytes: null,
    validationErrors: [],
  };
  let prefix = { errors: [] as string[], appendedRecords: [] as ExecutionRecord[] };
  let evidence = { errors: [] as string[], excludedGeneratedPaths: [] as string[] };
  let changedFiles: ReturnType<typeof readGovernedChanges>["files"] = [];
  mkdirSync(path.join(cwd, "artifacts/record"), { recursive: true });
  try {
    let proposedRecord: Buffer | undefined;
    try {
      proposedRecord = readFileSync(recordAbsolutePath);
      proposedRecordDiagnostic.status = "read";
      proposedRecordDiagnostic.bytes = proposedRecord.length;
      const validation = validateRecords(proposedRecord.toString("utf8"));
      proposedRecordDiagnostic.validationErrors = validation.errors;
      errors.push(...validation.errors);
    } catch (error) {
      errors.push(
        `Unable to read proposed execution record ${recordRelativePath}: ${String(error)}`,
      );
    }

    if (revisions.mergeBase && proposedRecord) {
      const base = gitShowBytes(cwd, revisions.mergeBase, recordRelativePath);
      if (base.error || !base.bytes)
        errors.push(base.error ?? "Unable to read base execution record");
      else {
        prefix = verifyRecordPrefix({
          baseRecord: base.bytes,
          proposedRecord,
          validate: validateRecords,
        });
        errors.push(...prefix.errors);
      }
    }

    try {
      const manifest = harnessManifestSchema.parse(
        JSON.parse(readFileSync(path.join(cwd, "proofline.harness.json"), "utf8")),
      );
      errors.push(...validateHarnessAuthority(manifest).errors);
      errors.push(
        ...validateCanonicalCommandDocumentation(
          manifest,
          readFileSync(path.join(cwd, "docs/PORTABLE_TEST_AUTOMATION.md"), "utf8"),
        ).errors,
      );
      let baseManifest: typeof manifest | undefined;
      if (revisions.mergeBase) {
        const baseManifestObject = gitShowBytes(cwd, revisions.mergeBase, "proofline.harness.json");
        if (baseManifestObject.error || !baseManifestObject.bytes)
          errors.push(baseManifestObject.error ?? "Unable to read base harness manifest");
        else {
          try {
            baseManifest = harnessManifestSchema.parse(
              JSON.parse(baseManifestObject.bytes.toString("utf8")),
            );
          } catch (error) {
            errors.push(`Invalid base harness manifest: ${String(error)}`);
          }
        }
      }
      const changes = readGovernedChanges({ cwd, revisions });
      changedFiles = changes.files;
      errors.push(...changes.errors);
      evidence = verifyChangedHarnessEvidence({
        changedFiles,
        appendedRecords: prefix.appendedRecords,
        manifest,
        baseManifest,
      });
      errors.push(...evidence.errors);
    } catch (error) {
      errors.push(`Unable to validate changed harness evidence: ${String(error)}`);
    }

    try {
      const registry = rulesSchema.parse(
        JSON.parse(readFileSync(path.join(cwd, "test-impact/rules.json"), "utf8")),
      );
      if (readFileSync(path.join(cwd, "test-impact/rules.md"), "utf8") !== renderRules(registry))
        errors.push("rules.md drift: run pnpm rules:generate");
    } catch (error) {
      errors.push(`Invalid rule registry or generated catalog: ${String(error)}`);
    }
  } catch (error) {
    errors.push(`Execution record governance failed unexpectedly: ${String(error)}`);
  } finally {
    const artifact = {
      revisions,
      proposedRecord: proposedRecordDiagnostic,
      appendedRecordIds: prefix.appendedRecords.map((record) => record.eventId),
      changedFiles,
      excludedGeneratedPaths: evidence.excludedGeneratedPaths,
      errors: [...new Set(errors)],
    };
    writeFileSync(
      path.join(cwd, "artifacts/record/check.json"),
      `${JSON.stringify(artifact, null, 2)}\n`,
    );
  }

  const uniqueErrors = [...new Set(errors)];
  if (uniqueErrors.length) throw new Error(uniqueErrors.join("\n"));
  process.stdout.write("Execution record governance passed.\n");
  return JSON.parse(readFileSync(path.join(cwd, "artifacts/record/check.json"), "utf8"));
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) recordMain();
