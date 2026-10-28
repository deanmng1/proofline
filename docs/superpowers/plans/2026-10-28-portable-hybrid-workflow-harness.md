# Portable Hybrid Workflow Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Proofline a portable, fail-closed hybrid regression harness: fast deterministic rule tests plus isolated, genuinely navigated Playwright workflows that are safe and useful in CI without an agent.

**Architecture:** A checked-in `proofline.harness.json` becomes the portable source of truth for executable commands, workspaces, ownership, exact test bindings, browser adapters, lifecycle matrices, and compatible coverage groups. A small Node core validates that metadata and governs impact, coverage, and execution-record checks. The CRM remains the reference implementation: a production-negative test entrypoint, an egress-denying scenario fixture, and a concise Chromium journey prove how a new React/Vite application adapts the core; lifecycle-model generation stays deliberately out of the default path.

**Tech Stack:** TypeScript, Node 22+, pnpm 11.24, Nx, Vite, React 19, Vitest 3, Playwright, Zod, MSW only in the test entrypoint, and JSON/JSONL.

**Spec:** `docs/superpowers/specs/2026-10-28-portable-hybrid-workflow-harness-design.md`

## Global Constraints

- Ship repository-native Node/shell/JSON configuration and adapters, not an npm package, hosted service, or IDE plugin.
- Keep Chromium as the full required browser matrix; Firefox/WebKit run only the declared invariant smoke when explicitly enabled.
- A fresh Test API/runtime and BrowserContext belong to each test scenario; no state crosses tests, workers, shards, or CI runs.
- Test adapters must be excluded from the production build, use a loopback-only capability-gated test entrypoint, and never contact live providers.
- Deny undeclared egress from browser, service-worker/WebSocket, runtime, runner, and inherited child-process planes; unsupported planes fail closed.
- Use actual user navigation for user-performable screen changes; adapters may seed or inspect state but may not execute an in-scope user action.
- Keep business-rule permutations, idempotency, recovery, authority, and tenant checks in deterministic domain/service/runtime/contract/UI tests; browser tests prove only cross-screen behavior and visible recovery.
- A targeted run is diagnostic only. Canonical full unit and browser commands remain mandatory CI gates.
- Normal changes may not lower coverage baselines or rewrite JSONL evidence history. Missing metadata, revisions, mappings, reports, or classification must fail closed.
- Do not add an LLM/model dependency to test execution, provider credentials, wall-clock timing, production database, or arbitrary global coverage threshold.
- Preserve direct-to-main history with small, reasoned commits. Append a portable execution record for design, review, red/green tests, repairs, and final verification.

## Review Focus

- A manifest can name a real package script but still contain a traversal path, duplicate owner, stale test title, or empty browser opt-out; Task 1's `rejects_invalid_or_non_executable_harness_metadata` must reject all four without running a command.
- A supplied invalid head/base, a new workspace, a dynamic import without declared target, or a deleted test binding must select canonical full commands rather than an incomplete discovered list; Task 2's `fails_closed_for_unresolvable_revisions_dynamic_dependencies_and_unmapped_workspaces` pins this behavior.
- A source/report group can disappear or a checked-in baseline can be reduced while current coverage remains green; Task 3's `rejects_baseline_reduction_missing_group_and_rewritten_record_prefix` must compare merge-base metadata and reject each case.
- A test-only import or fake route can accidentally reach a production artifact, or test-side/server-side/browser-side code can call an undeclared host; Task 5's production-negative and multi-plane egress tests must fail deterministically before any live request leaves the process.
- A deep-link login, role denial, tenant boundary, response-lost bind, or cleanup after a failed assertion can look correct only because a fixture seeded storage or leaked runtime state; Tasks 5–7 must prove these through the composed scenario contract and visible UI.

---

## File structure

| Area | Responsibility |
| --- | --- |
| `proofline.harness.json` | Versioned portable manifest for canonical commands, workspaces, browser modes, adapters, coverage groups, ownership, and exact test bindings. |
| `test-impact/lifecycle-matrix.json` | Optional-but-required-for-lifecycle-apps state contract; it documents transitions without generating browser permutations. |
| `test-impact/workflows/crm-golden.json` | Machine-readable CRM golden-workflow rows: setup seam, user action, URL, visible assertion, persisted invariant, rule IDs, and declared exclusions. |
| `tools/impact/src/harness-manifest.ts` | Zod schemas and static manifest validator; it never executes configured commands. |
| `tools/impact/src/changed-files.ts`, `select.ts`, `main.ts` | Full-history revision validation, workspace discovery, exact identity selection, canonical full fallback, and rationale artifacts. |
| `tools/impact/src/coverage-policy.ts`, `record-check.ts` | Merge-base coverage-baseline and append-only record governance. |
| `tools/proofline/` | Test-only Node preloader/command wrapper, loopback test-server control, and production-artifact audit. |
| `apps/crm-web/src/bootstrap.tsx`, `main.tsx`, `test-entry.tsx` | Split production bootstrap from the capability-gated test entrypoint so mocks never ship in the production artifact. |
| `apps/crm-e2e/src/fixtures/scenario.ts` | BrowserContext-scoped scenario lifecycle, deterministic auth/API/provider routes, strict request accounting, and cleanup. |
| `packages/*/src` | Serializable runtime/service/bus checkpoint seams and lifecycle-consistent policy reads, exercised only by deterministic tests. |
| `apps/crm-e2e/src/proofline/` | Chromium golden workflows and opt-in cross-browser invariant smoke, written through visible controls. |

