# Production Readiness Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development with the user's explicit parallel execution instruction. Workers own disjoint files; the controller serializes shared integration, commits and external actions.

**Goal:** Implement the three readiness milestones as far as executable evidence and available external prerequisites permit, then obtain a fresh independent assessment.

**Architecture:** Extend the guarded portable core, native evidence and source distribution. Separate boundary repairs, hosted artifact verification, and compatibility/preflight into parallel streams. Freeze an unharnessed third app before a fresh agent adapts it from public instructions. Keep shared governance and external operation decisions with the controller.

**Tech Stack:** Node 24.22.1, pnpm 11.24.0, Git 2.48+, React 19.2.8, Vite 6.4.3, Vitest/V8 3.2.7, Playwright 1.62.1, GitHub Actions, existing pinned Vercel CLI.

**Spec:** `docs/superpowers/specs/2026-11-05-production-readiness-design.md`

## Global Constraints

- Base is `024aa838ade882fdcca46e63a4ae665569c16fd0`. Direct local main is authorized; preserve preexisting `.codex/`, presentation assets/server, authored history and all 24 existing baseline entries.
- Node is `>=24.22.1 <25`, selected 24.22.1; pnpm exactly 11.24.0; Git minimum 2.48. Explicit child PATH must use the selected runtime/package manager.
- Test execution never calls an agent/model, live provider, GitHub or Vercel. Public registry/browser downloads are explicit installation setup; hosted operational audits are separately labeled external actions.
- Keep exact child executable/argv authority, deny-by-default egress, numeric-loopback capability boundaries, native required outcomes and production/test separation fail closed.
- Existing tag/commit release eligibility remains unambiguous successful push/main canonical workflow and exact current attempt/artifact with digest and full inventory/native validation. A dispatch/PR/matrix receipt cannot replace it.
- Worker-owned files are disjoint. Only the controller edits root package, canonical verify workflow, shared manifest/rules/baseline/JSONL, public docs and status. Workers request integration rather than editing these files or committing shared state.
- New core helpers are copied by the existing dynamic reusable-core inventory; preserve byte equality and work-orders v1 semantics rather than hardcode the old 31-file count.
- Functional changes need RED before implementation, GREEN, task verification and independent spec/quality review. Source declarations/receipts are not proof of unexecuted platforms, hosted runs, human adoption or maintenance history.
- Only the controller performs authorized hosted operations after local verification/review. No force push, remote setting change, tag/release publication or production deployment by workers.

## Review Focus

- Node option operands may conceal dangerous preloads before a true script boundary: Task 1 must reject them before a local sentinel executes while allowing ordinary script arguments.
- Relative dot-segment module identities may conceal a forbidden adapter in marker-free chunks: Task 1 must reject alias/escape/normalized duplicates and accept real production builds.
- A successful initial API selection may change IDs/attempt/digest/tag during download: Task 2 must reject the refreshed contradiction and emit no successful receipt.
- A declared matrix row or fixture receipt may be presented as actual compatibility: Task 3 must require source/session/native evidence and retain missing cells as not-observed.
- An agent pilot may accidentally inherit preauthored adaptation or controller assistance: Tasks 4/5 must freeze baseline, isolate instructions and record interventions before making an independent-discovery claim.

### Task 1: Close executable and production module boundary gaps

**Files:** Worker owns `tools/proofline/guard-policy.mjs`, `tools/proofline/src/egress-guard.test.ts`, `tools/proofline/src/canonical-runner-egress.test.ts`, `tools/proofline/src/production-negative.ts`, `tools/proofline/src/production-negative.test.ts`; change `egress-guard.mjs` only if shared parser application needs it. Do not edit release tests or shared metadata.

**Interfaces:** Preserve `assertSafeNodeArgv(argv)` and production audit APIs. Use an explicit supported Node option grammar and a canonical module-ID contract; no blanket child allowance, production scan bypass or rejection of ordinary post-script args.

- [x] Add RED tests for `--conditions value` followed by preload/import/loader/inspector/run, direct and inherited spawn/execFile/fork sentinel execution, plus safe separate/equal operands and true script/`--` boundaries.
- [x] Add RED marker-free production alias/relative escape/duplicate-normalized graph and Vite module fixtures; preserve legitimate virtual/query cases.
- [x] Implement minimal parser and module identity repairs; retain complete RED/GREEN logs and native IDs.
- [x] Verify guarded egress/canonical/production suites and actual CRM/work-orders production audits. Publish measured coverage and exact new binding identities to the controller.
- [x] Obtain independent spec and quality review, address material findings, integrate and commit.

### Task 2: Bridge local release verification to real hosted proof

**Files:** Worker owns new `tools/proofline/github-release-api.mjs`, `hosted-proof.mjs`, `release-recovery.mjs`, corresponding `src/*.test.ts`, existing `release-verify.mjs`/`src/release-verification.test.ts`, new `.github/workflows/hosted-proof.yml` and `stage-demo.yml`, existing `deploy-demo.yml`. Coordinate additional helpers before creating them; avoid guard/production/compatibility files.

