# Proofline Enterprise Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development with the user's explicit parallel execution instruction. Steps use checkbox syntax for tracking. Tasks 1–2 share an implementer; Tasks 3–4 run independently. Controller serializes shared integration and commits.

**Goal:** Ensure required tests actually pass, preserve every failure, deploy only verified artifacts, and prove the core on another app.

**Architecture:** Reconcile native test reports with pre-execution required identities and retain unique invocation evidence. Publish source-bound release bundles after complete verification, and validate the reusable core in an unrelated standalone React/Vite repository.

**Tech Stack:** Node 24, TypeScript, Vitest, Playwright, Vite/React, JSON/JSONL, GitHub Actions and Vercel Build Output.

**Spec:** `docs/superpowers/specs/2026-11-04-enterprise-verification-design.md`

## Global Constraints

- Work directly on main; no push or deployment.
- CI test execution must never call an LLM or agent.
- Never contact live providers from tests; preserve all egress guards and production-negative boundaries.
- Required metadata/results fail closed. Do not lower existing coverage baselines or rewrite committed execution-record bytes.
- Write failing behavior tests before implementation; retain red/green command/output evidence.
- Independent spec-compliance and code-quality review for every task, plus a final whole-change review.
- Controller owns root manifest, rules/catalog, baseline, authored JSONL, shared docs and commits. Workers edit only assigned files and report integration requests.
- Preserve existing .codex/ and presentation assets. Node executable: `/Users/dio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`.

## Review Focus

- A discovered required test that runtime-skips, expects failure or vanishes must fail runtime reconciliation.
- Applicability must precede results; full, focused, subset, shard and explicitly empty targets cannot silently omit required evidence.
- A successful later command must leave every earlier failed command's artifacts unchanged.
- Release input must bind exact trusted repository/workflow/SHA/run/attempt/artifact digest, with no untrusted verifier or rebuild.
- Second-app validation must copy unchanged reusable core into a standalone target, with no CRM imports or disabled guard.

### Task 1: Verify required runtime outcomes and portable execution

**Files:** Modify `tools/proofline/canonical-runner.mjs`, `tools/impact/src/main.ts`, `tools/impact/src/harness-manifest.ts`; create focused execution-report/verification helpers under `tools/proofline/`; test in `tools/proofline/src/required-execution.test.ts` and relevant impact tests. Task 2 files are shared with this implementer. Root integration supplies execution metadata and rule bindings.

**Interfaces:** Consume optional manifest `execution` shape defined in spec; canonical execution requires it. Produce per-invocation native results and versioned verification JSON containing runner/sourceCommit/session/gate/run-attempt/scope/argv/cwd/exitCode/outcome/expected/observed/errors and aggregate-to-child references, plus generated execution index. Export a pure report reconciler for deterministic tests and release validation. Publish exact interface to controller before Task 3 integration.

- [x] Write failing tests for required runtime skip/fixme, expected failure, zero/missing/malformed/duplicate/wrong-project results, omitted unit target, valid focused/full/subset/shard outcomes, and no required identities in the explicit empty target.
- [x] Run focused tests and preserve RED logs in this plan's evidence directory.
- [x] Implement native-report plus Vitest native-event sidecar reconciliation (expected-failure, retries and project identity), pre-execution applicability, canonical aggregate unit checks, selected Playwright enforcement, manifest-owned unit/build/browser arguments, and validation. Keep guards installed and exact argv behavior; reject unsupported metadata.
- [x] Run focused tests plus real reproduced bound-smoke baseline/skip/fix: baseline passes, injected inline runtime skip returns nonzero, restored test passes. Preserve logs/native reports and restore source exactly.
- [x] Self-review and report files, tests, exact exported evidence interface, and required shared integration. Controller commits after integration and requests independent review.

Run focused: `node tools/proofline/canonical-runner.mjs vitest run tools/proofline/src/required-execution.test.ts tools/impact/src/contract.test.ts tools/impact/src/harness-manifest.test.ts` (use existing runner before metadata integration when necessary; retain actual command).

### Task 2: Preserve invocation artifacts

**Files:** Same runner/helpers as Task 1, `apps/crm-e2e/playwright.config.ts`; create `tools/proofline/src/execution-artifacts.test.ts`. Release worker owns CI workflow upload integration.

**Interfaces:** Allocate each command below `artifacts/proofline/runs/<unique-id>/`; append invocation references to `artifacts/proofline/execution-index.jsonl`. Native report, verification JSON, stdout/stderr and browser report/test artifacts remain invocation-local. Release worker consumes validated index/records and CI uploads entire root.

- [x] Write and run failing preservation/collision/parallel/missing-report tests before implementing output allocation.
- [x] Implement isolated report/output locations before spawn, preserving failed-command evidence. Reject conflicting output overrides or control them safely. Publish field names to release worker.
- [x] Run real browser failure followed by real success; assert prior report, trace, screenshot, video and diagnostic bytes survive unchanged. Verify two distinct command/shard invocations cannot collide.
- [x] Run focused tests, self-review, and report separate Task 2 verdict/evidence. Controller obtains independent spec and quality review for both Tasks 1 and 2.