### Task 1: Introduce the portable manifest, lifecycle contract, and static validator

**Files:**

- Create: `proofline.harness.json`
- Create: `test-impact/lifecycle-matrix.json`
- Create: `test-impact/workflows/crm-golden.json`
- Create: `tools/impact/src/harness-manifest.ts`
- Create: `tools/impact/src/harness-manifest.test.ts`
- Modify: `tools/impact/src/types.ts`
- Modify: `tools/impact/src/main.ts`
- Modify: `package.json`
- Modify: `docs/TESTING.md`

**Interfaces:**

- Produces `HarnessManifest`, `HarnessCommand`, `HarnessOwnership`, `HarnessTestBinding`, `CoverageGroup`, `LifecycleMatrix`, and `GoldenWorkflowMatrix` in `tools/impact/src/harness-manifest.ts`.
- Produces `validateHarness({ cwd, manifest, discovered? }): { errors: string[] }`; validation is static and may inspect files/package scripts but must not run a command.
- Adds `pnpm harness:validate`, which loads the root manifest, validates its paths/command shapes, and writes `artifacts/harness/validation.json` before failing on any error.
- The initial CRM manifest declares all current Nx workspaces, the `lint`, `typecheck`, `unit`, `browser`, `coverage`, `coverageCheck`, and `recordCheck` command keys, Chromium, existing critical coverage reports, and one exact Vitest/Playwright binding for every owned rule/layer.

- [ ] **Step 1: Write failing manifest and matrix validator tests**

Add tests named `rejects_invalid_or_non_executable_harness_metadata`, `rejects_duplicate_or_unbound_ownership`, `rejects_empty_browser_opt_out_without_reason`, `rejects_stale_exact_test_identity`, and `rejects_invalid_lifecycle_and_golden_workflow_rows`. Use temporary repositories containing only package scripts and fixture source; assert the validator rejects an absolute/traversal path, a missing script or workspace, duplicate glob ownership, a stale title/tag, malformed `accepted`/`rejected` lifecycle row, and a golden row that omits setup/actions/URL/visible/persisted/rule evidence.

- [ ] **Step 2: Run the focused validator tests to verify they fail**

Run: `pnpm exec vitest run tools/impact/src/harness-manifest.test.ts`

Expected: FAIL because the manifest/matrix schemas and validator do not exist.

- [ ] **Step 3: Implement static `HarnessManifest` validation and declare the CRM reference configuration**

Use Zod to require manifest version `1`; structured non-empty `argv`; repository-relative `cwd`, paths, and source groups; known root package scripts/executables; unique ownership globs; exact binding IDs; and non-empty `browserOptOutReason` when a workspace declares no browser command. Parse discovered Vitest full title/file/line and Playwright title/file/line/tag when supplied, but never execute a manifest command as validation.

Create `proofline.harness.json` with structured canonical commands and paths, the existing workspace set, `localOrigins: ["http://127.0.0.1"]`, a test-entrypoint command, adapter paths, all critical coverage groups, ownership-to-rule-to-test bindings, and an explicit cross-browser smoke project list that starts empty. Create a versioned `lifecycle-matrix.json` covering quoted → bound → cancelled plus rejected/no-op conventions. Create `crm-golden.json` with the five design workflow rows, marking cancellation/refund/commission-payment browser controls as service/contract-owned exclusions until a user-visible control exists.

- [ ] **Step 4: Wire `pnpm harness:validate` and run the focused tests**

Run: `pnpm exec vitest run tools/impact/src/harness-manifest.test.ts && pnpm harness:validate`

Expected: PASS; `artifacts/harness/validation.json` contains an empty error list.

- [ ] **Step 5: Commit the portable contract**

```bash
git add proofline.harness.json test-impact/lifecycle-matrix.json test-impact/workflows/crm-golden.json tools/impact/src/harness-manifest.ts tools/impact/src/harness-manifest.test.ts tools/impact/src/types.ts tools/impact/src/main.ts package.json docs/TESTING.md
git commit -m "feat: add validated portable harness manifest"
```

### Task 2: Make changed-code selection manifest-owned, exact, and fail closed

**Files:**

- Modify: `tools/impact/src/types.ts`
- Modify: `tools/impact/src/changed-files.ts`
- Modify: `tools/impact/src/select.ts`
- Modify: `tools/impact/src/main.ts`
- Modify: `tools/impact/src/validate.ts`
- Modify: `tools/impact/src/select.test.ts`
- Modify: `tools/impact/src/main-selection.test.ts`
- Modify: `tools/impact/src/contract.test.ts`
- Modify: `tools/impact/src/playwright-discovery.test.ts`
- Modify: `test-impact/features.json`
- Modify: `test-impact/rules.json`
- Modify: `test-impact/rules.md`