**Interfaces:** `createGithubReleaseApi({token,fetchImpl,...boundedOptions}) -> {api,list}`; `resolveAndDownloadVerification({repository,sourceCommit,token,directory,api,list})` shared with preserved `resolveAndDownloadRelease({tag,...})`; a hosted-proof CLI taking exact commit or tag and external output paths; pure `assessReleaseRecovery(...)` using injected observations/time. Existing exported release directory/archive APIs remain compatible. Operational receipts record mode/provenance and never replace API/native authority.

- [x] Establish RED transport fixtures for pagination, status/JSON/timeout/page/body limits, redirect credential handling and sanitized errors; no real requests.
- [x] Establish RED full-resolver fixtures for post-download run/artifact ID substitution, attempt/digest/conclusion/expiry changes and tag movement. Use actual valid fixture ZIPs and reject unknown fixture routes.
- [x] Implement bounded transport and shared exact-commit/tag resolver. Preserve every original release/native/ZIP rule; no receipt is published after final authority failure.
- [x] Add RED/GREEN receipt classification/overwrite/provenance and deterministic expired-evidence recovery cases; preserve old-attempt and dispatch rejection.
- [x] Add read-only audit and manual prebuilt preview workflow contracts. Prereleases cannot automatically deploy production; preview has no `--prod`, no source rebuild, no token output, and missing credentials fail before provider invocation.
- [x] Verify focused guarded release/API/receipt/recovery tests, publish interfaces/new source coverage/bindings and workflow fragment details, obtain independent spec/quality review and integrate.

### Task 3: Make compatibility and preflight claims executable

**Files:** Worker owns new `proofline.compatibility.json`, `tools/proofline/compatibility.mjs`, `doctor.mjs`, `src/compatibility.test.ts`, `src/doctor.test.ts`; additive runtime production in `execution-artifacts.mjs`/`src/execution-artifacts.test.ts` and narrow optional-runtime v1 compatibility in `portability-result.mjs`/`src/portability.test.ts`. Provide a macOS job integration fragment under ignored output, not a competing canonical workflow. Coordinate any extra helper. Controller owns script aliases, public docs and canonical workflow integration.

**Interfaces:** strict `validateCompatibilityDeclaration(value)`; `collectCompatibilityEvidence(...)` and `summarizeCompatibility(...)` that validate native/source/runtime/independent-target evidence; `collectPreflight(...)` with injectable read/probe seams and source/installed CLI stages. The specification owns the exact two candidate IDs/runner labels/stack.

- [x] Add RED unknown/duplicate declaration and missing/smoke/stale/source/runtime/reused-install/summary-only evidence cases; prove no candidate becomes verified by a flag.
- [x] Add actual-process `metadata.runtime={nodeVersion,platform,arch,execPath}` to native invocation production with RED/GREEN, refusing caller override. Preserve old v1 evidence via a strict optional-runtime metadata addition, with malformed/unknown-field negatives and all historical minima unchanged.
- [x] Implement strict declaration and per-cell evidence collection using existing native and portability validators. Require matching runtime on authoritative gates, all bound children and independent target native records; actual collector runtime/package tuple must also match. Fixture mode stays explicit; requested hosted mode/env is not authenticated provenance.
- [x] Add RED doctor cases for missing/wrong Node/pnpm/Git/history/locks/revisions/dependencies/browser and safe custom-cache resolution; source stage works without dependencies and has no network/install/build/mutation.
- [x] Implement text/JSON preflight, concrete remediation, nonzero unmet requirements and explicit informational unverified platform status. Reuse installed registry validation; do not broaden authority.
- [x] Verify focused guarded tests and real source/installed doctor probes. Publish the exact macOS full-gate job/receipt contract, measured new coverage and binding identities.
- [x] Obtain independent spec/quality review, address findings and integrate.

### Task 4: Freeze a separately authored unharnessed application

**Files:** Controller owns initial `examples/roomboard/{package.json,pnpm-lock.yaml,pnpm-workspace.yaml,index.html,vite.config.mjs,src/*,README.md}` and `docs/pilots/roomboard-baseline.md`. No Proofline scaffolding in the frozen app.

**Interfaces:** Plain React/Vite `/rooms` and `/reservations` UI; pure room/slot reserve/cancel/conflict/stable-command replay semantics. Fixed seed choices and no auth/tenant/provider/database claims. Ordinary app tests may exist before adoption. Freeze baseline commit and inventory before Task 5.

- [x] Write ordinary failing domain tests before implementing room/slot rules.
- [x] Implement the minimal visible two-screen app and own pinned dependencies/build/tests; verify those and freeze the source/inventory.
- [x] Independently review the baseline acceptance/source and confirm it contains no preauthored Proofline adaptation. Commit baseline before pilot dispatch.

### Task 5: Run a fresh independent agent adaptation trial

**Files:** A fresh agent works in an external Roomboard-only repository with its own baseline history, never the host Git history, and creates its target-owned manifest/rules/lifecycle/workflow/evidence/adapters/config/tests. It owns no host files. Controller imports the reviewed resulting example/evidence after the trial.

