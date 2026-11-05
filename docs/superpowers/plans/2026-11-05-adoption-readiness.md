# Adoption Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development with the user's explicit parallel execution instruction. Independent streams run concurrently; the controller serializes shared integration and commits.

**Goal:** Fix A01–A07 and prove both applications install and run outside the author's dependency/cache environment, then obtain an independent reassessment.

**Architecture:** Keep the manifest, guarded runners and native evidence authoritative. Three workers own browser executable resolution, independent target preparation, and the CRM demo; the controller owns public setup/status/CI and shared governance.

**Tech Stack:** Node 24.22.1, pnpm 11.24.0, React/Vite, Vitest, Playwright, Git, JSON/JSONL and GitHub Actions configuration.

**Spec:** `docs/superpowers/specs/2026-11-05-adoption-readiness-design.md`

## Global Constraints

- Direct local main work is authorized; no push, tag, publication or deployment.
- Node support is `>=24.22.1 <25`; selected verified runtime is 24.22.1; package manager is pnpm 11.24.0; Git is 2.48+.
- No test contacts live providers or invokes a model/agent. Registry/browser downloads are explicit setup only.
- Preserve exact child authority, deny-by-default egress, production-negative boundaries, all prior baseline minima and the JSONL byte prefix.
- Workers do not edit root package/manifest/catalog/baseline/JSONL/docs; send integration requests. All disposable repositories live outside this checkout.
- Functional changes require RED/GREEN evidence. Every implementation deliverable receives independent spec and code-quality review, followed by whole-change/readiness review.

## Review Focus

- Arbitrary cache basenames and package-local browser layouts must admit only exact installed companion binaries; missing or unrelated binaries stay denied.
- An independently installed target cannot resolve direct imports through the host's dependency tree or require undeclared build approval.
- Demo sign-in must work with no backend while production artifacts remain free of test adapters.
- Every active CI path must install its own required browsers before unit tests that execute browser identities.
- A clean clone must contain all mandatory status/plan references, and preview metadata must not imply an actual published release or hosted verification.

### Task 1: Repair installed browser executable resolution (A02)

**Files:** Worker owns `tools/proofline/canonical-runner.mjs` and focused tests under `tools/proofline/src/` (existing runner tests or a focused cache test). Avoid unnecessary new core files.

**Interfaces:** Existing canonical runner CLI and executable authority remain unchanged. Resolve companions from actual Playwright-installed layouts instead of a literal `ms-playwright` segment. Parent task/CI and target validation consume this behavior without overrides.

- [x] Add failing regression for arbitrary cache basename and exact headless-shell/video companion authorization; include a negative unrelated executable and missing optional browser case.
- [x] Preserve RED, implement minimal discovery repair, preserve GREEN and focused lint/typecheck results.
- [x] Run a real guarded Chromium smoke with a custom cache and verify retained native outcomes; include video/FFmpeg behavior.
- [x] Independently review spec compliance/quality, address material findings, integrate and commit.

### Task 2: Make work-orders independently installable (A03)

**Files:** Worker owns `examples/work-orders/package.json`, new target-owned `pnpm-workspace.yaml`/`pnpm-lock.yaml`, target README, `tools/proofline/validate-portability.mjs`, and `tools/proofline/src/portability.test.ts`. Coordinate changes to result evidence schema through the controller before editing `portability-result.mjs`.

**Interfaces:** Extend `prepareTarget({ repositoryRoot, temporaryRoot, dependencyMode })` with explicit `reuse` (existing) and `independent` modes. Independent preparation has no host dependency symlink. Keep `main()` default compatibility mode unless an explicit new install option is specified. Provide a repeatable command/preparation recipe that a fresh adopter can execute; report installation separately from guarded test execution.

- [x] Add failing tests for independent preparation without dependency links and complete direct dependency/build-install configuration.
- [x] Add pinned dependency/runtime/package-manager/install policy and lockfile; implement explicit independent preparation/CLI interface and document Git/catalog/evidence initialization.
- [x] Run a public-registry independent target install into a new store plus its ten deterministic gates; retain source/core hash checks and native evidence.
- [x] Independently review spec compliance/quality, address findings, integrate and commit.

### Task 3: Supply a capability-gated interactive CRM demo (A04)

**Files:** Worker owns new reference launcher under `apps/crm-web/scripts/`, its focused tests and any narrowly required app-owned configuration. Portable server/guard changes require controller coordination. Root supplies package `demo` alias and manifest classification.

**Interfaces:** `pnpm demo` launches the separately built local test artifact, prints a fresh loopback capability URL, supports deterministic shutdown, and uses the existing seeded legacy adapter for a human browser. It must not import reference-specific code into portable core or production entrypoints. `pnpm dev` remains backend integration mode.

