import { describe, expect, test } from "vitest";
// @ts-expect-error Portable JavaScript entrypoint.
import { assessReleaseRecovery } from "../release-recovery.mjs";

const sourceCommit = "a".repeat(40);
const repository = "acme/proofline";
const workflow = { id: 9, path: ".github/workflows/verify.yml" };
const run = {
  id: 123,
  run_attempt: 1,
  repository: { full_name: repository },
  head_sha: sourceCommit,
  path: workflow.path,
  workflow_id: workflow.id,
  event: "push",
  head_branch: "main",
  status: "completed",
  conclusion: "success",
};
const artifact = {
  id: 456,
  name: `proofline-release-${sourceCommit}-123-1`,
  expired: false,
  expires_at: "2026-11-19T00:00:00Z",
  digest: `sha256:${"b".repeat(64)}`,
  workflow_run: { id: 123, head_sha: sourceCommit, head_branch: "main" },
};
const observation = {
  repository,
  sourceCommit,
  workflow,
  runs: [run],
  artifacts: [artifact],
  now: new Date("2026-11-05T00:00:00Z"),
};
describe("deterministic release evidence recovery", () => {
  test("rejects expired evidence and recommends rerunning all jobs of the original trusted run", () => {
    const result = assessReleaseRecovery({ ...observation, now: new Date("2026-11-20T00:00:00Z") });
    expect(result).toMatchObject({
      state: "evidence-expired",
      deployable: false,
      action: "rerun-original-all-jobs",
      runId: "123",
    });
    expect(assessReleaseRecovery(observation).state).toBe("eligible");
  });
  test("accepts only complete newer original attempts with fresh exact-attempt artifacts", () => {
    const next = { ...run, run_attempt: 2 };
    const fresh = { ...artifact, id: 457, name: `proofline-release-${sourceCommit}-123-2` };
    expect(
      assessReleaseRecovery({ ...observation, runs: [next], artifacts: [fresh] }),
    ).toMatchObject({
      state: "eligible",
      runAttempt: "2",
      deployable: false,
      action: "verify-immutable-artifact",
    });
    expect(assessReleaseRecovery({ ...observation, runs: [next] })).toMatchObject({
      state: "evidence-missing",
      deployable: false,
    });
    for (const status of ["queued", "in_progress"])
      expect(
        assessReleaseRecovery({ ...observation, runs: [{ ...next, status }], artifacts: [fresh] })
          .state,
      ).toBe("run-incomplete");
    expect(
      assessReleaseRecovery({
        ...observation,
        runs: [{ ...next, conclusion: "failure" }],
        artifacts: [fresh],
      }).state,
    ).toBe("run-failed");
  });
  test("requires an injected observation clock rather than ambient time", () => {
    const { now: _now, ...withoutClock } = observation;
    expect(assessReleaseRecovery(withoutClock)).toMatchObject({
      state: "unavailable",
      deployable: false,
    });
  });
  test("never substitutes dispatch PR fork failed or ambiguous authority", () => {
    for (const replacement of [
      { ...run, event: "workflow_dispatch" },
      { ...run, event: "pull_request" },
      { ...run, repository: { full_name: "fork/proofline" } },
    ])
      expect(assessReleaseRecovery({ ...observation, runs: [replacement] })).toMatchObject({
        state: "unavailable",
        deployable: false,
      });
    expect(assessReleaseRecovery({ ...observation, runs: [run, { ...run, id: 124 }] }).state).toBe(
      "ambiguous-authority",
    );
    expect(assessReleaseRecovery({ ...observation, artifacts: [artifact, artifact] }).state).toBe(
      "ambiguous-authority",
    );
    expect(
      assessReleaseRecovery({ ...observation, artifacts: [{ ...artifact, digest: "missing" }] })
        .state,
    ).toBe("unavailable");
    expect(assessReleaseRecovery({ ...observation, artifacts: [] }).state).toBe("evidence-missing");
    expect(assessReleaseRecovery({ ...observation, runs: null }).state).toBe("unavailable");
    expect(assessReleaseRecovery({ ...observation, now: new Date("invalid") }).state).toBe(
      "unavailable",
    );
  });
});