**Interfaces:** Public onboarding/portable/support docs and immutable core source only. No work-orders bootstrap or v1 count/path substitution. Retain assistance log and baseline/adapted/core commit/hash references. Call it an agent trial throughout.

- [x] Dispatch fresh agent with `fork_turns: none`, the frozen app, public docs and immutable core reference; require inventory and rule/seam declaration before test authorship. Record host baseline snapshot and separate Roomboard-only initial commit.
- [ ] Run genuine fresh public install and target typecheck/discovery/exact selection/full fallback/unit/browser/coverage/record/production gates; preserve RED/GREEN and unexpected failures. No host dependency links.
- [ ] Verify visible reserve/cancel cross-screen workflow, worker isolation, egress and unchanged core; record actual runtime and all assistance. Never claim human onboarding proof.
- [ ] Obtain independent spec/quality review of adaptation and evidence. Retain baseline and adapted artifacts and import a repeatable fixture only after the discovery trial.

### Task 6: Integrate maintenance, compatibility CI and measured drills

**Files:** Controller owns `.github/workflows/verify.yml`, root package/manifest/rules/baseline/JSONL, README/CONTRIBUTING/portable/testing docs, `.github/{SUPPORT,SECURITY,CODEOWNERS}`, `docs/UPGRADING.md`, new pilot/readiness reports and version/changelog/status/handoff.

**Interfaces:** One canonical workflow with Linux full verify and a required macOS compatibility job; overall workflow success includes both. Preserve original 16 release-gate keys/native semantics. Distinct cell artifacts; actual source/run provenance. Preview source version may advance without claiming publication.

- [ ] Integrate exact new bindings, ownership and new-source measured coverage; preserve all 24 current baseline entries and full JSONL prefix. Validate real report production/provenance before the long gate.
- [x] Integrate preflight/script aliases, declared matrix and full macOS job without weakening the Linux/release workflow. Retain exact impact-preview runtime/output fixture RED for the existing quoting failure, repair it and verify the expected output. Validate literal workflow shell blocks as a supplemental check; local Bash syntax-only acceptance does not prove runtime success. Independently review complete shared integration.
- [x] Add actual-maintainer best-effort support/security/upgrade/recovery instructions and unpublished candidate notes; report remote protection/private-reporting settings honestly without changing them.
- [x] Rehearse a compatible old/new harness upgrade in a disposable target. Run harmless targeted argv/native-outcome mutation proofs and repeated genuine scenario runs; retain exact mutations, source, outcome and runtime without universal flake/benchmark claims.
- [ ] Obtain independent spec/quality review and commit integrated source before fresh verification.

### Task 7: Fresh source and hosted verification

- [ ] Run two fresh independent public installations, full original twelve-command gate, worker/both shards, compatibility receipt and actual local release directory/ZIP at committed implementation head with base `024aa838ade882fdcca46e63a4ae665569c16fd0`; preserve all failed attempts.
- [ ] Independently review the concrete source before publishing it for the authorized hosted milestone. Push a `codex/` candidate branch, create a reviewable PR and exercise real PR checks; repair failures through normal tests/review.
- [ ] Advance main without force only after required checks/review, run actual canonical main verification and both declared cells, and fetch/audit the exact eligible hosted artifact with new read-only verifier. Keep actual IDs/attempt/digest/native evidence.
- [ ] Verify and document the prepared preview workflow; the user explicitly chose to leave live staging pending. Do not invoke Vercel, request deployment credentials, perform production deployment, change remote settings or publish tags/releases implicitly.

### Task 8: Fresh whole-project review and closeout

- [ ] Commission a new independent agent to inspect integrated source and actual local/hosted/pilot/drill results and rerate with the original weights: correctness30, portability20, onboarding15, CI/release15, docs10, support10.
- [ ] Reproduce/fix/re-review material findings and repeat affected required gates; never target an inflated score or manufacture human/operational history.
- [ ] Append final outcomes and exact remaining external limits, update tracked status/plan/handoff, commit locally and validate committed-head governance/whitespace/clean tracked state. Preserve all evidence and user files.

## Self-review and preflight

The spec's three milestones map to Tasks 1–3 and 6–7, with independent discovery in Tasks 4–5 and final review in Task 8. Boundary fixes do not overlap release/compatibility worker files; the controller owns every shared governance file. New operational helpers remain in the dynamic copied core inventory, and work-orders v1 stays unchanged. Offline fixtures, genuine local execution and actual hosted/provider observations are separate evidence classes. External prerequisites cannot be checked off as implemented code.

## Recorded execution adjustment: truthful absent-tenancy declaration

The blind pilot stopped on a real upstream schema constraint at frozen core `d262c0c`, after independently installing and retaining ordinary app checks. Preserve its report and blocked result. A separately authored and reviewed additive schema repair permits an explicit explained `not-applicable` mode; see the design clarification. A later retry is assisted and must retain both source references and interventions. Root integration uses one full two-cell matrix job rather than duplicating its sixteen gates in two YAML jobs. Both declared cells remain required for workflow success.
