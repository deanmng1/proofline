# Adopter Confidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development with the user's explicitly requested parallel workstreams. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce bounded repository safeguards, provide safe source-native onboarding and measure verification reliability without overstating adoption or operating history.

**Architecture:** Three disjoint operational CLI modules and deterministic tests, integrated through existing canonical discovery/coverage. The controller owns shared manifest, registry, package scripts, CI integration, remote settings, commits and evidence. Retain all original core behavior.

**Tech Stack:** Node24.22.1, pnpm11.24.0, Git2.48+, Vitest/V8coverage3.2.7, Playwright1.62.1, React19.2.8/Vite6.4.3; no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-06-adopter-confidence-design.md`

## Global Constraints

- Preserve original portable/enterprise contracts, all existing coverage floors and append-only record bytes. Tests never contact live providers, GitHub, models or agents.
- Operational GitHub requests are outside tests, exact-repository/source scoped and secret-safe. Never confuse fixture/local evidence with actual hosted observation.
- Live staging, provider deployment, npm/tag/GitHub Release publication, human adoption claims and SLA commitments remain outside scope.
- Runtime/core additions must be generic; CRM/work-orders product code remains target-owned. Do not relax guards, required outcomes, retries, deadlines or release eligibility.
- Three workers own disjoint files; no worker modifies shared metadata or commits. Controller serializes builds/full suites and integrates small scoped commits.
- Use Node24.22.1/pnpm11.24.0 for all child commands. Read project binding sources before harness changes.
- Design/plan gap review has at most three iterations. Every implementation task receives independent spec compliance and code quality review.

## Review Focus

- A settings audit must reject check names without their actual Actions source, wrong target ref and silently disabled rules; Task1 tests those observations.
- A source receipt or destination symlink must not authorize overwriting an app/history; Task2 tests physical paths, edited files and preflight atomicity.
- A rerun pass cannot erase an earlier failure; missing/paginated runs must not look healthy; Task3 tests original outcomes, duplicates and completeness.
- CI reports and command recipes can drift from actual supported source/platforms; Task4 validates authoritative current documentation and exact discovery.
- Concurrent builds/evidence paths can invalidate observed outcomes; Task5 uses one committed head and serialized fresh/full verification.

## File ownership

| Task | Owned implementation files |
| --- | --- |
| 1 | `tools/proofline/repository-safeguards.mjs`, `tools/proofline/src/repository-safeguards.test.ts`, `.github/proofline-safeguards.json`, `docs/REPOSITORY_SAFEGUARDS.md` |
| 2 | `tools/proofline/onboarding.mjs` (focused helper files if needed), `tools/proofline/src/onboarding.test.ts`, `docs/GETTING_STARTED.md`, `docs/pilots/human-onboarding-worksheet.md` |
| 3 | `tools/proofline/reliability.mjs` (focused helper files if needed), `tools/proofline/src/reliability.test.ts`, `.github/workflows/reliability.yml`, `docs/RELIABILITY.md` |
| 4 | `tools/proofline/core-inventory.mjs`, `tools/proofline/src/core-inventory.test.ts`, generator integration in `validate-portability.mjs`; shared `package.json`, `proofline.harness.json`, `test-impact/rules.json`, generated `rules.md`, coverage baseline additions, current README/support/security/upgrade/status/handoff guides, verify workflow if necessary |
| 5 | Fresh/remote verification and review reports, factual JSONL append events and final status |

### Task 1: Prepare strict repository policy and audit

**Interfaces:** Policy JSON consumes exact repository/main, both current canonical check names/Actions app, zero mandatory approvals explicitly reported, PR/up-to-date/conversation/delete/force controls and private reporting. Export `validateSafeguardPolicy` and `auditRepositorySafeguards` (pure observations); CLI performs read-only audit with explicit inputs. Actual mutation is a separately reviewed controller operation, never an import side effect.

Required check identities are `verify (linux-x64-chromium)` and `verify (darwin-arm64-chromium)`, app15368. Controls are minimums: preserve additional checks and a positive existing approval count; reject inactive/not-applicable rules and effective bypass or unavailable enforcement. Zero approvals is the initial minimum, not a reset instruction.

- [ ] Write failing deterministic tests for missing/wrong checks or app, wrong repo/ref, absent/disabled protection, PR/bypass/delete/force weakness, unknown/missing fields, disabled reporting and non-mutating CLI behavior.
- [ ] Run the focused file through `node tools/proofline/canonical-runner.mjs vitest run tools/proofline/src/repository-safeguards.test.ts`; retain RED output.
- [ ] Implement strict policy/audit and actionable output, plus the single-maintainer limitation and exact administrator procedure/recovery in the guide. Preserve stronger settings.
- [ ] Run focused GREEN and lint/typecheck applicable to owned files; report test commands/results and concrete concerns to the controller. Do not call live GitHub in tests or apply remote settings.
- [ ] Controller makes a scoped commit and obtains independent spec and quality review before actual settings activation.

### Task 2: Safe self-service starter, core installation and upgrade planning

**Interfaces:** CLI `node tools/proofline/onboarding.mjs` with explicit `--source <fullSHA>`, `--destination <absolute>` and mode `starter|core`; read-only plan unless explicit apply. Export pure inventory/plan/receipt validation and explicit apply helpers. Receipts bind schema1/version/full source/hash inventory, never passed-test authority. Upgrade planning uses the prior receipt and refuses target edits/ambiguous files; all writes are opt-in and conflict-checked.

Use controller-provided `selectReusableCorePaths(paths)` from `tools/proofline/core-inventory.mjs` for selected and prior trusted Git inventories. Source-operator modules with onboarding/reliability/repository-safeguards basenames (including hyphenated helper suffixes) are excluded from copied core; the selector is included. Separately pin starter templates. Require receipt's exact equality to trusted prior commit inventory; no implicit fetch. Upgrade apply refuses any removed files. Validate forged protected/invented paths, missing/altered prior inventory, physical path changes, and interruptions around final receipt promotion. Incomplete markers never authorize a completed install.

- [ ] Write failing tests using real temporary repositories for read-only planning, pinned clean source, byte-identical install, new starter versus existing app, collisions/edited files, malformed receipt, traversal/symlink/overlap and interrupted staging recovery.
- [ ] Retain focused RED with `node tools/proofline/canonical-runner.mjs vitest run tools/proofline/src/onboarding.test.ts`.
- [ ] Implement dependency-free plan/apply/upgrade path without implicit installs, arbitrary target command execution or overwrite of app/config/history. Keep helpers focused if needed.
- [ ] Write the concise first-run/adaptation guide and human worksheet. Explain commands the user runs next and their meaning, including doctor, required outcomes, expected failing regression and full gate. Use source identity rather than an invented release tag.
- [ ] Retain focused GREEN; provide commands and evidence plus file list. Controller commits and obtains independent task review, then actually validates a new independently installed starter.

### Task 3: Honest verification reliability tracking

**Interfaces:** `collectVerificationHistory` uses an injected read-only API for offline tests; native CLI uses actual GitHub transport only with explicit repository/workflow/window/output. `summarizeReliability` preserves run/attempt/job identities and unknown/incomplete states. Each immutable observation and summary is supplementary, never release/native verification authority. Workflow uses pinned actions/read-only permissions and bounded scheduled/manual/canonical-completion collection; no shared evidence branch or automatic reruns.

Sample only default-branch push/manual canonical runs, explicitly excluding PRs. Enumerate attempt1..observed run_attempt using attempt-scoped metadata/jobs and bounded pages; unavailable prior attempts are unknown. Re-read run identity/attempt and reject concurrent advance. Preserve timestamped pending evolution/idempotent duplicates and reject conflicting terminal facts. Trusted default-branch checkout has persist-credentials false. Completion triggers require same repo, exact workflow identity/path, push/default branch; no event-head execution, interpolation or artifact download. Test these cases and unknown first-attempt denominators.

- [ ] Write failing fixtures for original fail/later pass, retries, cancellation, pending and missing cells/gates, conflicting observations, wrong workflow/repo/ref, timestamps, pagination/bounds and API errors; verify no per-test flake inference.
- [ ] Retain focused RED with `node tools/proofline/canonical-runner.mjs vitest run tools/proofline/src/reliability.test.ts`.
- [ ] Implement strict bounded collection, summary/CLI and immutable output. Reject malformed API data; expose finite samples and observation window. No downloaded code execution.
- [ ] Add `.github/workflows/reliability.yml` with minimum read permissions, immutable output names, safe event filtering and collection-failure visibility; test these meaningful controls. Write the operator/retention guide.
- [ ] Retain focused GREEN and owned-file checks. Controller commits and obtains independent task review, then collects actual API history outside tests.

### Task 4: Integrate governance and operator controls

- [ ] TDD the canonical selector on literal path inventories: prior core preserved, new source-operator modules excluded, helper included, deterministic sorted safe paths, invalid/duplicate paths rejected. Integrate existing generator and onboarding with that same selector and independently compare inventories. Update active status/recovery links before implementation.
- [ ] Reconcile shared scripts, source entrypoints, explicit ownership/rule/test identity bindings, source-group coverage and generated catalog. Add measured floors for new runtime modules without reducing any existing floor. Update canonical command documentation only if manifest commands change.
- [ ] Correct stale current compatibility/publication language and link the three concise guides. Keep historical snapshots and the presentation unchanged.
- [ ] Save prior GitHub settings; review exact desired request against the accepted policy and sole-maintainer recovery; apply only necessary settings and enable private reporting using authorized admin operations. Read back and audit the actual result; retain immutable observations.
- [ ] Verify safeguards via safe rule evaluation/check enforcement and report any unavailable proof or capability, without destructive main writes. Collect a bounded actual reliability snapshot and preserve failures/rerun attempts.
- [ ] Retain integration RED/GREEN where behavior changes, append factual implementation/review/operation records, run manifest/typecheck/lint/record/coverage checks and obtain independent integration review.

### Task 5: Fresh, hosted and independent completion

- [ ] Commit all implementation inputs. From a new full-history clone with separate HOME/store/browser cache, execute the original Task8 command chain in order with explicit trusted base/head. Retain actual exit codes and intermediate native evidence; no check after a failure receives credit.
- [ ] Validate both CRM and newly generated starter independently; run the target's ten gates, core inventory and explicit two-worker/scenario plus both shard halves. Validate a source-bound release directory/ZIP without provider deployment.
- [ ] After independent source approval, publish only this scoped feature branch/PR as needed to prove installed safeguards and actual hosted full verification. Merge normally only when required checks permit; observe actual main outcomes. Never use bypass or weaken policy to pass.
- [ ] Dispatch a non-implementing whole-project reviewer with binding sources, committed diffs, all task reviews and verification/actual-settings/history evidence. Require independent spec/quality verdicts and the unchanged weighted rubric; fix material findings with bounded scoped re-review.
- [ ] Append factual final evidence, publish a clone-visible report and update status/handoff. Final documentation-only closeout names the actually executed head and remains locally committed unless its publication is required for truthful recovery. Report the independent rating and remaining human/time/staging limits.