**Interfaces:**

- Consumes a validated `HarnessManifest`, a full-history `ChangeManifest`, and runner-discovered exact identities.
- Replaces bounded hard-coded roots and feature-only ownership with `selectImpact({ manifest, changes, discovered, sourceFiles })`.
- Produces `ImpactSelection` with `fallback: "none" | "canonical-full"`, `commandKeys`, exact identities, and a machine-readable `rationale` map of changed path → ownership row → rule ID → selected identity.
- `runSelection` executes only exact identity selectors for a non-fallback diagnostic selection; `runCanonicalFull` executes the manifest's registered full unit/browser commands when uncertainty exists.

- [ ] **Step 1: Write failing fail-closed selection tests**

Add `fails_closed_for_unresolvable_revisions_dynamic_dependencies_and_unmapped_workspaces`, `selects_declared_test_bindings_even_when_static_imports_are_absent`, `adds_static_import_evidence_without_treating_it_as_ownership`, `rejects_deleted_or_ambiguous_bindings`, and `runs_only_one_declared_vitest_and_playwright_identity`. Build fixture repositories with an invalid explicit `IMPACT_HEAD`, a missing explicit `IMPACT_BASE`, a new `project.json`, an unresolved `import()`, and a removed binding. Assert each chooses canonical command keys, preserves a reason, and cannot silently fall back to a fixed list of known files.

- [ ] **Step 2: Run the focused impact tests to verify they fail**

Run: `pnpm exec vitest run tools/impact/src/select.test.ts tools/impact/src/main-selection.test.ts tools/impact/src/contract.test.ts`

Expected: FAIL because explicit invalid revisions can currently degrade to `HEAD`, roots are hard-coded, and static import/file evidence can substitute for manifest ownership.

- [ ] **Step 3: Implement manifest-driven discovery, revision handling, and canonical fallback**

Make `readChangedFiles` represent unresolved supplied base/head as uncertainty rather than replacing it with `HEAD`; require a verified merge base when CI supplies revisions. Discover source/test roots from manifest workspaces and project metadata, not `knownRoots`. Make each changed executable path match exactly one valid ownership row and its bindings; treat static import closure as additive diagnostic evidence only. Reject a dynamic import unless the manifest declares a reviewed target binding. On any uncertain/deleted/ambiguous/unmapped case, produce `canonical-full` and run structured manifest unit/browser commands rather than a bounded candidate walk.

Keep rule metadata as the human-readable business catalog, but validate that its exact evidence and the manifest bindings agree. Preserve exact Vitest `--testNamePattern` and Playwright `file:line` execution; include selected command keys and full changed-path rationale in `artifacts/impact/selection.json`.

- [ ] **Step 4: Run targeted impact and catalog checks**

Run: `pnpm exec vitest run tools/impact/src/select.test.ts tools/impact/src/main-selection.test.ts tools/impact/src/contract.test.ts tools/impact/src/validate.test.ts && pnpm rules:generate && pnpm harness:validate && IMPACT_BASE=HEAD IMPACT_HEAD=HEAD pnpm test:impacted -- --dry-run`

Expected: PASS; the no-change dry run has exact discovered metadata, and every induced uncertainty test selects canonical full commands with a retained rationale.

- [ ] **Step 5: Commit conservative exact selection**

```bash
git add tools/impact/src test-impact/features.json test-impact/rules.json test-impact/rules.md
git commit -m "feat: make impact selection manifest-owned and fail closed"
```

### Task 3: Enforce compatible coverage and append-only evidence against the merge base

**Files:**

- Modify: `tools/impact/src/coverage-policy.ts`
- Modify: `tools/impact/src/record-check.ts`
- Create: `tools/impact/src/governance.ts`
- Create: `tools/impact/src/governance.test.ts`
- Modify: `tools/impact/src/policy.test.ts`
- Modify: `test-impact/coverage-baseline.json`
- Modify: `.github/workflows/verify.yml`
- Modify: `package.json`
- Modify: `docs/TESTING.md`
- Modify: `docs/PORTABLE_TEST_AUTOMATION.md`

**Interfaces:**

- Produces `readVerifiedMergeBase({ cwd, base, head })`, `checkBaselineMonotonicity({ baseBaseline, proposedBaseline })`, `verifyRecordPrefix({ baseRecord, proposedRecord })`, and `verifyChangedHarnessEvidence({ changedFiles, appendedRecords })` in `tools/impact/src/governance.ts`.
- Extends `coverageMain(cwd, revisions)` to load source-group/provider/version/exclusion configuration from the manifest, normalize report paths, require every declared source group and metric, compare measurements to the current baseline, and reject baseline decreases compared with the verified merge-base version.
- Extends `recordMain(cwd, revisions)` to reject a JSONL file whose current bytes are not exactly the base record's bytes followed by appended lines and one trailing newline, and to require every changed harness-owned path to overlap the scope of at least one newly appended record.

- [ ] **Step 1: Write failing governance tests**

