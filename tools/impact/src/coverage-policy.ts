import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { relativePath } from "./validate.ts";

const percentage = z.number().finite().min(0).max(100);
const metrics = ["lines", "branches", "functions", "statements"] as const;
const baselineSchema = z
  .object({
    version: z.literal(1),
    files: z
      .record(
        relativePath,
        z
          .object({
            report: relativePath,
            lines: percentage,
            branches: percentage,
            functions: percentage,
            statements: percentage,
          })
          .strict(),
      )
      .refine((files) => Object.keys(files).length > 0, "Empty baseline"),
  })
  .strict();

export const normalizeRepoPath = (file: string, cwd: string) => {
  const normalized = file.replaceAll("\\", "/");
  const root = cwd.replaceAll("\\", "/").replace(/\/$/, "");
  const relative = normalized.startsWith(`${root}/`)
    ? normalized.slice(root.length + 1)
    : normalized;
  return relativePath.parse(relative);
};

export const checkCoverage = (input: unknown, reports: Record<string, unknown>, cwd: string) => {
  const parsed = baselineSchema.safeParse(input);
  if (!parsed.success) return { errors: [`Invalid coverage baseline: ${parsed.error.message}`] };
  const errors: string[] = [];
  for (const [file, baseline] of Object.entries(parsed.data.files)) {
    const report = reports[baseline.report];
    if (!report || typeof report !== "object" || Array.isArray(report)) {
      errors.push(`Missing or invalid report ${baseline.report}`);
      continue;
    }
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(report)) {
      if (key === "total") continue;
      try {
        const name = normalizeRepoPath(key, cwd);
        if (Object.hasOwn(normalized, name)) errors.push(`Duplicate coverage file ${name}`);
        normalized[name] = value;
      } catch {
        errors.push(`Invalid coverage path ${key}`);
      }
    }
    const entry = normalized[file];
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

export const coverageMain = (cwd = process.cwd()) => {
  const baseline = baselineSchema.parse(
    JSON.parse(readFileSync(path.join(cwd, "test-impact/coverage-baseline.json"), "utf8")),
  );
  const criticalFiles = [
    "packages/service-bus/src/service-bus.ts",
    "packages/policy-service/src/policy-service.ts",
    "packages/policy-state-service/src/policy-state-service.ts",
    "packages/finance-service/src/finance-service.ts",
    "packages/insurance-runtime/src/runtime.ts",
    "packages/api-contracts/src/test-api.ts",
    "tools/impact/src/validate.ts",
  ];
  for (const file of criticalFiles) {
    if (!Object.hasOwn(baseline.files, file)) throw new Error(`Missing critical baseline ${file}`);
  }
  const reports = Object.fromEntries(
    [...new Set(Object.values(baseline.files).map((file) => file.report))].map((report) => {
      try {
        return [report, JSON.parse(readFileSync(path.join(cwd, report), "utf8"))];
      } catch {
        return [report, undefined];
      }
    }),
  );
  const result = checkCoverage(baseline, reports, cwd);
  mkdirSync(path.join(cwd, "artifacts/coverage"), { recursive: true });
  writeFileSync(
    path.join(cwd, "artifacts/coverage/ratchet.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  process.stdout.write(
    `Coverage ratchets passed for ${Object.keys(baseline.files).length} critical files.\n`,
  );
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) coverageMain();
