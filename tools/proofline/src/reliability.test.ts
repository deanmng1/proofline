import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  authorizeReliabilityTrigger,
  collectReliabilityForTrigger,
  collectVerificationHistory,
  parseReliabilityOptions,
  summarizeReliability,
  writeReliabilityObservation,
  // @ts-expect-error Source-native operational API.
} from "../reliability.mjs";
// @ts-expect-error Source-native read-only transport.
import { createGithubReliabilityApi } from "../reliability-api.mjs";

const repository = "acme/proofline";
const sha = "a".repeat(40);
const since = "2026-11-01T00:00:00Z";
const until = "2026-11-06T00:00:00Z";
const observedAt = "2026-11-06T01:00:00Z";
const workflow = {
  id: 17,
  node_id: "W_17",
  name: "Verify Proofline regression harness",
  path: ".github/workflows/verify.yml",
  state: "active",
  url: `https://api.github.com/repos/${repository}/actions/workflows/17`,
  html_url: `https://github.com/${repository}/actions/workflows/verify.yml`,
  badge_url: "https://github.com/acme/proofline/workflows/Verify/badge.svg",
  created_at: since,
  updated_at: since,
};
const repo = {
  id: 7,
  node_id: "R_7",
  name: "proofline",
  full_name: repository,
  private: false,
  default_branch: "main",
  owner: { login: "acme", id: 1, type: "Organization" },
  html_url: `https://github.com/${repository}`,
  url: `https://api.github.com/repos/${repository}`,
  fork: false,
};
const gates = [
  ["lint", "Lint"],
  ["typecheck", "Typecheck"],
  ["manifest", "Validate portable harness manifest"],
  ["production", "Build and audit the production application boundary"],
  ["record", "Validate portable execution record and generated catalog"],
  ["impactPreview", "Preview impact selection"],
  ["impact", "Run impact-selected tests"],
  ["unit", "Run full Vitest safety gate"],
  ["browser", "Run full Chromium safety gate"],
  ["browserScenario", "Run explicit multi-worker scenario gate"],
  ["browserScenarioShard1", "Run explicit scenario shard one"],
  ["browserScenarioShard2", "Run explicit scenario shard two"],
  ["coverage", "Generate Vitest coverage baseline"],
  ["coverageCheck", "Check scoped critical-file coverage ratchets"],
  ["whitespace", "Check patch whitespace"],
  ["portability", "Validate independent application portability"],
];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function run(id = 101, attempt = 1, conclusion: string | null = "success", event = "push") {
  return {
    id,
    name: workflow.name,
    node_id: `WR_${id}`,
    head_branch: "main",
    head_sha: sha,
    path: workflow.path,
    run_number: id,
    event,
    display_title: "fixture source",
    status: conclusion ? "completed" : "in_progress",
    conclusion,
    workflow_id: 17,
    check_suite_id: id + 5000,
    check_suite_node_id: `CS_${id}`,
    url: `https://api.github.com/repos/${repository}/actions/runs/${id}`,
    html_url: `https://github.com/${repository}/actions/runs/${id}`,
    pull_requests: [],
    created_at: "2026-11-02T00:00:00Z",
    updated_at: "2026-11-02T00:05:00Z",
    run_started_at: "2026-11-02T00:00:00Z" as string | null,
    run_attempt: attempt,
    jobs_url: `https://api.github.com/repos/${repository}/actions/runs/${id}/jobs`,
    logs_url: `https://api.github.com/repos/${repository}/actions/runs/${id}/logs`,
    check_suite_url: `https://api.github.com/repos/${repository}/check-suites/${id + 5000}`,
    artifacts_url: `https://api.github.com/repos/${repository}/actions/runs/${id}/artifacts`,
    cancel_url: `https://api.github.com/repos/${repository}/actions/runs/${id}/cancel`,
    rerun_url: `https://api.github.com/repos/${repository}/actions/runs/${id}/rerun`,
    previous_attempt_url:
      attempt > 1
        ? `https://api.github.com/repos/${repository}/actions/runs/${id}/attempts/${attempt - 1}`
        : null,
    repository: repo,
    head_repository: repo,
    actor: { login: "fixture", id: 2, type: "User" },
    triggering_actor: { login: "fixture", id: 2, type: "User" },
    head_commit: {
      id: sha,
      tree_id: "b".repeat(40),
      message: "fixture",
      timestamp: "2026-11-02T00:00:00Z",
      author: { name: "Fixture", email: "fixture@example.invalid" },
      committer: { name: "Fixture", email: "fixture@example.invalid" },
    },
  };
}
function jobs(runId = 101, attempt = 1, conclusion: string | null = "success") {
  return ["linux-x64-chromium", "darwin-arm64-chromium"].map((platform, index) => ({
    id: runId * 1000 + attempt * 10 + index,
    run_id: runId,
    run_attempt: attempt,
    head_sha: sha,
    run_url: `https://api.github.com/repos/${repository}/actions/runs/${runId}`,
    node_id: `J_${runId}_${attempt}_${index}`,
    url: `https://api.github.com/repos/${repository}/actions/jobs/${runId * 1000 + attempt * 10 + index}`,
    html_url: `https://github.com/${repository}/actions/runs/${runId}/job/${runId * 1000 + attempt * 10 + index}`,
    name: `verify (${platform})`,
    status: conclusion ? "completed" : "in_progress",
    conclusion,
    started_at: "2026-11-02T00:00:00Z" as string | null,
    completed_at: conclusion ? "2026-11-02T00:04:00Z" : null,
    check_run_url: `https://api.github.com/repos/${repository}/check-runs/${runId * 1000 + attempt * 10 + index}`,
    labels: index ? ["macos-15"] : ["ubuntu-24.04"],
    runner_id: 1,
    runner_name: "GitHub Actions",
    runner_group_id: 1,
    runner_group_name: "GitHub Actions",
    workflow_name: workflow.name,
    head_branch: "main",
    steps: gates.map(([, name], i) => ({
      name,
      number: i + 1,
      status: conclusion ? "completed" : "in_progress",
      conclusion,
      started_at: "2026-11-02T00:00:00Z" as string | null,
      completed_at: conclusion ? "2026-11-02T00:04:00Z" : null,
    })),
  }));
}
type Fixture = {
  runs: ReturnType<typeof run>[];
  attempts: Record<string, ReturnType<typeof run> | null>;
  jobs: Record<string, ReturnType<typeof jobs>>;
  override?: (route: string) => unknown;
};
function fixture(runs = [run()]): Fixture {
  return {
    runs,
    attempts: Object.fromEntries(
      runs.flatMap((r) =>
        Array.from({ length: r.run_attempt }, (_, i) => [
          `${r.id}/${i + 1}`,
          run(r.id, i + 1, r.conclusion, r.event),
        ]),
      ),
    ),
    jobs: Object.fromEntries(
      runs.flatMap((r) =>
        Array.from({ length: r.run_attempt }, (_, i) => [
          `${r.id}/${i + 1}`,
          jobs(r.id, i + 1, r.conclusion),
        ]),
      ),
    ),
  };
}
function offline(value: Fixture) {
  return async (_repository: string, route: string) => {
    expect(_repository).toBe(repository);
    const overridden = value.override?.(route);
    if (overridden !== undefined) return clone(overridden);
    if (route === "") return clone(repo);
    if (route === "/actions/workflows/verify.yml") return clone(workflow);
    if (route.startsWith("/actions/workflows/17/runs?")) {
      const params = new URLSearchParams(route.split("?")[1]);
      expect(params.get("branch")).toBe("main");
      expect(params.has("status")).toBe(false);
      expect(params.get("created")).toBe(`${since}..${until}`);
      const page = Number(params.get("page"));
      return {
        total_count: value.runs.length,
        workflow_runs: clone(value.runs.slice((page - 1) * 100, page * 100)),
      };
    }
    const attempt = route.match(
      /^\/actions\/runs\/(\d+)\/attempts\/(\d+)(\/jobs\?per_page=100&page=(\d+))?$/,
    );
    if (attempt) {
      const key = `${attempt[1]}/${attempt[2]}`;
      if (value.attempts[key] === null) return { unavailable: 404 };
      if (!value.attempts[key]) throw new Error(`Unexpected fixture attempt ${key}`);
      if (!attempt[3]) return clone(value.attempts[key]);
      const all = value.jobs[key];
      return {
        total_count: all.length,
        jobs: clone(all.slice((Number(attempt[4]) - 1) * 100, Number(attempt[4]) * 100)),
      };
    }
    const final = route.match(/^\/actions\/runs\/(\d+)$/);
    if (final) return clone(value.runs.find((r) => String(r.id) === final[1]));
    throw new Error(`Unexpected offline route ${route}`);
  };
}
const collect = (value = fixture(), extra = {}) =>
  collectVerificationHistory({
    repository,
    workflow: workflow.path,
    since,
    until,
    observedAt,
    api: offline(value),
    ...extra,
  });