Add `rejects_baseline_reduction_missing_group_and_rewritten_record_prefix`, `rejects_incompatible_provider_or_unclassified_source_group`, and `retains_merge_base_failure_as_a_gate_error`. Use temporary Git repositories with a committed manifest/baseline/record, then alter a threshold downward, remove a report/source group, change provider/version, rewrite an existing record byte, or remove the base revision. Assert each test fails before it can announce a comparable result.

- [ ] **Step 2: Run the governance tests to verify they fail**

Run: `pnpm exec vitest run tools/impact/src/governance.test.ts tools/impact/src/policy.test.ts`

Expected: FAIL because coverage only reads the working baseline and record validation only checks line syntax.

- [ ] **Step 3: Implement merge-base coverage and record governance**

Load report/provider/source/exclusion metadata from the manifest and reject missing report, file, metric, incompatible provider/version, absolute path, duplicate normalized path, or unclassified source. Treat browser journeys as behavioral evidence unless a compatible browser coverage group is declared. Read the base baseline and record with `git show <merge-base>:<path>`; compare all four metrics and source-group declarations so deletions/lowered thresholds fail. Require proposed JSONL to start byte-for-byte with the base JSONL and then contain valid appended entries only. For changed manifest-owned paths, require at least one appended record with an overlapping repository-relative scope; pure generated artifacts remain excluded from that check.

Keep `test-impact/coverage-baseline.json` as the approved numeric ratchet source, but make its referenced reports agree with the manifest. Keep rules Markdown generation deterministic through `record:check`.

- [ ] **Step 4: Make CI retain complete governance evidence**

Update `verify.yml` to run `pnpm harness:validate`, pass explicit base/head to impact, coverage, and record commands, and upload impact selection, coverage reports/ratchet, browser diagnostics, and unit logs under `always()`. Do not weaken full Vitest/Chromium safety gates; retain full Git checkout and failure-on-flake behavior.

- [ ] **Step 5: Run governance checks and commit**

Run: `pnpm exec vitest run tools/impact/src/governance.test.ts tools/impact/src/policy.test.ts && pnpm coverage:check && pnpm record:check`

Expected: PASS against the current merge base; artifacts identify the compared revision and all validated source groups.

```bash
git add tools/impact/src/coverage-policy.ts tools/impact/src/record-check.ts tools/impact/src/governance.ts tools/impact/src/governance.test.ts tools/impact/src/policy.test.ts test-impact/coverage-baseline.json .github/workflows/verify.yml package.json docs/TESTING.md docs/PORTABLE_TEST_AUTOMATION.md
git commit -m "feat: enforce merge-base coverage and evidence governance"
```

### Task 4: Add durable runtime checkpoints and lifecycle-consistent policy reads

**Files:**

- Modify: `packages/domain/src/types.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/service-bus/src/service-bus.ts`
- Modify: `packages/service-bus/src/service-bus.test.ts`
- Modify: `packages/policy-service/src/policy-service.ts`
- Modify: `packages/policy-service/src/policy-service.test.ts`
- Modify: `packages/policy-state-service/src/policy-state-service.ts`
- Modify: `packages/policy-state-service/src/policy-state-service.test.ts`
- Modify: `packages/finance-service/src/finance-service.ts`
- Modify: `packages/finance-service/src/finance-service.test.ts`
- Modify: `packages/insurance-runtime/src/runtime.ts`
- Modify: `packages/insurance-runtime/src/runtime.test.ts`
- Modify: `packages/insurance-runtime/src/test-fixtures.ts`
- Modify: `packages/api-contracts/src/contracts.ts`
- Modify: `packages/api-contracts/src/test-api.ts`
- Modify: `packages/api-contracts/src/test-api.test.ts`
- Modify: `apps/crm-web/src/features/crm/crm-api.ts`

**Interfaces:**

- Extends `ServiceBus` with `checkpoint(): ServiceBusCheckpoint`; `createInMemoryServiceBus(checkpoint?)` restores queue, completed consumer receipts, and delivery log before subscriptions are registered.
- Extends Policy, Policy State, and Finance services with internal checkpoint/hydration ports consumed only by `createInsuranceRuntime`.
- Produces `InsuranceRuntimeCheckpoint` and `createInsuranceRuntime(seed, { checkpoint? })`; `runtime.checkpoint()` captures sequence, customers/properties, service stores, command receipts, published envelopes, and bus delivery state.
- Updates `Policy.status` to `PolicyLifecycle` and guarantees query/list/detail results reflect `cancelled` after a successful transition.

- [ ] **Step 1: Write failing crash/recovery and lifecycle-truth tests**

Add tests named `restores_command_accepted_before_delivery_without_repeating_mutation`, `restores_after_one_consumer_receipt_and_finance_failure`, `replays_same_command_after_recreation_without_duplicate_policy_projection_or_ledger`, and `projects_cancelled_policy_status_in_list_and_detail_queries`. Snapshot at named crash points using the existing one-time Finance failure transport; reconstruct a new runtime from the checkpoint and assert command IDs, messages, consumer receipts, policy state, ledger entries, and generated IDs remain deterministic.

