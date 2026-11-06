import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
// @ts-expect-error JavaScript runtime API
import { validateExecutionMetadata } from "../canonical-runner.mjs";
import {
  parseDiscovery,
  reconcileExecution,
  requiredBindings,
  verifyAggregate,
  // @ts-expect-error JavaScript runtime API
} from "../execution-verification.mjs";
import { runnerFixture } from "../test-fixtures/runner.ts";

const identity = { file: "tests/rules.test.ts", title: "rules > required", project: "unit" };
const event = { ...identity, status: "passed", expectedStatus: "passed", retry: 0, repeats: 0 };
const native = {
  testResults: [
    {
      name: "/repo/tests/rules.test.ts",
      assertionResults: [
        {
          ancestorTitles: ["rules"],
          title: "required",
          fullName: "rules required",
          status: "passed",
        },
      ],
    },
  ],
};
const reconcile = (changes = {}) =>
  reconcileExecution({
    runner: "vitest",
    root: "/repo",
    expected: [identity],
    nativeReport: native,
    nativeEvents: { version: 1, tests: [event] },
    exitCode: 0,
    ...changes,
  });
describe("required execution reconciliation", () => {
  test("accepts genuine passing required identities", () => expect(reconcile().errors).toEqual([]));
  test.each(["skipped", "pending", "todo", "failed"])("rejects runtime %s", (status) =>
    expect(
      reconcile({ nativeEvents: { version: 1, tests: [{ ...event, status }] } }).errors.length,
    ).toBeGreaterThan(0),
  );
  test.each([{ expectedStatus: "failed" }, { retry: 1 }, { repeats: 1 }, { project: "wrong" }])(
    "rejects substituted or ambiguous native outcome %j",
    (change) =>
      expect(
        reconcile({ nativeEvents: { version: 1, tests: [{ ...event, ...change }] } }).errors.length,
      ).toBeGreaterThan(0),
  );
  test.each([undefined, {}, { testResults: [] }])(
    "rejects missing malformed and zero reports %j",
    (nativeReport) => expect(reconcile({ nativeReport }).errors.length).toBeGreaterThan(0),
  );
  test("rejects duplicate and missing native sidecar identities", () => {
    expect(
      reconcile({ nativeEvents: { version: 1, tests: [event, event] } }).errors.length,
    ).toBeGreaterThan(0);
    expect(reconcile({ nativeEvents: undefined }).errors.length).toBeGreaterThan(0);
  });
  test("rejects omitted unit targets and accepts a complete aggregate", () => {
    expect(verifyAggregate({ expected: [identity], children: [] }).errors.length).toBeGreaterThan(
      0,
    );
    expect(
      verifyAggregate({
        expected: [identity],
        children: [{ outcome: "passed", observed: [event] }],
      }).errors,
    ).toEqual([]);
  });
  test("allows explicit empty target only without required identities", () => {
    const empty = {
      expected: [],
      nativeReport: { testResults: [] },
      nativeEvents: { version: 1, tests: [] },
      allowEmpty: true,
    };
    expect(reconcile(empty).errors).toEqual([]);
    expect(reconcile({ ...empty, expected: [identity] }).errors.length).toBeGreaterThan(0);
    expect(reconcile({ ...empty, allowEmpty: false }).errors.length).toBeGreaterThan(0);
  });
  test("deduplicates rule bindings while preserving exact identity", () =>
    expect(
      requiredBindings(
        {
          ownership: [
            {
              testBindings: [
                { runner: "vitest", ...identity },
                { runner: "vitest", ...identity },
              ],
            },
          ],
        },
        "vitest",
      ),
    ).toHaveLength(1));
  test("discovers selected and shard browser applicability before runtime", () => {
    const report = {
      config: { rootDir: "/repo/tests" },
      suites: [
        {
          title: "a.spec.ts",
          file: "a.spec.ts",
          specs: [{ title: "required", file: "a.spec.ts", tests: [{ projectName: "chromium" }] }],
        },
      ],
    };
    const expected = parseDiscovery("playwright", report, "/repo");
    expect(expected).toEqual([{ file: "tests/a.spec.ts", title: "required", project: "chromium" }]);
    for (const status of ["skipped", "failed"]) {
      const runtime = structuredClone(report) as typeof report & {
        suites: {
          specs: {
            tests: {
              projectName: string;
              expectedStatus?: string;
              status?: string;
              results?: { status: string; retry: number }[];
            }[];
          }[];
        }[];
      };
      runtime.suites[0].specs[0].tests[0] = {
        projectName: "chromium",
        expectedStatus: "passed",
        status: "expected",
        results: [{ status, retry: 0 }],
      };
      expect(
        reconcileExecution({
          runner: "playwright",
          root: "/repo",
          expected,
          nativeReport: runtime,
          exitCode: 0,
        }).errors.length,
      ).toBeGreaterThan(0);
    }
  });
});