const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("supplementary canonical verification reliability", () => {
  test("preserves an original failure and later retry pass with separate identities and gate counts", async () => {
    const f = fixture([run(101, 2)]);
    f.attempts["101/1"] = run(101, 1, "failure");
    f.jobs["101/1"][0].conclusion = "failure";
    f.jobs["101/1"][0].steps[7].conclusion = "failure";
    const observation = await collect(f);
    expect(observation.transport).toBe("injected-offline");
    expect(
      observation.attempts.map((a: { runId: string; attempt: number; conclusion: string }) => [
        a.runId,
        a.attempt,
        a.conclusion,
      ]),
    ).toEqual([
      ["101", 1, "failure"],
      ["101", 2, "success"],
    ]);
    expect(observation.attempts[0].jobs[0]).toMatchObject({
      platform: "linux-x64-chromium",
      jobId: "101010",
      failedGates: ["unit"],
      durationMs: 240000,
    });
    const summary = summarizeReliability(observation);
    expect(summary.sample).toMatchObject({
      runs: 1,
      attempts: 2,
      firstAttempt: { total: 1, known: 1, unknown: 0, outcomes: { failure: 1 } },
      retry: { total: 1, known: 1, outcomes: { success: 1 } },
    });
    expect(summary.platforms["linux-x64-chromium"].gates.unit.outcomes).toEqual({
      failure: 1,
      success: 1,
    });
    expect(summary.authority).toBe("supplementary-only");
    expect(JSON.stringify(summary)).not.toMatch(/flakeRate|infrastructureFailure|releaseEligible/);
  });
  test("keeps a later different source success from rewriting an original failed run", async () => {
    const f = fixture([run(101, 1, "failure"), run(102)]);
    f.runs[1].head_sha = "c".repeat(40);
    const secondAttempt = f.attempts["102/1"];
    if (!secondAttempt) throw new Error("Missing fixture attempt");
    secondAttempt.head_sha = "c".repeat(40);
    f.jobs["102/1"].forEach((j) => {
      j.head_sha = "c".repeat(40);
    });
    const summary = summarizeReliability(await collect(f));
    expect(summary.sample.firstAttempt.outcomes).toEqual({ failure: 1, success: 1 });
    expect(summary.attempts[0].sourceCommit).toBe(sha);
    expect(summary.attempts[1].sourceCommit).toBe("c".repeat(40));
  });
  test("reports unavailable first attempts and sparse retries as unknown denominators", async () => {
    const f = fixture([run(101, 2)]);
    f.attempts["101/1"] = null;
    f.jobs["101/2"].pop();
    f.jobs["101/2"][0].steps.splice(7, 1);
    const observation = await collect(f);
    expect(observation.attempts[0]).toMatchObject({
      availability: "unavailable",
      conclusion: null,
      updatedAt: null,
    });
    expect(observation.attempts[1].unknownReasons).toEqual(
      expect.arrayContaining([
        "missing-platform:darwin-arm64-chromium",
        "missing-gate:linux-x64-chromium:unit",
      ]),
    );
    const summary = summarizeReliability(observation);
    expect(summary.sample.firstAttempt).toMatchObject({
      total: 1,
      known: 0,
      unknown: 1,
      outcomes: {},
    });
    expect(summary.platforms["darwin-arm64-chromium"].missing).toBe(2);
    expect(summary.platforms["linux-x64-chromium"].gates.unit.unknown).toBe(2);
  });
  test("keeps cancelled and pending outcomes separate and does not call absent gates successful", async () => {
    const f = fixture([run(101, 1, "cancelled"), run(102, 1, null)]);
    f.jobs["101/1"].forEach((j) => {
      j.steps = [];
    });
    const summary = summarizeReliability(await collect(f));
    expect(summary.sample.firstAttempt).toMatchObject({
      known: 1,
      unknown: 1,
      outcomes: { cancelled: 1 },
    });
    expect(summary.attempts[1].completedAt).toBe(null);
    expect(summary.attempts[1].durationMs).toBe(null);
    expect(summary.platforms["linux-x64-chromium"].gates.unit.unknown).toBe(2);
  });
  test("retains failure evidence before required gates without inventing an infrastructure cause", async () => {
    const f = fixture([run(101, 1, "failure")]);
    f.jobs["101/1"][0].steps = [
      {
        name: "Install dependencies",
        number: 1,
        status: "completed",
        conclusion: "failure",
        started_at: "2026-11-02T00:00:00Z",
        completed_at: "2026-11-02T00:01:00Z",
      },
    ];
    const observation = await collect(f);
    expect(observation.attempts[0].jobs[0].failedSteps).toEqual(["Install dependencies"]);
    expect(observation.attempts[0].jobs[0].steps).toMatchObject([
      { name: "Install dependencies", conclusion: "failure" },
    ]);
    expect(observation.attempts[0].jobs[0].failedGates).toEqual([]);
    expect(observation.attempts[0].unknownReasons).toContain(
      "failed-gate-unidentified:linux-x64-chromium",
    );
  });
  test("retains pending evolution and idempotent duplicates but rejects conflicting terminal facts", async () => {
    const pending = await collect(fixture([run(101, 1, null)]), {
      observedAt: "2026-11-06T00:10:00Z",
    });
    const completed = await collect();
    const summary = summarizeReliability([pending, completed, clone(completed)]);
    expect(summary.sample).toMatchObject({
      observations: 2,
      duplicateObservations: 1,
      attempts: 1,
    });
    expect(summary.snapshots).toHaveLength(2);
    expect(summary.attempts[0].conclusion).toBe("success");
    const conflicting = clone(completed);
    conflicting.observedAt = "2026-11-06T02:00:00Z";
    conflicting.window.cutoff = conflicting.observedAt;
    conflicting.attempts[0].conclusion = "failure";
    expect(() => summarizeReliability([completed, conflicting])).toThrow(/conflict/i);
    conflicting.attempts[0].conclusion = "success";
    conflicting.attempts[0].jobs[0].gates[0].conclusion = "failure";
    conflicting.attempts[0].jobs[0].steps[0].conclusion = "failure";
    conflicting.attempts[0].jobs[0].failedSteps = ["Lint"];
    conflicting.attempts[0].jobs[0].failedGates = ["lint"];
    expect(() => summarizeReliability([completed, conflicting])).toThrow(/conflict/i);
  });
  test("excludes PR runs while requiring exact repository workflow branch and run identity", async () => {
    const f = fixture([
      run(101, 1, "failure", "pull_request"),
      run(102, 1, "success", "workflow_dispatch"),
    ]);
    expect((await collect(f)).attempts.map((a: { runId: string }) => a.runId)).toEqual(["102"]);
    for (const mutate of [
      (r: ReturnType<typeof run>) => {
        r.workflow_id = 18;
      },
      (r: ReturnType<typeof run>) => {
        r.path = ".github/workflows/fake.yml";
      },
      (r: ReturnType<typeof run>) => {
        r.repository = { ...repo, full_name: "other/proofline" };
      },
      (r: ReturnType<typeof run>) => {
        r.head_repository = { ...repo, full_name: "fork/proofline" };
      },
      (r: ReturnType<typeof run>) => {
        r.head_branch = "other";
      },
      (r: ReturnType<typeof run>) => {
        r.head_sha = "not-a-commit";
      },
    ]) {
      const bad = fixture();
      mutate(bad.runs[0]);
      await expect(collect(bad)).rejects.toThrow();
    }
  });
  test("excludes valid fork PRs named main before applying selected-run origin restrictions", async () => {
    const f = fixture([run(101, 1, "failure", "pull_request"), run(102)]);
    f.runs[0].head_repository = { ...repo, full_name: "fork/proofline" };
    const observation = await collect(f);
    expect(observation.excludedPullRequests).toBe(1);
    expect(observation.runs.map((r: { runId: string }) => r.runId)).toEqual(["102"]);
    expect(observation.attempts.map((a: { runId: string }) => a.runId)).toEqual(["102"]);
    expect(summarizeReliability(observation).sample.firstAttempt.outcomes).toEqual({ success: 1 });
    f.runs[0].event = "push";
    await expect(collect(f)).rejects.toThrow(/identity/);
  });
  test("preserves completed and partial pending terminal facts through later unavailable job snapshots", async () => {
    for (const pending of [false, true]) {
      const f = fixture([run(101, 1, pending ? null : "failure")]);
      if (pending) {
        f.jobs["101/1"][0].status = "completed";
        f.jobs["101/1"][0].conclusion = "failure";
        f.jobs["101/1"][0].completed_at = "2026-11-02T00:04:00Z";
        f.jobs["101/1"][0].steps = jobs(101, 1, "failure")[0].steps;
      }
      const original = await collect(f);
      f.override = (route) =>
        route === "/actions/runs/101/attempts/1/jobs?per_page=100&page=1"
          ? { unavailable: 404 }
          : undefined;
      const unavailable = await collect(f, { observedAt: "2026-11-06T02:00:00Z" });
      const summary = summarizeReliability([original, unavailable]);
      expect(summary.platforms["linux-x64-chromium"].gates.lint).toMatchObject({
        known: 1,
        unknown: 0,
        outcomes: { failure: 1 },
      });
      expect(summary.attempts[0].jobs).toEqual(original.attempts[0].jobs);
      expect(summary.snapshots).toHaveLength(2);
      expect(summary.snapshots[1].attempts[0].availability).toBe("jobs-unavailable");
      expect(summary.snapshots[1].attempts[0].jobs).toEqual([]);
      if (pending) {
        const completedButUnavailable = clone(unavailable);
        completedButUnavailable.observedAt = "2026-11-06T03:00:00Z";
        completedButUnavailable.window.cutoff = completedButUnavailable.observedAt;
        completedButUnavailable.attempts[0].status = "completed";
        completedButUnavailable.attempts[0].conclusion = "failure";
        completedButUnavailable.attempts[0].unknownReasons =
          completedButUnavailable.attempts[0].unknownReasons.filter(
            (reason: string) => reason !== "run-not-completed",
          );
        expect(() => summarizeReliability([original, completedButUnavailable])).toThrow(
          /conflict|unavailable/i,
        );
      }
    }
  });
  test("rejects child timestamps outside run and job intervals in collection and imported summaries while preserving null unknowns", async () => {
    for (const edit of [
      (f: Fixture) => {
        f.jobs["101/1"].forEach((j) => {
          j.started_at = "2026-11-01T00:00:00Z";
          j.completed_at = "2026-11-01T00:04:00Z";
          j.steps = [];
        });
      },
      (f: Fixture) => {
        f.attempts["101/1"] = { ...run(), run_started_at: "2026-11-02T00:01:00Z" };
      },
      (f: Fixture) => {
        f.jobs["101/1"][0].steps[0].started_at = "2026-11-01T23:59:00Z";
      },
      (f: Fixture) => {
        f.jobs["101/1"][0].steps[0].completed_at = "2026-11-02T00:04:01Z";
      },
    ]) {
      const f = fixture();
      edit(f);
      await expect(collect(f)).rejects.toThrow(/timestamp|interval|start|duration/i);
    }
    const original = await collect();
    for (const edit of [
      (v: typeof original) => {
        const a = v.attempts[0];
        a.jobs.forEach((j: (typeof a.jobs)[0]) => {
          j.startedAt = "2026-11-01T00:00:00Z";
          j.completedAt = "2026-11-01T00:04:00Z";
        });
        a.completedAt = "2026-11-01T00:04:00Z";
        a.durationMs = -86160000;
      },
      (v: typeof original) => {
        v.attempts[0].startedAt = "2026-11-02T00:01:00Z";
        v.attempts[0].durationMs = 180000;
      },
      (v: typeof original) => {
        const j = v.attempts[0].jobs[0];
        j.steps[0].startedAt = "2026-11-01T23:59:00Z";
        j.gates[0].startedAt = j.steps[0].startedAt;
      },
      (v: typeof original) => {
        const j = v.attempts[0].jobs[0];
        j.steps[0].completedAt = "2026-11-02T00:04:01Z";
        j.gates[0].completedAt = j.steps[0].completedAt;
      },
    ]) {
      const changed = clone(original);
      edit(changed);
      expect(() => summarizeReliability(changed)).toThrow(/timestamp|interval|start|duration/i);
    }
    const unknown = fixture();
    unknown.attempts["101/1"] = { ...run(), run_started_at: null };
    unknown.runs[0].run_started_at = null;
    unknown.jobs["101/1"].forEach((j) => {
      j.started_at = null;
      j.completed_at = null;
      j.steps.forEach((s) => {
        s.started_at = null;
        s.completed_at = null;
      });
    });
    const unknownObservation = await collect(unknown);
    expect(unknownObservation.attempts[0].durationMs).toBe(null);
    expect(summarizeReliability(unknownObservation).attempts[0].completedAt).toBe(null);
  });
  test("accepts stable endpoint-specific update timestamps without weakening identity state or reread advancement checks", async () => {
    // Actual read-only F observation: list/run 04:59:00, attempt 04:59:01 before and after.
    const f = fixture();
    for (const value of [f.runs[0], f.attempts["101/1"]]) {
      if (!value) throw new Error("Missing fixture run");
      value.created_at = "2026-11-06T04:32:27Z";
      value.run_started_at = "2026-11-06T04:32:27Z";
      value.updated_at = "2026-11-06T04:59:00Z";
    }
    const attempt = f.attempts["101/1"];
    if (!attempt) throw new Error("Missing fixture attempt");
    attempt.updated_at = "2026-11-06T04:59:01Z";
    f.jobs["101/1"].forEach((j) => {
      j.started_at = "2026-11-06T04:32:30Z";
      j.completed_at = "2026-11-06T04:59:00Z";
      j.steps.forEach((s) => {
        s.started_at = j.started_at;
        s.completed_at = j.completed_at;
      });
    });
    f.override = (route) =>
      route.startsWith("/actions/workflows/17/runs?")
        ? { total_count: 1, workflow_runs: f.runs }
        : undefined;
    const collectAt = (value: Fixture) =>
      collect(value, { until: "2026-11-06T17:42:52Z", observedAt: "2026-11-06T17:45:47Z" });
    const observation = await collectAt(f);
    expect(observation.attempts[0].updatedAt).toBe("2026-11-06T04:59:01Z");
    expect(summarizeReliability(observation).sample.firstAttempt.outcomes).toEqual({ success: 1 });
    for (const edit of [
      (v: Fixture) => {
        if (v.attempts["101/1"]) v.attempts["101/1"].head_sha = "b".repeat(40);
      },
      (v: Fixture) => {
        if (v.attempts["101/1"]) v.attempts["101/1"].status = "in_progress";
      },
      (v: Fixture) => {
        if (v.attempts["101/1"]) v.attempts["101/1"].conclusion = "failure";
      },
      (v: Fixture) => {
        const initial = v.override;
        v.override = (route) =>
          route === "/actions/runs/101" ? { ...v.runs[0], run_attempt: 2 } : initial?.(route);
      },
      (v: Fixture) => {
        const initial = v.override;
        v.override = (route) =>
          route === "/actions/runs/101"
            ? { ...v.runs[0], updated_at: "2026-11-06T04:59:02Z" }
            : initial?.(route);
      },
    ]) {
      const changed = clone(f);
      changed.override = f.override;
      edit(changed);
      await expect(collectAt(changed)).rejects.toThrow();
    }
  });
  test("rejects substituted terminal jobs and loss of already observed terminal gate facts", async () => {
    const original = await collect();
    const replacement = clone(original);
    replacement.observedAt = "2026-11-06T02:00:00Z";
    replacement.window.cutoff = replacement.observedAt;
    replacement.attempts[0].jobs[0].jobId = "999999";
    expect(() => summarizeReliability([original, replacement])).toThrow(/conflict|regression/i);
    const pending = await collect(fixture([run(101, 1, null)]));
    pending.attempts[0].jobs[0].gates[0] = clone(original.attempts[0].jobs[0].gates[0]);
    pending.attempts[0].jobs[0].steps[0] = clone(original.attempts[0].jobs[0].steps[0]);
    const regression = clone(pending);
    regression.observedAt = "2026-11-06T02:00:00Z";
    regression.window.cutoff = regression.observedAt;
    regression.attempts[0].jobs[0].gates[0].status = "in_progress";
    regression.attempts[0].jobs[0].gates[0].conclusion = null;
    regression.attempts[0].jobs[0].gates[0].completedAt = null;
    regression.attempts[0].jobs[0].gates[0].durationMs = null;
    regression.attempts[0].jobs[0].steps[0] = {
      ...regression.attempts[0].jobs[0].steps[0],
      status: "in_progress",
      conclusion: null,
      completedAt: null,
      durationMs: null,
    };
    expect(() => summarizeReliability([pending, regression])).toThrow(/conflict|regression/i);
  });
  test("fails closed on malformed imported observations rather than reporting invented healthy denominators", async () => {
    const observation = await collect();
    for (const edit of [
      (v: typeof observation) => {
        v.attempts[0].status = "invented";
      },
      (v: typeof observation) => {
        v.attempts[0].jobs[0].gates[0].conclusion = "invented";
      },
      (v: typeof observation) => {
        v.attempts = [];
      },
      (v: typeof observation) => {
        v.attempts[0].attempt = 2;
      },
      (v: typeof observation) => {
        v.attempts[0].completedAt = "2026-02-30T00:00:00Z";
      },
    ]) {
      const changed = clone(observation);
      edit(changed);
      expect(() => summarizeReliability(changed)).toThrow();
    }
  });
  test("rejects invalid timestamps, contradictory attempt jobs and concurrently advancing runs", async () => {
    for (const mutate of [
      (f: Fixture) => {
        f.runs[0].created_at = "2026-02-30T00:00:00Z";
      },
      (f: Fixture) => {
        f.jobs["101/1"][0].completed_at = "2026-11-01T23:59:59Z";
      },
      (f: Fixture) => {
        f.jobs["101/1"][0].run_attempt = 2;
      },
      (f: Fixture) => {
        f.jobs["101/1"][0].run_id = 102;
      },
      (f: Fixture) => {
        f.jobs["101/1"][0].head_sha = "d".repeat(40);
      },
      (f: Fixture) => {
        f.override = (route) => (route === "/actions/runs/101" ? run(101, 2) : undefined);
      },
    ]) {
      const f = fixture();
      mutate(f);
      await expect(collect(f)).rejects.toThrow();
    }
  });
  test("paginates complete histories and rejects truncation missing pages and conflicting duplicates", async () => {
    const runs = Array.from({ length: 101 }, (_, i) => run(101 + i));
    expect((await collect(fixture(runs))).attempts).toHaveLength(101);
    await expect(collect(fixture(runs), { bounds: { maxPages: 1 } })).rejects.toThrow(
      /bound|page/i,
    );
    for (const bad of [
      { total_count: 1000, workflow_runs: [] },
      { total_count: 2, workflow_runs: [run()] },
      { total_count: 2, workflow_runs: [run(), run(101, 1, "failure")] },
      { total_count: -1, workflow_runs: [] },
    ]) {
      const f = fixture();
      f.override = (route) => (route.startsWith("/actions/workflows/17/runs?") ? bad : undefined);
      await expect(collect(f)).rejects.toThrow();
    }
    const f = fixture();
    f.override = (route) =>
      route.startsWith("/actions/workflows/17/runs?")
        ? { total_count: 2, workflow_runs: [run(), run()] }
        : undefined;
    expect((await collect(f)).duplicateFacts).toBe(1);
    await expect(collect(fixture(), { bounds: { maxRequests: 1 } })).rejects.toThrow(/bound/i);
  });
  test("rejects malformed jobs steps status and unknown metadata rather than silently accepting green", async () => {
    for (const mutate of [
      (f: Fixture) => {
        f.jobs["101/1"][0].name = "verify (invented)";
      },
      (f: Fixture) => {
        f.jobs["101/1"].push(clone(f.jobs["101/1"][0]));
        f.jobs["101/1"][2].conclusion = "failure";
      },
      (f: Fixture) => {
        f.jobs["101/1"][0].steps.push(clone(f.jobs["101/1"][0].steps[0]));
      },
      (f: Fixture) => {
        f.jobs["101/1"][0].status = "invented";
      },
      (f: Fixture) => {
        f.jobs["101/1"][0].conclusion = null;
      },
    ]) {
      const f = fixture();
      mutate(f);
      await expect(collect(f)).rejects.toThrow();
    }
    const empty = summarizeReliability(await collect(fixture([])));
    expect(empty.sample.runs).toBe(0);
    expect(empty.history).toBe("unknown-no-runs");
    expect(empty.limitations).toContain(
      "PR runs are outside this sample; their original outcomes are unchanged.",
    );
  });
  test("requires an explicit bounded window and does not forward API error secrets", async () => {
    for (const extra of [
      { since: "bad" },
      { until: since },
      { until: "2027-11-01T00:00:00Z" },
      { observedAt: since },
      { repository: "acme/../secret" },
      { workflow: "other.yml" },
    ])
      await expect(collect(fixture(), extra)).rejects.toThrow();
    await expect(
      collect(fixture(), {
        api: async () => {
          throw new Error("PRIVATE_TOKEN");
        },
      }),
    ).rejects.toThrow(/API request failed/);
    try {
      await collect(fixture(), {
        api: async () => {
          throw new Error("PRIVATE_TOKEN");
        },
      });
    } catch (e) {
      expect(String(e)).not.toContain("PRIVATE_TOKEN");
    }
  });
  test("writes exclusive immutable observations and readable finite-sample summaries in real temporary directories", async () => {
    const temp = mkdtempSync(path.join(realpathSync(tmpdir()), "proofline-reliability-"));
    temporary.push(temp);
    const output = path.join(temp, "observation");
    const observation = await collect();
    const result = writeReliabilityObservation({ observation, output });
    expect(JSON.parse(readFileSync(result.observationFile, "utf8"))).toMatchObject({
      authority: "supplementary-only",
      repository,
    });
    const readable = readFileSync(result.summaryFile, "utf8");
    expect(readable).toContain("1 runs / 1 attempts");
    expect(readable).toContain(since);
    expect(readable).toContain("PR runs are outside");
    expect(readable).toMatch(/per-test.*unknown/i);
    expect(() => writeReliabilityObservation({ observation, output })).toThrow();
    expect(readdirSync(output).sort()).toEqual(["observation.json", "summary.json", "summary.md"]);
    symlinkSync(temp, path.join(temp, "link"));
    expect(() =>
      writeReliabilityObservation({ observation, output: path.join(temp, "link", "unsafe") }),
    ).toThrow(/symlink/i);
  });
  test("parses only explicit secret-free CLI inputs with no ambient repository or output", () => {
    const argv = [
      "--repository",
      repository,
      "--workflow",
      workflow.path,
      "--since",
      since,
      "--until",
      until,
      "--output",
      "/tmp/observation",
    ];
    expect(parseReliabilityOptions(argv)).toMatchObject({
      repository,
      workflow: workflow.path,
      since,
      until,
      output: "/tmp/observation",
    });
    for (const args of [
      [],
      [...argv, "--token", "secret"],
      [...argv, "--repository", repository],
      ["--repository", "--workflow"],
      [...argv, "--output"],
    ])
      expect(() => parseReliabilityOptions(args)).toThrow();
  });
});