- [ ] **Step 2: Run focused service/runtime/API tests to verify they fail**

Run: `pnpm exec vitest run packages/service-bus/src/service-bus.test.ts packages/policy-service/src/policy-service.test.ts packages/policy-state-service/src/policy-state-service.test.ts packages/finance-service/src/finance-service.test.ts packages/insurance-runtime/src/runtime.test.ts packages/api-contracts/src/test-api.test.ts`

Expected: FAIL because state is closure-only, the bus cannot restore receipts/queue, and a cancelled policy still exposes `bound` policy facts.

- [ ] **Step 3: Implement serializable checkpoint/hydration seams without exposing service stores**

Keep each service's mutable store private. Add clone/freeze-based snapshot and restore functions that serialize only receipts, state records, generated identity sequence, published envelopes, queue, completed consumer receipts, and delivery diagnostics. Hydrate the bus before replay; recreate subscriptions through normal service construction; then hydrate stores and runtime receipts. Preserve current idempotency fingerprints and make a replay first drain pending delivery before it returns the stored result. Update Policy's transition record/query snapshot so its public status advances to `cancelled`, while Policy State still owns the chronological projection.

- [ ] **Step 4: Verify focused recovery evidence**

Run: `pnpm exec vitest run packages/service-bus/src/service-bus.test.ts packages/policy-service/src/policy-service.test.ts packages/policy-state-service/src/policy-state-service.test.ts packages/finance-service/src/finance-service.test.ts packages/insurance-runtime/src/runtime.test.ts packages/api-contracts/src/test-api.test.ts`

Expected: PASS; a recreation drains pending work exactly once and API replay exposes a recoverable pending result before final success.

- [ ] **Step 5: Commit durable service behavior**

```bash
git add packages/domain packages/service-bus packages/policy-service packages/policy-state-service packages/finance-service packages/insurance-runtime packages/api-contracts
git commit -m "feat: add recoverable runtime checkpoints"
```

### Task 5: Split production/test application entrypoints and deny runner egress

**Files:**

- Create: `apps/crm-web/src/bootstrap.tsx`
- Create: `apps/crm-web/src/test-entry.tsx`
- Modify: `apps/crm-web/src/main.tsx`
- Modify: `apps/crm-web/vite.config.ts`
- Modify: `apps/crm-web/project.json`
- Create: `tools/proofline/project.json`
- Create: `tools/proofline/egress-guard.mjs`
- Create: `tools/proofline/run-guarded.mjs`
- Create: `tools/proofline/src/egress-guard.test.ts`
- Create: `tools/proofline/src/production-negative.test.ts`
- Create: `tools/proofline/src/production-negative.ts`
- Modify: `package.json`
- Modify: `proofline.harness.json`

**Interfaces:**

- Produces `bootstrapApp({ testMode: boolean }): void`; production `main.tsx` calls it with `false`, and the separately built test entrypoint calls it with `true` only after the test launcher supplies a random `PROOFLINE_TEST_CAPABILITY`.
- Produces `withProoflineGuard(command, options)` through `run-guarded.mjs`; it sets an inherited Node preload and allowlist for loopback/declared fake origins.
- The preload replaces runner-side `fetch`, HTTP(S), WebSocket, and spawned child-process environment propagation with deny-by-default behavior; it records attempted method/origin/plane in a deterministic error.
- Produces `assertProductionNegativeArtifact({ directory, forbiddenMarkers })`, used after production build to reject test API, fake auth, seeded identity, mock, and test-entry markers.

- [ ] **Step 1: Write failing production-negative and runner-egress tests**

Add `rejects_test_markers_in_a_production_bundle`, `allows_only_declared_loopback_runner_requests`, `denies_fetch_http_https_websocket_and_inherited_child_egress`, and `refuses_test_entry_without_a_launcher_capability`. The egress tests must spawn a child Node process so environment propagation is proven, not assumed.

- [ ] **Step 2: Run the focused Proofline tool tests to verify they fail**

Run: `pnpm exec vitest run tools/proofline/src/egress-guard.test.ts tools/proofline/src/production-negative.test.ts`

Expected: FAIL because the application has one entrypoint and no runner preloader/auditor exists.

- [ ] **Step 3: Implement separated bootstraps, guarded commands, and artifact audit**

Move shared React rendering into `bootstrap.tsx`. Remove mock/Test API imports from the production entrypoint and make the test entrypoint capability-gated, loopback-only, and the only location permitted to load browser mocks needed by legacy non-CRM demonstration screens. Add `crm-web:build-test` and test-preview targets that produce a distinct test artifact. Ensure production `crm-web:build` contains no test adapter/fake-auth/mock marker, and do not initialize Sentry/monitoring in test mode.

Implement the preload with an explicit `PROOFLINE_ALLOWED_ORIGINS` allowlist. Refuse unrecognized protocol/host and propagate `NODE_OPTIONS` plus the allowlist to spawned children. Invoke it through `run-guarded.mjs` rather than shell-specific environment syntax, then register the tool workspace and command keys in the manifest.

- [ ] **Step 4: Verify test-only safety**

