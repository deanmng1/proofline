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
import { harnessManifestSchema, validateHarnessAuthority } from "./harness-manifest.ts";
import { relativePath, renderRules, rulesSchema } from "./validate.ts";

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
  const proposedRecord = readFileSync(path.join(cwd, "test-impact/execution-record.jsonl"));
  let prefix = { errors: [] as string[], appendedRecords: [] as ExecutionRecord[] };
  if (revisions.mergeBase) {
    const base = gitShowBytes(cwd, revisions.mergeBase, "test-impact/execution-record.jsonl");
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

  let evidence = { errors: [] as string[], excludedGeneratedPaths: [] as string[] };
  let changedFiles: ReturnType<typeof readGovernedChanges>["files"] = [];
  try {
    const manifest = harnessManifestSchema.parse(
      JSON.parse(readFileSync(path.join(cwd, "proofline.harness.json"), "utf8")),
    );
    errors.push(...validateHarnessAuthority(manifest).errors);
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

  const artifact = {
    revisions,
    appendedRecordIds: prefix.appendedRecords.map((record) => record.eventId),
    changedFiles,
    excludedGeneratedPaths: evidence.excludedGeneratedPaths,
    errors: [...new Set(errors)],
  };
  mkdirSync(path.join(cwd, "artifacts/record"), { recursive: true });
  writeFileSync(
    path.join(cwd, "artifacts/record/check.json"),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  if (artifact.errors.length) throw new Error(artifact.errors.join("\n"));
  process.stdout.write("Execution record governance passed.\n");
  return artifact;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) recordMain();