### Task 3: Publish and verify immutable release bundles

**Files:** Create `tools/proofline/release-bundle.mjs`, `tools/proofline/release-verify.mjs` and small focused helper(s) if needed; create `tools/proofline/src/release-verification.test.ts`; modify `.github/workflows/verify.yml`, `.github/workflows/deploy-demo.yml`. Do not edit root manifest/catalog/baseline/JSONL; send integration requests.

**Interfaces:** Consume Task 1–2 execution evidence. Produce audited Vercel Build Output plus strict inventory/provenance/gate manifest, uploaded only after successful full verification. Deployment consumes trusted API run/artifact metadata and downloaded archive bytes, verifies digest before safe extraction, then deploys exact prebuilt static output with pinned tooling. Inject API/archive inputs for offline tests.

- [x] Write and run failing tests covering missing/failed/wrong-SHA/workflow/repository/attempt, expired/tampered/wrong artifact, unsafe archive path/symlink, missing/extra inventory files, missing execution/gate evidence, stale same-SHA or wrong-run/attempt summaries, incomplete aggregate references, dirty tracked source and valid bundle.
- [x] Implement packaging, exact trusted-run resolution, strict archive/inventory/execution validation, trusted verifier checkout, pinned deploy tooling and no-rebuild workflow. No live API/provider/deploy command is executed locally.
- [x] Add explicit multi-worker/shard gates and always-uploaded invocation diagnostics to verify workflow. Preserve existing complete gates and trusted revision authority.
- [x] Run focused offline release tests and workflow contract checks; self-review and report verification limitations and shared integration needs. Controller obtains independent review.

### Task 4: Validate an unrelated standalone application

**Files:** Create `examples/work-orders/**`, `tools/proofline/validate-portability.mjs` and `tools/proofline/src/portability.test.ts`; modify `tools/proofline/check-production.mjs` and target-neutral production audit helpers if necessary. Execution schema/runner changes belong to Task 1 implementer; coordinate through controller.

**Interfaces:** Consume manifest-owned execution metadata and Task 1–2 evidence. Produce a standalone copied target repository with byte-identical reusable core, independent app/adapters/config/rules, deterministic unit and genuine navigated browser workflows, measured compatible coverage and append-only evidence. Produce a machine-readable compatibility/results record under generated artifacts.

- [x] Write and run failing portability tests for absent execution config/CRM-specific assumptions, changed copied core, missing target evidence and unsupported metadata.
- [x] Implement the work-orders app with dispatcher/observer roles, organization boundaries, `/desk/requests` to `/desk/completed` visible navigation and request completion. Keep target auth/API fakes absent from production output.
- [x] Implement offline disposable-repository preparation and target gates: manifest validation, exact discovery/selection after a real source change, full unit/browser, coverage/ratchet, record governance and production-negative verification. Preserve guard authority and copy core without edits.
- [x] Run isolated adaptation end to end with actual installed runtime/dependency versions, retain reports and verify no CRM import/route/rule dependency. Add browser failure-artifact check if not covered by shared runner integration.
- [x] Self-review and report complete commands, outcomes, source hashes, compatibility scope and shared integration requirements. Controller obtains independent review.

### Task 5: Shared integration and completion

**Files:** Controller owns `proofline.harness.json`, `test-impact/rules.json`, `test-impact/rules.md`, `test-impact/coverage-baseline.json`, `test-impact/execution-record.jsonl`, `docs/TESTING.md`, `docs/PORTABLE_TEST_AUTOMATION.md`, `README.md`, plan/spec.

- [x] Integrate manifest execution/production metadata, exact ownership/bindings, classify all new production sources and append scoped red/green/review evidence. Preserve baseline minima and committed record prefix.
- [x] Obtain independent spec-compliance and code-quality review of Tasks 1–4, fix material findings with scoped re-review, and commit small local changes.
- [ ] Run isolated second-app validation, all focused covering tests, lint/typecheck/manifest/record checks and inspect actual evidence.
- [ ] Obtain independent whole-change review from base `cfe5f11630eac902210bce1999b7a34f9847d8fc` to final implementation head, including shared integration and scope limits.
- [ ] From cleared generated build/cache/report/test outputs, run the original full Task 8 chain with `IMPACT_BASE=cfe5f11630eac902210bce1999b7a34f9847d8fc` and `IMPACT_HEAD=HEAD`: `pnpm lint && pnpm typecheck && pnpm harness:validate && pnpm test:impacted -- --dry-run && pnpm test:impacted && pnpm test && pnpm e2e && pnpm coverage && pnpm coverage:check && pnpm record:check && pnpm proofline:check-production && git diff --check`.
- [ ] Append final verification evidence, commit locally, validate committed-head record governance and confirm only pre-existing .codex/ remains untracked. Do not push/deploy.

## Self-review

Every authorized priority has one acceptance-owning task, focused red/green tests and independent review. Tasks 1–2 intentionally share one implementer/runner ownership; Task 3 owns both workflows, Task 4 owns the standalone target and production checker, and controller integrates shared metadata. Task 5 verifies interoperability and the original completion chain. No production database, hosted analytics, extra browsers, security scans or mutation framework is added by this increment.