Run: `pnpm exec vitest run tools/proofline/src/egress-guard.test.ts tools/proofline/src/production-negative.test.ts && pnpm nx run crm-web:build && pnpm proofline:check-production`

Expected: PASS; production artifact audit finds no test markers, while test mode cannot start without a generated capability.

- [ ] **Step 5: Commit isolated test execution infrastructure**

```bash
git add apps/crm-web/src/bootstrap.tsx apps/crm-web/src/test-entry.tsx apps/crm-web/src/main.tsx apps/crm-web/vite.config.ts apps/crm-web/project.json tools/proofline package.json proofline.harness.json pnpm-lock.yaml
git commit -m "feat: isolate test entrypoints and deny runner egress"
```

### Task 6: Build the composed BrowserContext scenario adapter and authorization boundary

**Files:**

- Create: `apps/crm-e2e/src/fixtures/scenario.ts`
- Create: `apps/crm-e2e/src/fixtures/scenario-server.ts`
- Create: `apps/crm-e2e/src/fixtures/scenario-contract.spec.ts`
- Modify: `apps/crm-e2e/src/fixtures/test.ts`
- Modify: `apps/crm-e2e/src/fixtures/install-test-api.ts`
- Modify: `apps/crm-e2e/playwright.config.ts`
- Modify: `apps/crm-e2e/project.json`
- Modify: `packages/api-contracts/src/contracts.ts`
- Modify: `packages/api-contracts/src/test-api.ts`
- Modify: `packages/api-contracts/src/test-api.test.ts`
- Modify: `apps/crm-web/src/lib/http.ts`
- Modify: `proofline.harness.json`

**Interfaces:**

- Produces `createScenario(options): ProoflineScenario` with `createContext(identity)`, `newPage(identity)`, `api`, `inspect()`, `reset()`, and `assertNoUnexpectedRequests()`.
- `ScenarioOptions` has `seed`, `tenants`, `identity`, `roles`, `startAuthenticated`, `faults`, `permittedOrigins`, and deterministic ID/time options. `ScenarioIdentity` includes tenant membership and role; a single scenario may issue two identities only within one test.
- `install(context, scenario, identity)` is BrowserContext-scoped, blocks service workers, accounts for pages/workers/WebSockets, routes only declared first-party/auth/API/provider traffic, and fails anything else with scenario/trace detail.
- Extends `TestApi` with an injected authority port that receives authenticated role/tenant/request operation and rejects cross-tenant or role-disallowed mutations through the real HTTP/runtime path.

- [ ] **Step 1: Write failing fixture/authority contract specs**

Add Playwright fixture tests named `starts_unauthenticated_and_logs_in_through_routed_auth`, `fails_an_undeclared_browser_request_with_scenario_context`, `cleans_up_after_a_failed_scenario_assertion`, and `rejects_role_and_cross_tenant_mutations_through_the_test_api`. Include a multi-context test that shares one runtime only when explicitly created from the same scenario, and assert separate tests receive different runtime IDs.

- [ ] **Step 2: Run the fixture contract specs to verify they fail**

Run: `pnpm exec playwright test --config apps/crm-e2e/playwright.config.ts apps/crm-e2e/src/fixtures/scenario-contract.spec.ts --project=chromium`

Expected: FAIL because the current page-only fixture seeds authenticated local storage, routes only `/api/**`, uses a shared fixed preview server, and has no role authority boundary.

- [ ] **Step 3: Implement worker-server and BrowserContext scenario lifecycle**

Start the capability-gated test artifact on an OS-assigned loopback port once per Playwright worker. Give every test a new BrowserContext and opaque scenario ID; route every page/worker request at the context level; block/clear service workers; route WebSockets when supported or fail the test mode closed. The scenario must fulfill deterministic auth login/refresh/logout, tenant membership, CRM Test API, and declared provider fake requests. It must let only its loopback static assets through, preserve all unexpected-request diagnostics, and clean routes/context/server state with `try`/`finally`.

Use one Test API/runtime for a scenario. Have the fixture attach test-only bearer claims for the API authority port, never seed browser storage as a substitute for login, and give the client a scenario-local endpoint/base URL. Keep the existing page-specific helper only as a compatibility wrapper during migration; delete it once all CRM browser specs use `createScenario`.

- [ ] **Step 4: Run fixture and Test API contract suites**

Run: `pnpm exec vitest run packages/api-contracts/src/test-api.test.ts && pnpm exec playwright test --config apps/crm-e2e/playwright.config.ts apps/crm-e2e/src/fixtures/scenario-contract.spec.ts --project=chromium`

Expected: PASS; direct route and HTTP authority violations fail, unexpected egress is recorded, and cleanup leaves no scenario state for the next test.

- [ ] **Step 5: Commit composed browser isolation**

```bash
git add apps/crm-e2e packages/api-contracts apps/crm-web/src/lib/http.ts proofline.harness.json pnpm-lock.yaml
git commit -m "feat: add isolated browser workflow scenarios"
```

### Task 7: Protect CRM routes and prove visible cross-screen workflows

**Files:**

