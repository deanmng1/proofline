# Hosted bootstrap verification sequence

Execution is pending. This is the independently reviewed operational plan; actual run and artifact results must be recorded separately.

Remote main `f4f10c727edd2622182b93131f1eb7c31553f411` is an ancestor of the reviewed local foundation `024aa838ade882fdcca46e63a4ae665569c16fd0` and current source. It predates `proofline.harness.json`. The real record preflight rejects comparison against that absent manifest. The strict resolver, historical metadata checks and release policy remain unchanged.

The foundation differs from the previously verified implementation `b368d85` only in documentation and appended evidence, and its earlier independent review/full-gate results are retained. Publishing a branch does not make it a successful hosted run.

1. After local verification and source review, publish the pinned foundation as `codex/readiness-foundation` and the reviewed candidate on a separate `codex/` branch. Open a candidate PR targeting that foundation. Its actual base/head must remain pinned to the intended source. Require the entire canonical workflow, including both complete compatibility cells, to succeed. Recheck actual refs, head, run attempt and check conclusions before advancing main.
2. Fast-forward main normally to that exact checked candidate. Do not merge/rebase the foundation PR into a different unchecked head. No force push or remote settings change is permitted. The first main migration still compares the pre-harness `push.before` commit with the candidate; retain its missing-manifest failure and diagnostics. This run is release-ineligible. A rerun or multiple commits in one push cannot change the original event base.
3. Wait for and preserve the first migration run's actual conclusion. Append a documentation/evidence-only observation identifying the actual source, base, run and failure. Open its **own** `codex/` PR targeting the now-bootstrapped main. Require both full compatibility cells and independent source review before advancing main again.
4. Advance main normally to the checked observation successor. Require the complete new main workflow and both cells to pass at that exact source, then verify its unambiguous eligible artifact through the bounded authenticated API transport, archive digest, inventory and native/portability validators. Only this successful push/main run can supply release authority. PR, foundation, fixture, dispatch and first-failed-migration artifacts remain ineligible.

This handles a first-adoption baseline without changing comparison authority or converting a rejected result into success. Any unrelated hosted failure requires an ordinary tested/reviewed repair and affected gate reruns. All source/ref/run relationships and failed attempts remain visible.

The user authorized reviewed-source publication for the hosted PR/main milestone. This sequence does not authorize tags/releases, protection/reporting settings, Vercel or production deployment. Live staging remains pending by explicit user choice.