- [x] Add failing launcher/guard or integration assertions for no-backend login, loopback/capability handling and cleanup.
- [x] Implement minimal launcher around existing guarded server/build contracts; provide exact package alias/arguments to controller.
- [x] Prove actual sign-in, protected visible navigation and logout/revisit with no backend; run production audit and preserve native/RED/GREEN evidence.
- [x] Independently review spec compliance/quality, address findings, integrate and commit.

### Task 4: Consolidate public setup and CI (A01, A05)

**Files:** Controller owns `.github/workflows/ci.yml`, existing verify workflow as needed, root `package.json`/lock metadata, `.nvmrc`, README, CONTRIBUTING, `docs/TESTING.md` and portable guide.

**Interfaces:** One complete Node24 verification workflow with Chromium before browser-dependent unit execution. Exact root `demo` alias comes from Task 3. Independent adaptation command comes from Task 2.

- [x] Retire duplicate CI; check canonical prerequisites and preserve all complete verification/release gates.
- [x] Align version prerequisites, clone URL, frozen dependency/browser setup, guarded per-file test examples and production/backend versus demo commands.
- [x] Verify documentation/commands/config parity and obtain independent spec/quality review.

### Task 5: Publish clone-complete status and preview policy (A06, A07)

**Files:** Controller owns AGENTS, `docs/AGENT_HANDOFF.md`, new `docs/PROJECT_STATUS.md`, package identity/version, README badge, CHANGELOG, `.github/SECURITY.md` and new `.github/SUPPORT.md`.

**Interfaces:** Tracked status points to the current plan and actual completion/review evidence. Version is unpublished `0.9.0-preview.1`, manifest schema remains 1. Old template history is explicitly historical.

- [x] Make every mandatory resume reference available in a clean clone; remove contradictory current-status claims.
- [x] Align package/badge/changelog and scope support/security/compatibility/upgrade/artifact-expiry policy without claiming remote publication.
- [x] Validate clone-visible links/status and obtain independent spec/quality review.

### Task 6: Shared integration and fresh install completion

**Files:** Controller owns manifest/catalog/baseline, authored record, tracked status/plan and generated verification controller scripts under ignored output.

- [x] Integrate all source ownership/exact bindings and classify new source coverage without lowering minima; refresh generated rules and canonical command docs.
- [x] Append all RED/GREEN/review evidence and make small clean local implementation commits.
- [x] Create a fresh full-history CRM clone outside the checkout, use empty HOME/store/browser cache, frozen public installation and exact pinned runtime; verify the documented demo and arbitrary-cache execution.
- [x] Prepare/install work-orders independently with a separate store and no host dependency links; verify all ten adaptation gates and core byte equality.
- [x] Run the full original twelve-command Task 8 chain from cleared generated state at the committed implementation head with `IMPACT_BASE=d8fef7175f7b9cdf52903821764ec85782a6aa4a` and `IMPACT_HEAD=HEAD`: lint, typecheck, manifest, impact dry-run/execution, unit, browser, coverage/check, record, production and whitespace.
- [x] Run explicit two-worker scenario/both shards and actual local release bundle directory/ZIP verification with current source/session provenance.

### Task 7: Independent reassessment and closeout

- [x] Commission a fresh agent to review all seven findings against actual fresh-install evidence, inspect whole-change spec/quality and rate the project again with the original weighted rubric.
- [x] Reproduce and repair material new findings with scoped independent re-review; do not target an inflated rating.
- [x] Append final evidence, mark tracked status/plan accurately, commit locally, validate committed-head record governance and clean tracked tree. Keep all historical evidence and preexisting `.codex/`.

## Verified closeout

Implementation `b368d854fb4e3ffb8f0b4e7f65b3851ad7e48b0b` passed all 22 fresh controller steps, including the original twelve-command gate, explicit isolation/shards, independent work-orders installation and actual release directory/ZIP verification. Native results: 554 unit tests/80 required identities, 44 browser tests/31 required identities, nine coverage groups with unchanged historical minima, ten target gates, 31 identical core files and 11 target-local direct packages. Root/target installs downloaded 464/127 packages with zero reuse.

The independent reviewer additionally passed the actual fresh demo workflow, the documented eight-test app-router command and a separate 719-file ZIP inventory audit. [Whole-change review](../../reviews/2026-11-05-adoption-readiness.md): spec and quality APPROVED; all A01–A07 closed; weighted rating 8.025, rounded to **8.0/10**, previously 6.0/10. Both failed completion attempts, the scoped repairs and the manual-probe readiness correction remain retained evidence. Final administrative changes are documentation and append-only records; the verified implementation is unchanged. Hosted workflow/API/deployment and wider platform support remain unverified.

## Self-review

Each A01–A07 finding has an acceptance-owning task; the three code streams have distinct file owners. Shared package/config/docs/evidence are serialized by the controller. Original completion, fresh installation and independent reassessment are distinct gates. Hosted CI/deployment and additional platforms remain unverified until separately executed, not silently credited.