- Modify: `apps/crm-web/src/app/router.tsx`
- Modify: `apps/crm-web/src/test/app-router.test.tsx`
- Modify: `apps/crm-web/src/features/crm-workflow.test.tsx`
- Modify: `apps/crm-e2e/src/features/quote-bind-finance.spec.ts`
- Modify: `apps/crm-e2e/src/features/commission-refund.spec.ts`
- Modify: `apps/crm-e2e/src/features/isolation.spec.ts`
- Modify: `apps/crm-e2e/src/features/browser-worker-crm.spec.ts`
- Create: `apps/crm-e2e/src/proofline/golden-workflow.spec.ts`
- Create: `apps/crm-e2e/src/proofline/recovery-and-authority.spec.ts`
- Create: `apps/crm-e2e/src/proofline/cross-browser-smoke.spec.ts`
- Modify: `apps/crm-e2e/src/auth.spec.ts`
- Modify: `apps/crm-e2e/src/helpers.ts`
- Modify: `apps/crm-e2e/src/navigation.spec.ts`
- Modify: `apps/crm-e2e/src/mobile.spec.ts`
- Modify: `apps/crm-e2e/playwright.config.ts`
- Modify: `test-impact/rules.json`
- Modify: `test-impact/rules.md`
- Modify: `test-impact/workflows/crm-golden.json`
- Modify: `proofline.harness.json`

**Interfaces:**

- CRM customer, quote, and policy routes are wrapped by `RoleRoute` for `Owner`, `Admin`, and `Manager`; direct access by another authenticated role redirects to overview and emits no protected API mutation.
- Golden specs consume only the scenario fixture and the machine-readable workflow matrix. Each test names its matrix row/rule IDs and asserts setup, UI actions, URL transitions, accessible state, and persisted invariant.
- Chromium executes all golden specs. When `PROOFLINE_CROSS_BROWSER=1`, Firefox/WebKit execute only `@proofline-smoke` deep-link/login/nav/mutation/logout/revisit cases.

- [ ] **Step 1: Write failing route and browser journey tests**

Add `denies_crm_direct_routes_to_an_authenticated_unauthorized_role` to the React router suite. Add Playwright tests named `completes_the_unauthenticated_deep_link_to_policy_finance_logout_journey`, `recovers_an_accepted_bind_without_duplicate_policy_or_ledger`, `denies_cross_tenant_read_and_mutation_in_a_shared_runtime`, and `runs_the_cross_browser_invariant_smoke`. Each full journey must click the Insurance CRM sidebar group and links rather than using `page.goto()` for customer→quote transitions; only the initial deep link and explicit guard checks may navigate directly.

- [ ] **Step 2: Run focused UI/browser tests to verify they fail**

Run: `pnpm exec vitest run --config apps/crm-web/vite.config.ts apps/crm-web/src/test/app-router.test.tsx apps/crm-web/src/features/crm-workflow.test.tsx && pnpm exec playwright test --config apps/crm-e2e/playwright.config.ts apps/crm-e2e/src/proofline --project=chromium`

Expected: FAIL because CRM routes lack role guards, the workflow jumps between screens with direct URLs, and no login/tenant/recovery scenario matrix exists.

- [ ] **Step 3: Implement the route boundaries and migrate CRM browser evidence**

Wrap every CRM route, including policy detail, with the matching role boundary. Preserve the existing deterministic service/UI tests for refunds and commission corrections; do not add cancellation or commission-payment browser controls solely to inflate browser coverage. Update the matrix exclusion reason and rule ownership instead.

Replace browser storage seeding and CRM screen-to-screen `page.goto()` calls in every existing e2e spec (auth, navigation, mobile, CRM worker, quote/bind, refund, and isolation) with scenario login, an origin-aware fixture helper, visible sidebar/mobile navigation, and observable link/action transitions. Remove the obsolete browser-worker smoke once its assertion is covered by the new scenario contract. The flagship journey must begin at a protected policy/customer deep link, complete password login, restore the original route, create customer/property/quote, navigate through the Insurance sidebar, bind, view policy state/history, record finance, log out, and prove denied revisit. Recovery must inject a one-shot accepted-but-response-lost/failing-delivery outcome and prove exactly one policy/projection/ledger entry after retry/reconciliation. Tenant tests must use the manifest-declared two-context authority mode and prove both read and mutation rejection.

- [ ] **Step 4: Update exact rule bindings and run the Chromium matrix**

Run: `pnpm rules:generate && pnpm harness:validate && pnpm exec vitest run --config apps/crm-web/vite.config.ts apps/crm-web/src/test/app-router.test.tsx apps/crm-web/src/features/crm-workflow.test.tsx && pnpm exec playwright test --config apps/crm-e2e/playwright.config.ts apps/crm-e2e/src/proofline --project=chromium`

Expected: PASS; rule title/line/tag references agree with discovery, the full journey contains no user-transition shortcut, and retained artifacts include route/network diagnostics on failure.

- [ ] **Step 5: Commit visible workflow proof**

