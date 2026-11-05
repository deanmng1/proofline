import { selectTrustedVerification } from "./release-verify.mjs";

// API eligibility is only permission to perform full verification, never deployment authority.
// This pure assessor cannot rerun jobs, edit metadata, create receipts or deploy directories.
export function assessReleaseRecovery({
  repository,
  sourceCommit,
  workflow,
  runs,
  artifacts,
  now,
} = {}) {
  const result = (state, action, run) => ({
    state,
    action,
    deployable: false,
    ...(run ? { runId: String(run.id), runAttempt: String(run.run_attempt) } : {}),
  });
  if (
    !Array.isArray(runs) ||
    !Array.isArray(artifacts) ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    workflow?.path !== ".github/workflows/verify.yml" ||
    !Number.isSafeInteger(workflow.id) ||
    !/^[a-f0-9]{40}$/.test(sourceCommit)
  )
    return result("unavailable", "inspect-trusted-authority");
  const trusted = runs.filter(
    (run) =>
      run?.repository?.full_name === repository &&
      run.head_sha === sourceCommit &&
      run.path === workflow.path &&
      run.workflow_id === workflow.id &&
      run.event === "push" &&
      run.head_branch === "main" &&
      Number.isSafeInteger(run.id) &&
      run.id > 0 &&
      Number.isSafeInteger(run.run_attempt) &&
      run.run_attempt > 0,
  );
  if (trusted.length > 1) return result("ambiguous-authority", "inspect-trusted-authority");
  if (trusted.length !== 1) return result("unavailable", "inspect-trusted-authority");
  const run = trusted[0];
  if (run.status !== "completed") return result("run-incomplete", "wait-for-original-run", run);
  if (run.conclusion !== "success")
    return result("run-failed", "review-failure-before-original-rerun", run);
  const candidates = artifacts.filter(
    (artifact) =>
      artifact?.name === `proofline-release-${sourceCommit}-${run.id}-${run.run_attempt}`,
  );
  if (candidates.length > 1) return result("ambiguous-authority", "inspect-trusted-authority", run);
  if (candidates.length === 0) return result("evidence-missing", "rerun-original-all-jobs", run);
  if (
    candidates[0].expired === true ||
    (Number.isFinite(Date.parse(candidates[0].expires_at)) &&
      Date.parse(candidates[0].expires_at) <= now.getTime())
  )
    return result("evidence-expired", "rerun-original-all-jobs", run);
  try {
    selectTrustedVerification({ repository, sourceCommit, workflow, runs, artifacts, now });
  } catch {
    return result("unavailable", "inspect-trusted-authority", run);
  }
  return result("eligible", "verify-immutable-artifact", run);
}
