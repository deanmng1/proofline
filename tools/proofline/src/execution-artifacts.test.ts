import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import {
  allocateInvocation,
  assertControlledOutputs,
  finishInvocation,
  // @ts-expect-error JavaScript runtime API
} from "../execution-artifacts.mjs";
import { runnerFixture } from "../test-fixtures/runner.ts";

test("preserves failed invocation bytes across subsequent and parallel allocations", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "proofline-artifacts-"));
  try {
    const first = allocateInvocation(root);
    writeFileSync(path.join(first.directory, "trace.zip"), "failed trace");
    finishInvocation(first, { version: 1, invocationId: first.invocationId, outcome: "failed" });
    const others = await Promise.all(
      Array.from({ length: 10 }, async () => allocateInvocation(root)),
    );
    expect(new Set([first, ...others].map((item) => item.directory)).size).toBe(11);
    expect(readFileSync(path.join(first.directory, "trace.zip"), "utf8")).toBe("failed trace");
    const index = JSON.parse(
      readFileSync(path.join(root, "artifacts/proofline/execution-index.jsonl"), "utf8").trim(),
    );
    expect(index.verification).toBe(`runs/${first.invocationId}/verification.json`);
    expect(index.sha256).toMatch(/^[a-f0-9]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test.each([
  "--outputFile=elsewhere",
  "--output=elsewhere",
  "--reporter=json",
  "--reporter",
  "--outputFile.json=elsewhere",
])("rejects conflicting artifact override %s", (arg) =>
  expect(() => assertControlledOutputs(["run", arg])).toThrow(/output|reporter/i),
);

test("never replaces a finalized verification record", () => {
  const root = mkdtempSync(path.join(tmpdir(), "proofline-artifacts-"));
  try {
    const invocation = allocateInvocation(root);
    finishInvocation(invocation, { outcome: "failed", errors: ["Missing native report"] });
    expect(() => finishInvocation(invocation, { outcome: "passed" })).toThrow();
    expect(
      JSON.parse(readFileSync(path.join(invocation.directory, "verification.json"), "utf8"))
        .outcome,
    ).toBe("failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("coverage CLI config and environment destinations cannot erase finalized evidence", () => {
  const fixture = runnerFixture();
  try {
    const previous = allocateInvocation(fixture.root);
    writeFileSync(path.join(previous.directory, "trace.zip"), "historical media");
    finishInvocation(previous, { outcome: "failed", invocationId: previous.invocationId });
    const before = readFileSync(path.join(previous.directory, "verification.json"));
    symlinkSync(previous.directory, path.join(fixture.root, "coverage-link"));
    for (const [name, args, env] of [
      ["equals", [`--coverage.reportsDirectory=${previous.directory}`], {}],
      ["split", ["--coverage.reportsDirectory", previous.directory], {}],
      ["ancestor", ["--coverage.reportsDirectory=artifacts"], {}],
      ["symlink", ["--coverage.reportsDirectory=coverage-link"], {}],
      ["config", [], {}],
      ["environment", [], { FIXTURE_COVERAGE_DIRECTORY: previous.directory }],
    ] as [string, string[], Record<string, string>][]) {
      fixture.write(
        "vitest.config.mjs",
        `export default { test: { include: ["a.test.ts"], coverage: { enabled: true, include: ["value.ts"], reporter: ["json-summary"], reportsDirectory: ${name === "config" ? JSON.stringify(previous.directory) : 'process.env.FIXTURE_COVERAGE_DIRECTORY || "coverage"'} } } };`,
      );
      const result = fixture.run(["vitest", "run", "--config", "vitest.config.mjs", ...args], env);
      expect(result.status, `${name}: ${result.stderr}`).toBe(1);
      expect(readFileSync(path.join(previous.directory, "trace.zip"), "utf8")).toBe(
        "historical media",
      );
      expect(readFileSync(path.join(previous.directory, "verification.json"))).toEqual(before);
    }
    fixture.write(
      "vitest.config.mjs",
      'export default { test: { include: ["a.test.ts"], coverage: { enabled: true, include: ["value.ts"], reporter: ["json-summary"], reportsDirectory: "artifacts/coverage-safe" } } };',
    );
    const success = fixture.run(["vitest", "run", "--config", "vitest.config.mjs"]);
    expect(success.status, success.stderr).toBe(0);
    expect(
      JSON.parse(
        readFileSync(
          path.join(fixture.root, "artifacts/coverage-safe/coverage-summary.json"),
          "utf8",
        ),
      ).total.lines.pct,
    ).toBe(100);
  } finally {
    fixture.cleanup();
  }
}, 20000);

test("records executing process runtime on every invocation and overrides claimed runtime", () => {
  const root = mkdtempSync(path.join(tmpdir(), "proofline-runtime-"));
  try {
    for (const runner of ["vitest", "playwright", "aggregate"]) {
      const invocation = allocateInvocation(root);
      finishInvocation(invocation, {
        runner,
        metadata: { projects: [], runtime: { platform: "forged" } },
      });
      const record = JSON.parse(
        readFileSync(path.join(invocation.directory, "verification.json"), "utf8"),
      );
      expect(record.metadata.runtime).toEqual({
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        execPath: process.execPath,
      });
      expect(record.metadata.projects).toEqual([]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