```bash
git add apps/crm-web/src/app/router.tsx apps/crm-web/src/test/app-router.test.tsx apps/crm-web/src/features/crm-workflow.test.tsx apps/crm-e2e test-impact/rules.json test-impact/rules.md test-impact/workflows/crm-golden.json proofline.harness.json
git commit -m "feat: prove navigated CRM regression workflows"
```

### Task 8: Finalize portable documentation, evidence, and verification

**Files:**

- Modify: `docs/TESTING.md`
- Modify: `docs/PORTABLE_TEST_AUTOMATION.md`
- Modify: `README.md`
- Modify: `test-impact/execution-record.jsonl`
- Modify: `test-impact/rules.json`
- Modify: `test-impact/rules.md`
- Modify: `proofline.harness.json`
- Modify: `.github/workflows/verify.yml`

**Interfaces:**

- Documents a target-project adaptation sequence: inventory, manifest/matrix/ownership creation, deterministic adapter, narrow rule tests, golden journey, selected diagnostic run, complete gates, evidence append.
- Documents the explicit boundary that a future Codex/Cursor skill/plugin consumes the manifest, JSONL record, and canonical commands but is not required for CI execution.
- Records this design, plan, implementation task outcomes, review outcomes, selected-test evidence, and final commands as appended JSONL events with repository-relative evidence only.

- [ ] **Step 1: Write failing documentation/record integrity tests**

Add or extend `record-check` tests to assert the current documentation command list references every manifest canonical command and that an execution record event for a changed harness artifact is required by the final verification fixture. Make the test fail against stale documentation/record data.

- [ ] **Step 2: Run the focused record/docs tests to verify they fail**

Run: `pnpm exec vitest run tools/impact/src/policy.test.ts && pnpm record:check`

Expected: FAIL until documentation, generated rule catalog, and appended record events agree with the final manifest.

- [ ] **Step 3: Update adaptation documentation and append evidence**

Describe the portable manifest fields, lifecycle-matrix optionality, golden workflow row contract, test-only build/egress rules, exact selection rationale, merge-base coverage/record checks, artifacts, and browser matrix. State clearly that CI runs no agent/model and that the state-model extension is intentionally parked. Append one JSONL record per meaningful task/review/verification result; never revise earlier records. Regenerate `rules.md` and reconcile all manifest bindings after final test line changes.

- [ ] **Step 4: Execute the full completion gate from a fresh working state**

Run: `pnpm lint && pnpm typecheck && pnpm harness:validate && pnpm test:impacted -- --dry-run && pnpm test:impacted && pnpm test && pnpm e2e && pnpm coverage && pnpm coverage:check && pnpm record:check && pnpm proofline:check-production && git diff --check`

Expected: PASS. Verify that the impact artifact includes base/head/rationale, coverage artifacts identify compatible source groups and merge base, record validation proves append-only history, and browser artifacts contain report/trace/video/screenshot data when a failure is induced.

- [ ] **Step 5: Commit final documentation and proof**

```bash
git add docs/TESTING.md docs/PORTABLE_TEST_AUTOMATION.md README.md test-impact/execution-record.jsonl test-impact/rules.json test-impact/rules.md proofline.harness.json .github/workflows/verify.yml
git commit -m "docs: record portable workflow harness verification"
```

## Plan self-review

### Spec coverage

- Portable Node/shell/JSON manifest, lifecycle matrix, exact ownership, and static validation are Task 1.
- Change-aware exact selection, workspace discovery, dynamic imports, invalid revisions, and canonical full fallback are Task 2.
- Compatible coverage, baseline monotonicity, append-only evidence, full-history comparison, and immutable CI artifacts are Task 3.
- Durable recovery, command replay, service-bus receipts, policy-state truth, and cancellation reads are Task 4.
- Production-negative test mode and browser/runtime/runner/child-process egress denial are Tasks 5–6.
- Real navigation, protected deep links/login/logout, recovery, role/tenant behavior, and optional cross-browser smoke are Task 7.
- Target adaptation guidance, portability toward a future skill/plugin, complete evidence, and all required gates are Task 8.
- State-model test generation is intentionally not implemented; Task 1 supplies only the portable lifecycle contract needed to add it later.

### Step and interface consistency

`HarnessManifest` is defined before impact/coverage consumers. `InsuranceRuntimeCheckpoint` precedes the Test API/browser adapter that consumes a fresh runtime. `createScenario` precedes all golden journey specs. Every task starts with a red test, names the exact interface produced, finishes with focused verification, and has a direct-main commit.

### Review-focus coverage

- Manifest command/path/ownership/title/opt-out failures: Task 1 validator tests.
- Bad revisions, dynamic imports, new workspaces, and binding ambiguity: Task 2 selection tests.
- Baseline/group/report/provider/record-prefix failures: Task 3 governance tests.
- Production marker and runner/child-process egress failures: Task 5 tool tests.
- Login, scenario cleanup, role/tenant authority, and response-lost recovery: Tasks 6–7 fixture and golden tests.

### Proportion

The plan delegates implementation detail to focused interfaces and named assertions. It specifies public contracts, files, test names, commands, and required outcomes without transcribing implementation bodies.
