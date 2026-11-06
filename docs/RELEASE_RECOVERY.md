# Release evidence recovery

The owner is [@deanmng1](https://github.com/deanmng1), maintainer of [deanmng1/proofline](https://github.com/deanmng1/proofline). Preview support and incident handling are best-effort, with no response, recovery or maintenance SLA. This runbook does not publish a release, enable remote settings or authorize deployment. Live staging is explicitly pending.

## Preserve and assess

Record the immutable source/tag resolution, canonical workflow run ID, attempt, artifact ID, digest and expiry, together with the exact failed command and sanitized logs. Preserve earlier failed artifacts. Never share tokens, one-time launch capabilities or customer data.

Release authority is an unambiguous successful **same-repository push/main** `.github/workflows/verify.yml` run for the exact source, its current attempt-named unexpired artifact, and hash-verified native/portability contents. PR, dispatch, matrix-only, local or fixture receipts cannot substitute. The workflow retains artifacts for **14 days**; availability can end earlier. A hosted-proof receipt supplements authority and is valid only for its recorded observation; it does not guarantee future eligibility.

The pure `tools/proofline/release-recovery.mjs` assessor and deterministic fixtures describe safe actions without rerunning jobs or changing remote state. Use the actual API-backed `tools/proofline/hosted-proof.mjs` verifier for a new hosted observation; inspect its CLI options in the checked-out immutable source. Keep its output outside the inventoried artifact and never overwrite a prior receipt. Offline/injected transport remains fixture evidence.

## Choose the safe recovery

| Observation | Action |
| --- | --- |
| Missing, expired or unavailable artifact | Stop release/deployment. Do not rebuild source and relabel the output as the old artifact. |
| Original trusted push/main run can be rerun | Maintainer reruns **all jobs** for that exact original run, waits for every required job, then resolves/verifies the new attempt and artifact. |
| Original run cannot be rerun | Create a reviewed new source commit and complete the normal push/main verification and release process for it. |
| Stale attempt, ambiguous runs, moved tag or changed run/artifact/digest after download | Reject the evidence. Investigate using retained API/native observations; resolve again only when authority is unambiguous. |
| Dispatch-only or PR success | Complete the normal trusted push/main process; do not promote that evidence. |
| Inventory, native required-test or ZIP verification failure | Stop and fix the underlying source/workflow problem through review and full verification. Never alter digests, dates or summaries to bypass rejection. |

A GitHub rerun preserves the original commit/ref and increments the attempt. Reverify the current run/attempt/artifact after download; a previously selected artifact is insufficient when authority changes. See GitHub's [rerun instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs) and [run identity variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables).

## Deployment boundary

The prepared staging workflow consumes the same verified immutable artifact with pinned prebuilt deployment and requires configured preview credentials. Local workflow tests prove preparation only. The user left live staging pending; do not invoke it or request credentials as part of this increment. A future live result must identify provider/project/source and verify deployed artifact identity. Stable production deployment requires its separately authorized trusted release path; prerelease publication must not automatically deploy production.

At readiness reconnaissance, main was unprotected, private vulnerability reporting was disabled, and deployment secrets were absent. These are observed remote settings, not promises that a checked-in file enables controls. Recheck them before a future operational change; do not change them implicitly. Potential security failures follow the [security reporting route](../.github/SECURITY.md).