test("native Vitest events reject actual expected failure and successful retry", async () => {
  mkdirSync("artifacts", { recursive: true });
  const directory = mkdtempSync(path.join(process.cwd(), "artifacts/native-fixture-"));
  try {
    for (const [name, source] of [
      [
        "expected-failure",
        'test.fails("required", () => { throw new Error("expected failure"); });',
      ],
      [
        "retry",
        'let count = 0; test("required", { retry: 1 }, () => { if (count++ === 0) throw new Error("retry"); });',
      ],
      ["runtime-skip", 'test("required", (context) => { context.skip(); });'],
      ["genuine", 'test("required", () => {});'],
    ]) {
      const file = path.join(directory, `${name}.test.ts`);
      writeFileSync(file, `import { test } from "vitest";\n${source}\n`);
      const result = spawnSync(
        process.execPath,
        ["tools/proofline/canonical-runner.mjs", "vitest", "run", file],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(name === "genuine" ? 0 : 1);
      const index = readFileSync("artifacts/proofline/execution-index.jsonl", "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      const record = index
        .map((item) =>
          JSON.parse(readFileSync(path.join("artifacts/proofline", item.verification), "utf8")),
        )
        .reverse()
        .find((item) => item.requestedArgs?.includes(file));
      expect(record.observed).toHaveLength(1);
      expect(record.observed[0].project).toBe("");
      if (name === "expected-failure") expect(record.observed[0].expectedStatus).toBe("failed");
      if (name === "retry") expect(record.observed[0].retry).toBe(1);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 20000);

test("canonical execution rejects absent metadata and unknown build prerequisites", async () => {
  const manifest = JSON.parse(readFileSync("proofline.harness.json", "utf8"));
  expect(validateExecutionMetadata(manifest).unitTargets.length).toBeGreaterThan(0);
  expect(() => validateExecutionMetadata({ ...manifest, execution: undefined })).toThrow(
    /requires explicit/,
  );
  expect(() =>
    validateExecutionMetadata({
      ...manifest,
      execution: { ...manifest.execution, unitBuildCommands: ["absent"] },
    }),
  ).toThrow(/build command/);
  expect(() =>
    validateExecutionMetadata({
      ...manifest,
      execution: { ...manifest.execution, unitTargets: [{ argv: ["run"], cwd: "../" }] },
    }),
  ).toThrow(/escapes/);
});

test("matches lossless project outcomes against the native JSON assertion multiset", () => {
  const second = { ...identity, project: "another-project" };
  expect(
    reconcile({
      expected: [identity, second],
      nativeReport: { testResults: [native.testResults[0], native.testResults[0]] },
      nativeEvents: { version: 1, tests: [event, { ...event, project: second.project }] },
    }).errors,
  ).toEqual([]);
});

test("accepts passing browser applicability and rejects expected-failure and retry substitutions", () => {
  const expected = [{ file: "tests/a.spec.ts", title: "required", project: "chromium" }];
  const browser = (change = {}) => ({
    config: { rootDir: "/repo/tests" },
    suites: [
      {
        specs: [
          {
            file: "a.spec.ts",
            title: "required",
            tests: [
              {
                projectName: "chromium",
                expectedStatus: "passed",
                status: "expected",
                results: [{ status: "passed", retry: 0 }],
                ...change,
              },
            ],
          },
        ],
      },
    ],
  });
  expect(
    reconcileExecution({
      runner: "playwright",
      expected,
      nativeReport: browser(),
      root: "/repo",
      exitCode: 0,
    }).outcome,
  ).toBe("passed");
  for (const change of [
    { expectedStatus: "failed" },
    { results: [{ status: "passed", retry: 1 }] },
    {
      results: [
        { status: "failed", retry: 0 },
        { status: "passed", retry: 1 },
      ],
    },
  ])
    expect(
      reconcileExecution({
        runner: "playwright",
        expected,
        nativeReport: browser(change),
        root: "/repo",
        exitCode: 0,
      }).outcome,
    ).toBe("failed");
});

test("cannot hide native suite errors behind a zero exit code", () => {
  expect(reconcile({ nativeReport: { ...native, success: false } }).outcome).toBe("failed");
  expect(
    reconcile({
      nativeEvents: { version: 1, tests: [event], unhandledErrors: [{ message: "unhandled" }] },
    }).outcome,
  ).toBe("failed");
});

const expectFullUnitTargets = (fixture: ReturnType<typeof runnerFixture>, args: string[]) => {
  const result = fixture.run(["unit", ...args]);
  expect(result.status, `${args}: ${result.stderr}`).toBe(1);
  const aggregate = fixture
    .records()
    .reverse()
    .find((record) => record.runner === "aggregate");
  expect(aggregate.scope).toBe("full");
  expect(
    fixture
      .records()
      .reverse()
      .find((record) => record.runner === "vitest").outcome,
  ).toBe("passed");
  expect(aggregate.errors.join(" ")).toContain("b.test.ts");
};

const expectFullBrowserIdentities = (fixture: ReturnType<typeof runnerFixture>, args: string[]) => {
  const result = fixture.run(["browser", ...args]);
  expect(result.status, `${args}: ${result.stderr}`).toBe(1);
  const record = fixture.records().at(-1);
  expect(record.scope).toBe("full");
  expect(record.errors.join(" ")).toContain("browser/b.spec.ts");
};

test("canonical tuning flags cannot omit required unit targets or browser identities", () => {
  const fixture = runnerFixture();
  try {
    expectFullUnitTargets(fixture, ["--maxWorkers=1"]);
    expectFullBrowserIdentities(fixture, ["--workers=1"]);
    expect(fixture.run(["unit", "--testNamePattern=first"]).status).toBe(0);
    expect(fixture.records().at(-1).scope).toBe("subset");
    expect(fixture.run(["browser", "--grep", "first browser"]).status).toBe(0);
    expect(fixture.records().at(-1).scope).toBe("subset");
  } finally {
    fixture.cleanup();
  }
}, 30000);

// Each remaining spelling owns its fixture and the same bounded deadline.
// Independent CLI startup costs must not accumulate against one test budget.
test("canonical unit tuning 'separate maxWorkers' cannot omit required unit targets", () => {
  const fixture = runnerFixture();
  try {
    expectFullUnitTargets(fixture, ["--maxWorkers", "1"]);
  } finally {
    fixture.cleanup();
  }
}, 30000);

test("canonical unit tuning 'equals retry' cannot omit required unit targets", () => {
  const fixture = runnerFixture();
  try {
    expectFullUnitTargets(fixture, ["--retry=1"]);
  } finally {
    fixture.cleanup();
  }
}, 30000);

test("canonical unit tuning 'separate retry' cannot omit required unit targets", () => {
  const fixture = runnerFixture();
  try {
    expectFullUnitTargets(fixture, ["--retry", "1"]);
  } finally {
    fixture.cleanup();
  }
}, 30000);

test("canonical unit tuning 'coverage' cannot omit required unit targets", () => {
  const fixture = runnerFixture();
  try {
    expectFullUnitTargets(fixture, ["--coverage"]);
  } finally {
    fixture.cleanup();
  }
}, 30000);

test("canonical browser tuning 'separate workers' cannot omit required browser identities", () => {
  const fixture = runnerFixture();
  try {
    expectFullBrowserIdentities(fixture, ["--workers", "1"]);
  } finally {
    fixture.cleanup();
  }
}, 30000);

test("canonical browser tuning 'retries' cannot omit required browser identities", () => {
  const fixture = runnerFixture();
  try {
    expectFullBrowserIdentities(fixture, ["--retries", "1"]);
  } finally {
    fixture.cleanup();
  }
}, 30000);

test("canonical browser tuning 'timeout' cannot omit required browser identities", () => {
  const fixture = runnerFixture();
  try {
    expectFullBrowserIdentities(fixture, ["--timeout=10000"]);
  } finally {
    fixture.cleanup();
  }
}, 30000);

test("standalone native discovery and execution require no undeclared Nx binary", () => {
  const fixture = runnerFixture({ withoutNx: true });
  try {
    const discovery = fixture.run(["vitest", "list", "--config", "vitest.config.mjs", "--json"]);
    expect(discovery.status, discovery.stderr).toBe(0);
    expect(JSON.parse(discovery.stdout)).toHaveLength(1);
    const execution = fixture.run(["vitest", "run", "--config", "vitest.config.mjs"]);
    expect(execution.status, execution.stderr).toBe(0);
  } finally {
    fixture.cleanup();
  }
}, 10000);