describe("read-only reliability API transport", () => {
  test("uses only fixed-origin allowlisted GET routes without redirects or credential forwarding", async () => {
    const urls: string[] = [];
    const api = createGithubReliabilityApi({
      token: "private-secret",
      fetchImpl: async (url: string, options: RequestInit) => {
        urls.push(url);
        expect(options.method).toBe("GET");
        expect(options.redirect).toBe("error");
        expect(new Headers(options.headers).get("authorization")).toBe("Bearer private-secret");
        return new Response(JSON.stringify(repo));
      },
    });
    expect(await api(repository, "")).toMatchObject({ full_name: repository });
    expect(urls).toEqual(["https://api.github.com/repos/acme/proofline"]);
    for (const route of [
      "https://evil.invalid",
      "/actions/runs/101/rerun",
      "/actions/runs/101/artifacts",
      "/actions/workflows/17/runs?status=success",
      "/actions/runs/101/attempts/1/jobs?per_page=100&page=10000",
    ])
      await expect(api(repository, route)).rejects.toThrow();
  });
  test("distinguishes unavailable attempt metadata from fatal API and bounded body failures", async () => {
    const api = createGithubReliabilityApi({
      token: "secret",
      fetchImpl: async () => new Response("secret", { status: 404 }),
    });
    expect(await api(repository, "/actions/runs/101/attempts/1")).toEqual({ unavailable: 404 });
    await expect(api(repository, "")).rejects.toThrow(/HTTP 404/);
    for (const fetchImpl of [
      async () => new Response("secret", { status: 403 }),
      async () => {
        throw new Error("secret");
      },
      async () => new Response("{secret"),
      async () => new Response("x".repeat(100)),
    ]) {
      const limited = createGithubReliabilityApi({ token: "secret", fetchImpl, maxJsonBytes: 50 });
      try {
        await limited(repository, "");
        expect.fail("must reject unsafe response");
      } catch (error) {
        expect(String(error)).toMatch(/GitHub reliability/);
        expect(String(error)).not.toContain("secret");
      }
    }
  });
  test("sanitizes hostile response accessors and enforces request deadlines and complete response lengths", async () => {
    const secret = "PRIVATE_ACCESSOR_SECRET";
    const hostile = createGithubReliabilityApi({
      token: secret,
      fetchImpl: async () => ({
        get status() {
          throw new Error(secret);
        },
      }),
    });
    try {
      await hostile(repository, "");
      expect.fail("must reject hostile response");
    } catch (e) {
      expect(String(e)).toMatch(/GitHub reliability/);
      expect(String(e)).not.toContain(secret);
    }
    const stalled = createGithubReliabilityApi({
      token: secret,
      timeoutMs: 1,
      fetchImpl: async () => new Promise(() => {}),
    });
    await expect(stalled(repository, "")).rejects.toThrow(/timed out/);
    const incomplete = createGithubReliabilityApi({
      token: secret,
      fetchImpl: async () => new Response("{}", { headers: { "content-length": "10" } }),
    });
    await expect(incomplete(repository, "")).rejects.toThrow(/incomplete/);
    const redirect = createGithubReliabilityApi({
      token: secret,
      fetchImpl: async () =>
        new Response(null, { status: 302, headers: { location: "https://evil.invalid" } }),
    });
    await expect(redirect(repository, "")).rejects.toThrow(/HTTP 302/);
  });
});

