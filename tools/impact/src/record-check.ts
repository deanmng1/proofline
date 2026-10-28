import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { relativePath, renderRules, rulesSchema } from "./validate.ts";

const recordPath = z
  .string()
  .refine(
    (value) => relativePath.safeParse(value.replace(/\/$/, "")).success,
    "Expected a repository-relative file or directory path",
  );

const recordSchema = z
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
  const ids = new Set<string>();
  const lines = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  for (const [index, line] of lines.entries()) {
    try {
      const record = recordSchema.parse(JSON.parse(line));
      if (ids.has(record.eventId))
        errors.push(`Line ${index + 1}: duplicate record ID ${record.eventId}`);
      ids.add(record.eventId);
    } catch (error) {
      errors.push(`Line ${index + 1}: malformed record: ${String(error)}`);
    }
  }
  return { errors };
};

export const recordMain = (cwd = process.cwd()) => {
  const result = validateRecords(
    readFileSync(path.join(cwd, "test-impact/execution-record.jsonl"), "utf8"),
  );
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  const registry = rulesSchema.parse(
    JSON.parse(readFileSync(path.join(cwd, "test-impact/rules.json"), "utf8")),
  );
  if (readFileSync(path.join(cwd, "test-impact/rules.md"), "utf8") !== renderRules(registry))
    throw new Error("rules.md drift: run pnpm rules:generate");
  process.stdout.write("Execution record validation passed.\n");
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) recordMain();
