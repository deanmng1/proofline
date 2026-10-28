import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { checkCoverage, coverageMain } from "./coverage-policy.ts";
import { validateRecords } from "./record-check.ts";

const metrics = { lines: 90, branches: 80, functions: 100, statements: 90 };
const baseline = {
  version: 1,
  files: {
    "packages/service-bus/src/service-bus.ts": {
      report: "artifacts/coverage/service-bus/coverage-summary.json",
      ...metrics,
    },
  },
};
const report = (values = metrics) => ({
  "/repo/packages/service-bus/src/service-bus.ts": Object.fromEntries(
    Object.entries(values).map(([metric, pct]) => [metric, { pct }]),
  ),
});
const reports = (values = metrics) => ({
  "artifacts/coverage/service-bus/coverage-summary.json": report(values),
});
describe("coverage ratchets", () => {
  test("rejects_a_removed_critical_baseline_entry", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "coverage-policy-"));
    try {
      mkdirSync(path.join(cwd, "test-impact"));
      writeFileSync(path.join(cwd, "test-impact/coverage-baseline.json"), JSON.stringify(baseline));
      expect(() => coverageMain(cwd)).toThrow(/Missing critical baseline/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
  test("normalizes_absolute_report_paths_and_accepts_the_baseline", () => {
    expect(checkCoverage(baseline, reports(), "/repo").errors).toEqual([]);
  });
  test.each(["lines", "branches", "functions", "statements"])(
    "rejects_a_critical_file_below_its_%s_baseline",
    (metric) => {
      expect(
        checkCoverage(baseline, reports({ ...metrics, [metric]: 0 }), "/repo").errors.join(" "),
      ).toMatch(/below/);
    },
  );
  test("fails_closed_for_missing_reports_files_metrics_and_baselines", () => {
    for (const input of [
      {},
      { "artifacts/coverage/service-bus/coverage-summary.json": {} },
      {
        "artifacts/coverage/service-bus/coverage-summary.json": {
          "packages/service-bus/src/service-bus.ts": { lines: { pct: 100 } },
        },
      },
    ]) {
      expect(checkCoverage(baseline, input, "/repo").errors.length).toBeGreaterThan(0);
    }
    expect(checkCoverage({}, reports(), "/repo").errors.length).toBeGreaterThan(0);
    expect(
      checkCoverage({ version: 1, files: {} }, reports(), "/repo").errors.length,
    ).toBeGreaterThan(0);
  });
});
const record = {
  schemaVersion: 1,
  eventId: "test-1",
  recordedAt: "2026-10-28T00:00:00Z",
  phase: "verification",
  kind: "test",
  status: "passed",
  summary: "Verified",
  command: "pnpm test",
  exitCode: 0,
};
describe("portable execution record", () => {
  test("accepts_repository_relative_directory_artifacts_without_rewriting_history", () => {
    expect(
      validateRecords(JSON.stringify({ ...record, artifacts: ["artifacts/coverage/domain/"] }))
        .errors,
    ).toEqual([]);
  });
  test("accepts_valid_records", () =>
    expect(validateRecords(`${JSON.stringify(record)}\n`).errors).toEqual([]));
  test("rejects_malformed_lines", () => {
    for (const text of [
      "",
      "{",
      "{}",
      `${JSON.stringify(record)}\n\n${JSON.stringify({ ...record, eventId: "test-2" })}`,
      JSON.stringify({ ...record, unexpected: true }),
      JSON.stringify({ ...record, scope: ["/absolute/path"] }),
    ]) {
      expect(validateRecords(text).errors.length).toBeGreaterThan(0);
    }
  });
  test("rejects_duplicate_record_ids", () =>
    expect(
      validateRecords(`${JSON.stringify(record)}\n${JSON.stringify(record)}\n`).errors.join(" "),
    ).toMatch(/duplicate/i));
});