describe("trusted reliability workflow controls", () => {
  const event = () => ({ repository: repo, workflow_run: { ...run(), status: "completed" } });
  test("accepts canonical completion only by exact identity path repository push and actual default branch", () => {
    expect(
      authorizeReliabilityTrigger({
        eventName: "workflow_run",
        event: event(),
        repository,
        repositoryMetadata: repo,
        workflowMetadata: workflow,
      }),
    ).toBe(true);
    for (const mutate of [
      (e: ReturnType<typeof event>) => {
        e.workflow_run.workflow_id = 18;
      },
      (e: ReturnType<typeof event>) => {
        e.workflow_run.path = ".github/workflows/fake.yml";
      },
      (e: ReturnType<typeof event>) => {
        e.workflow_run.event = "pull_request";
      },
      (e: ReturnType<typeof event>) => {
        e.workflow_run.head_repository = { ...repo, full_name: "fork/proofline" };
      },
      (e: ReturnType<typeof event>) => {
        e.workflow_run.head_branch = "main; echo poison";
      },
      (e: ReturnType<typeof event>) => {
        e.repository = { ...repo, full_name: "fork/proofline" };
      },
    ]) {
      const e = event();
      mutate(e);
      expect(
        authorizeReliabilityTrigger({
          eventName: "workflow_run",
          event: e,
          repository,
          repositoryMetadata: repo,
          workflowMetadata: workflow,
        }),
      ).toBe(false);
    }
    expect(
      authorizeReliabilityTrigger({
        eventName: "pull_request",
        event: event(),
        repository,
        repositoryMetadata: repo,
        workflowMetadata: workflow,
      }),
    ).toBe(false);
  });
  test("orchestrates only approved triggers into immutable output using trusted metadata and fixed bounded window", async () => {
    const temp = mkdtempSync(path.join(realpathSync(tmpdir()), "proofline-reliability-trigger-"));
    temporary.push(temp);
    const f = fixture();
    f.override = (route) =>
      route.startsWith("/actions/workflows/17/runs?")
        ? { total_count: 1, workflow_runs: f.runs }
        : undefined;
    const api = offline(f);
    const badEvent = event();
    badEvent.workflow_run.workflow_id = 999;
    expect(
      await collectReliabilityForTrigger({
        eventName: "workflow_run",
        event: badEvent,
        repository,
        api,
        output: path.join(temp, "skipped"),
        now: observedAt,
      }),
    ).toEqual({ collected: false });
    expect(readdirSync(temp)).toEqual([]);
    const output = path.join(temp, "collected");
    expect(
      await collectReliabilityForTrigger({
        eventName: "workflow_run",
        event: event(),
        repository,
        api,
        output,
        now: observedAt,
      }),
    ).toMatchObject({ collected: true });
    const observation = JSON.parse(readFileSync(path.join(output, "observation.json"), "utf8"));
    expect(observation.window).toMatchObject({ since: "2026-10-07T01:00:00Z", until: observedAt });
    await expect(
      collectReliabilityForTrigger({
        eventName: "workflow_run",
        event: event(),
        repository,
        api: async () => {
          throw new Error("PRIVATE_SECRET");
        },
        output: path.join(temp, "failed"),
        now: observedAt,
      }),
    ).rejects.toThrow("Reliability trigger metadata API request failed");
  });
  test("workflow uses pinned read-only trusted checkout and exports unique artifacts without executing event head", () => {
    const require = createRequire(import.meta.url);
    const yaml = createRequire(require.resolve("nx/package.json"))("yaml");
    const source = readFileSync(
      new URL("../../../.github/workflows/reliability.yml", import.meta.url),
      "utf8",
    );
    const value = yaml.parse(source);
    expect(value.permissions).toEqual({ contents: "read", actions: "read" });
    expect(value.on.workflow_run).toMatchObject({
      workflows: ["Verify Proofline regression harness"],
      types: ["completed"],
    });
    expect(value.on.schedule).toHaveLength(1);
    const steps = value.jobs.collect.steps;
    expect(value.jobs.collect.permissions).toBeUndefined();
    const checkout = steps.find((s: { uses?: string }) => s.uses?.startsWith("actions/checkout@"));
    expect(checkout.with.ref).toBe(`\${{ github.event.repository.default_branch }}`);
    expect(checkout.with["persist-credentials"]).toBe(false);
    for (const step of steps.filter((s: { uses?: string }) => s.uses))
      expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
    const collectStep = steps.find((s: { id?: string }) => s.id === "collect");
    expect(collectStep.run).toContain("collectReliabilityForTrigger");
    expect(collectStep["continue-on-error"]).toBeUndefined();
    expect(collectStep.run).not.toContain("${{");
    expect(source).not.toMatch(
      /download-artifact|workflow_run.head_sha|permissions:\s*write-all|pull_request_target/,
    );
    const upload = steps.find((s: { uses?: string }) =>
      s.uses?.startsWith("actions/upload-artifact@"),
    );
    expect(upload.with.name).toContain(`\${{ github.run_id }}-\${{ github.run_attempt }}`);
    expect(upload.with["if-no-files-found"]).toBe("error");
    expect(upload.with["retention-days"]).toBe(90);
    expect(
      steps.some(
        (s: { if?: string; run?: string }) =>
          s.if === `\${{ failure() }}` && s.run?.includes("collection failed"),
      ),
    ).toBe(true);
  });
});

function legacyJob(runId = 101, attempt = 1, conclusion = "failure") {
  return {
    ...jobs(runId, attempt, conclusion)[0],
    name: "verify",
    workflow_name: "Verify CRM regression harness",
    steps: [
      {
        name: "Lint",
        number: 1,
        status: "completed",
        conclusion,
        started_at: "2026-11-02T00:00:00Z",
        completed_at: "2026-11-02T00:01:00Z",
      },
      {
        name: "Legacy detail [untrusted](https://example.invalid)",
        number: 2,
        status: "completed",
        conclusion: "success",
        started_at: "2026-11-02T00:01:00Z",
        completed_at: "2026-11-02T00:04:00Z",
      },
    ],
  };
}
function legacyHistory() {
  const value = fixture([run(101, 1, "failure")]);
  value.runs[0].name = "Verify CRM regression harness";
  const attempt = value.attempts["101/1"];
  if (!attempt) throw new Error("Missing legacy fixture attempt");
  attempt.name = "Verify CRM regression harness";
  value.jobs["101/1"] = [legacyJob()];
  return value;
}

describe("unmapped historical canonical verification", () => {
  test("retains a sole legacy failure beside a current pass with unknown platforms and gates and unchanged legacy-free archives", async () => {
    const value = legacyHistory();
    value.runs.push(run(102));
    value.attempts["102/1"] = run(102);
    value.jobs["102/1"] = jobs(102);
    const observation = await collect(value);
    expect(observation.schemaVersion).toBe(1);
    expect(
      observation.attempts.map((a: { runId: string; conclusion: string }) => [
        a.runId,
        a.conclusion,
      ]),
    ).toEqual([
      ["101", "failure"],
      ["102", "success"],
    ]);
    const legacy = observation.attempts[0].jobs[0];
    expect(legacy).toMatchObject({
      jobId: "101010",
      runId: "101",
      attempt: 1,
      name: "verify",
      platform: null,
      status: "completed",
      conclusion: "failure",
      startedAt: "2026-11-02T00:00:00Z",
      completedAt: "2026-11-02T00:04:00Z",
      durationMs: 240000,
      failedSteps: ["Lint"],
      failedGates: [],
    });
    expect(legacy.steps).toEqual([
      {
        name: "Lint",
        number: 1,
        status: "completed",
        conclusion: "failure",
        startedAt: "2026-11-02T00:00:00Z",
        completedAt: "2026-11-02T00:01:00Z",
        durationMs: 60000,
      },
      {
        name: "Legacy detail [untrusted](https://example.invalid)",
        number: 2,
        status: "completed",
        conclusion: "success",
        startedAt: "2026-11-02T00:01:00Z",
        completedAt: "2026-11-02T00:04:00Z",
        durationMs: 180000,
      },
    ]);
    expect(
      legacy.gates.map((g: { key: string; status: string; conclusion: string | null }) => [
        g.key,
        g.status,
        g.conclusion,
      ]),
    ).toEqual(gates.map(([key]) => [key, "unknown", null]));
    expect(observation.attempts[0].unknownReasons).toEqual([
      "unclassified-legacy-job:101010",
      "missing-platform:linux-x64-chromium",
      "missing-platform:darwin-arm64-chromium",
    ]);
    const summary = summarizeReliability(observation);
    expect(summary.sample).toMatchObject({
      runs: 2,
      attempts: 2,
      firstAttempt: { total: 2, known: 2, unknown: 0, outcomes: { failure: 1, success: 1 } },
      retry: { total: 0, known: 0, unknown: 0, outcomes: {} },
    });
    expect(summary.unclassifiedLegacyJobs).toBe(1);
    for (const platform of ["linux-x64-chromium", "darwin-arm64-chromium"]) {
      expect(summary.platforms[platform]).toMatchObject({
        jobs: 1,
        missing: 1,
        outcomes: { success: 1 },
      });
      for (const counts of Object.values(summary.platforms[platform].gates))
        expect(counts).toEqual({ total: 2, known: 1, unknown: 1, outcomes: { success: 1 } });
    }
    const temporaryRoot = mkdtempSync(
      path.join(realpathSync(tmpdir()), "proofline-legacy-history-"),
    );
    temporary.push(temporaryRoot);
    const result = writeReliabilityObservation({
      observation,
      output: path.join(temporaryRoot, "legacy"),
    });
    expect(readFileSync(result.summaryFile, "utf8")).toContain(
      "Unclassified legacy jobs: 1. Current platforms and gates are unknown for these jobs.",
    );
    expect(readFileSync(result.summaryFile, "utf8")).not.toContain("Legacy detail [untrusted]");
    const archivedObservationBytes = readFileSync(
      new URL(
        "../../../docs/verification/2026-11-06-reliability/observation.json.txt",
        import.meta.url,
      ),
      "utf8",
    );
    const archivedSummaryBytes = readFileSync(
      new URL(
        "../../../docs/verification/2026-11-06-reliability/summary.json.txt",
        import.meta.url,
      ),
      "utf8",
    );
    const archivedReadableBytes = readFileSync(
      new URL("../../../docs/verification/2026-11-06-reliability/summary.md", import.meta.url),
      "utf8",
    );
    const archivedObservation = JSON.parse(archivedObservationBytes);
    expect(summarizeReliability(archivedObservation)).toEqual(JSON.parse(archivedSummaryBytes));
    expect(summarizeReliability(archivedObservation)).not.toHaveProperty("unclassifiedLegacyJobs");
    const archivedResult = writeReliabilityObservation({
      observation: archivedObservation,
      output: path.join(temporaryRoot, "legacy-free-archive"),
    });
    expect(readFileSync(archivedResult.observationFile, "utf8")).toBe(archivedObservationBytes);
    expect(
      readFileSync(path.join(temporaryRoot, "legacy-free-archive", "summary.json"), "utf8"),
    ).toBe(archivedSummaryBytes);
    expect(readFileSync(archivedResult.summaryFile, "utf8")).toBe(archivedReadableBytes);
  });

  test("preserves legacy retries duplicate identities unavailable snapshots and terminal job and step facts", async () => {
    const value = legacyHistory();
    value.runs[0] = run(101, 2);
    value.attempts["101/2"] = run(101, 2);
    value.jobs["101/1"].push(clone(value.jobs["101/1"][0]));
    value.jobs["101/2"] = [legacyJob(101, 2, "success")];
    const observation = await collect(value);
    expect(observation.duplicateFacts).toBe(1);
    expect(
      observation.attempts.map((a: { attempt: number; conclusion: string; jobs: unknown[] }) => [
        a.attempt,
        a.conclusion,
        a.jobs.length,
      ]),
    ).toEqual([
      [1, "failure", 1],
      [2, "success", 1],
    ]);
    value.override = (route) => (route.includes("/jobs?") ? { unavailable: 404 } : undefined);
    const unavailable = await collect(value, { observedAt: "2026-11-06T02:00:00Z" });
    const summary = summarizeReliability([observation, clone(observation), unavailable]);
    expect(summary.sample).toMatchObject({
      observations: 2,
      duplicateObservations: 1,
      runs: 1,
      attempts: 2,
      firstAttempt: { total: 1, known: 1, unknown: 0, outcomes: { failure: 1 } },
      retry: { total: 1, known: 1, unknown: 0, outcomes: { success: 1 } },
    });
    expect(summary.unclassifiedLegacyJobs).toBe(2);
    expect(summary.attempts.map((a: { jobs: unknown[] }) => a.jobs)).toEqual(
      observation.attempts.map((a: { jobs: unknown[] }) => a.jobs),
    );
    expect(summary.snapshots[1].attempts[0].availability).toBe("jobs-unavailable");
    for (const counts of Object.values(summary.platforms["linux-x64-chromium"].gates))
      expect(counts).toEqual({ total: 2, known: 0, unknown: 2, outcomes: {} });
    const partial = legacyHistory();
    partial.runs[0] = run(101, 1, null);
    partial.attempts["101/1"] = run(101, 1, null);
    partial.jobs["101/1"][0].status = "in_progress";
    partial.jobs["101/1"][0].conclusion = null;
    partial.jobs["101/1"][0].completed_at = null;
    const partialObservation = await collect(partial);
    const remappedPartial = clone(partialObservation);
    remappedPartial.observedAt = "2026-11-06T02:00:00Z";
    remappedPartial.window.cutoff = remappedPartial.observedAt;
    const remappedJob = remappedPartial.attempts[0].jobs[0];
    remappedJob.name = "verify (linux-x64-chromium)";
    remappedJob.platform = "linux-x64-chromium";
    remappedJob.gates[0] = { key: "lint", ...remappedJob.steps[0] };
    remappedJob.failedGates = ["lint"];
    remappedPartial.attempts[0].unknownReasons = [
      ...gates
        .filter(([key]) => key !== "lint")
        .map(([key]) => `missing-gate:linux-x64-chromium:${key}`),
      "missing-platform:darwin-arm64-chromium",
      "run-not-completed",
    ];
    expect(() => summarizeReliability(remappedPartial)).not.toThrow();
    expect(() => summarizeReliability([partialObservation, remappedPartial])).toThrow(
      /conflict|regression/i,
    );
    for (const edit of [
      (v: typeof observation) => {
        v.attempts[0].jobs[0].conclusion = "success";
      },
      (v: typeof observation) => {
        v.attempts[0].jobs[0].steps[0].conclusion = "success";
        v.attempts[0].jobs[0].failedSteps = [];
      },
      (v: typeof observation) => {
        v.attempts[0].jobs[0].steps.pop();
      },
      (v: typeof observation) => {
        const a = v.attempts[0];
        const j = a.jobs[0];
        j.name = "verify (linux-x64-chromium)";
        j.platform = "linux-x64-chromium";
        j.gates[0] = { key: "lint", ...j.steps[0] };
        j.failedGates = ["lint"];
        a.unknownReasons = [
          ...gates
            .filter(([key]) => key !== "lint")
            .map(([key]) => `missing-gate:linux-x64-chromium:${key}`),
          "missing-platform:darwin-arm64-chromium",
        ];
      },
      (v: typeof observation) => {
        const a = v.attempts[0];
        a.jobs = [];
        a.completedAt = null;
        a.durationMs = null;
        a.completionBasis = "unknown";
        a.unknownReasons = [
          "missing-platform:linux-x64-chromium",
          "missing-platform:darwin-arm64-chromium",
        ];
      },
    ]) {
      const changed = clone(observation);
      changed.observedAt = "2026-11-06T03:00:00Z";
      changed.window.cutoff = changed.observedAt;
      edit(changed);
      expect(() => summarizeReliability(changed)).not.toThrow();
      expect(() => summarizeReliability([observation, changed])).toThrow(/conflict|regression/i);
    }
  });

  test("rejects malformed forged mixed and multiple legacy contracts while preserving source attempt name and interval guards", async () => {
    const observation = await collect(legacyHistory());
    expect(observation.attempts[0].jobs[0].platform).toBe(null);
    for (const edit of [
      (v: Fixture) => {
        v.jobs["101/1"].push(jobs()[1]);
      },
      (v: Fixture) => {
        const extra = clone(v.jobs["101/1"][0]);
        extra.id++;
        v.jobs["101/1"].push(extra);
      },
      (v: Fixture) => {
        v.jobs["101/1"][0].name = "verify (invented)";
      },
      (v: Fixture) => {
        v.jobs["101/1"][0].name = "verify ";
      },
      (v: Fixture) => {
        const extra = clone(v.jobs["101/1"][0]);
        extra.conclusion = "success";
        v.jobs["101/1"].push(extra);
      },
      (v: Fixture) => {
        v.jobs["101/1"][0].id = 0;
      },
      (v: Fixture) => {
        v.jobs["101/1"][0].run_id = 102;
      },
      (v: Fixture) => {
        v.jobs["101/1"][0].run_attempt = 2;
      },
      (v: Fixture) => {
        v.jobs["101/1"][0].head_sha = "b".repeat(40);
      },
      (v: Fixture) => {
        v.jobs["101/1"][0].started_at = "2026-11-01T23:59:59Z";
      },
      (v: Fixture) => {
        v.jobs["101/1"][0].steps[0].completed_at = "2026-11-02T00:04:01Z";
      },
      (v: Fixture) => {
        v.jobs["101/1"][0].conclusion = null;
      },
      (v: Fixture) => {
        v.jobs["101/1"][0].steps.push(clone(v.jobs["101/1"][0].steps[0]));
      },
      (v: Fixture) => {
        v.runs[0].workflow_id = 18;
      },
      (v: Fixture) => {
        v.runs[0].repository = { ...repo, full_name: "wrong/proofline" };
      },
      (v: Fixture) => {
        const attempt = v.attempts["101/1"];
        if (attempt) attempt.head_sha = "c".repeat(40);
      },
    ]) {
      const malformed = legacyHistory();
      edit(malformed);
      await expect(collect(malformed)).rejects.toThrow();
    }
    const current = await collect();
    for (const edit of [
      (v: typeof observation) => {
        v.attempts[0].jobs[0].platform = "linux-x64-chromium";
      },
      (v: typeof observation) => {
        v.attempts[0].jobs[0].gates[0] = clone(current.attempts[0].jobs[0].gates[0]);
      },
      (v: typeof observation) => {
        v.attempts[0].unknownReasons = [
          "missing-platform:linux-x64-chromium",
          "missing-platform:darwin-arm64-chromium",
        ];
      },
      (v: typeof observation) => {
        v.attempts[0].jobs.push(clone(current.attempts[0].jobs[1]));
      },
      (v: typeof observation) => {
        v.attempts[0].jobs[0].name = "verify (invented)";
      },
      (v: typeof observation) => {
        v.attempts[0].jobs[0].runId = "102";
      },
      (v: typeof observation) => {
        v.attempts[0].jobs[0].attempt = 2;
      },
      (v: typeof observation) => {
        v.attempts[0].sourceCommit = "b".repeat(40);
      },
      (v: typeof observation) => {
        v.attempts[0].jobs[0].steps[0].startedAt = "2026-11-01T23:59:59Z";
      },
    ]) {
      const forged = clone(observation);
      edit(forged);
      expect(() => summarizeReliability(forged)).toThrow();
    }
  });
});
