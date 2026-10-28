# Event-Driven Services and Regression Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reference CRM execute Policy → Policy State → Finance through typed service events and make the regression harness enforce durable rule, flaky-test, and scoped-coverage evidence.

**Architecture:** Keep `@testbed/domain` as shared value objects, commission arithmetic, and message contracts. Add independently owned Policy, Policy State, Finance, and service-bus libraries, then compose them in one deterministic runtime used by the Test API. Each service owns a private store and can import only shared contracts plus the bus—not another service. The UI remains an HTTP client; Vitest proves rules and cross-service delivery, while Playwright proves the browser workflow.

**Tech Stack:** TypeScript, pnpm workspaces, Nx, Vitest, MSW, Playwright, Vite, React.

**Spec:** `docs/superpowers/specs/2026-10-28-event-driven-services-and-regression-contract-design.md`

## Global Constraints

- Keep integer-cent money and explicit ISO-UTC clocks.
- No live provider calls, production broker, credentials, or wall-clock dependent test.
- Every service state mutation is sourced by a typed, immutable envelope.
- Every command has its own idempotent `commandId`; each emitted envelope has
  independent `messageId`, `correlationId`, `causationId`, `tenantId`,
  `schemaVersion`, and ISO-UTC `occurredAt` fields.
- A fresh Test API creates a fresh service runtime; each browser context owns its own Test API.
- Uncertain rule metadata, test discovery, ownership, or impacted selection must fail closed.
- Full Vitest and Chromium gates remain mandatory after impact-selected tests.
- Do not add an arbitrary global coverage threshold; only ratchet measured critical-module baselines.
- Append design/review/implementation/verification evidence to `test-impact/execution-record.jsonl`.

## Workspace dependency direction

| Package | Workspace dependencies |
| --- | --- |
| `@testbed/service-bus` | `@testbed/domain` |
| `@testbed/policy-service` | `@testbed/domain`, `@testbed/service-bus` |
| `@testbed/policy-state-service` | `@testbed/domain`, `@testbed/service-bus` |
| `@testbed/finance-service` | `@testbed/domain`, `@testbed/service-bus` |
| `@testbed/insurance-runtime` | all four service packages and `@testbed/domain` |
| `@testbed/api-contracts` | `@testbed/insurance-runtime`, not service implementations |
| `@testbed/test-kit` | `@testbed/api-contracts` |

Run `pnpm install` after adding each package manifest before its focused test.
No service package depends on another service package; only the runtime composes
them.

## Review Focus

- Duplicate delivery to one subscriber must not duplicate its local state, while delivery to a different subscriber remains independent — Task 1 test `delivers_once_per_consumer_and_preserves_delivery_log`.
- A failing consumer must leave its message replayable, skip later consumers, and preserve the failure evidence — Task 1 test `leaves_failed_delivery_pending_for_a_deterministic_retry`.
- A Finance event before Finance receives policy state must fail explicitly rather than creating a partial ledger — Task 4 test `rejects_finance_events_for_uninitialized_policy`.
- A duplicate policy bind must not create two Policy State transitions or two on-bind commission accruals — Task 5 test `bind_chain_is_idempotent_across_all_consumers`.
- A refund of a deposit on cash-first policy must create no compensating commission reversal — Task 4 test `does_not_reverse_unearned_deposit_refund`.
- An executable path/rule tag that cannot be mapped to a discovered test must select the full suite and return a validation error — Task 7 test `rejects_undiscovered_rule_evidence`.

---

### Task 1: Typed service envelopes and deterministic event bus

**Files:**
- Modify: `packages/domain/src/types.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/service-bus/package.json`
- Create: `packages/service-bus/project.json`
- Create: `packages/service-bus/src/service-bus.ts`
- Create: `packages/service-bus/src/service-bus.test.ts`
- Create: `packages/service-bus/src/index.ts`

**Interfaces:**
- Consumes: `Policy`, `CommissionPlan`, and scalar domain types from `@testbed/domain`.
- Produces: `ServiceEvent`, `EventEnvelope`, `ServiceBus`, and `createInMemoryServiceBus()` for all services.

- [ ] **Step 1: Write failing bus tests**

Add tests named `delivers_once_per_consumer_and_preserves_delivery_log`, `drains_messages_in_publish_order`, `appends_nested_publications_to_the_queue_tail`, and `leaves_failed_delivery_pending_for_a_deterministic_retry`. They publish stable envelope IDs to named consumers and assert FIFO delivery, registration order, per-consumer receipts, error evidence, and replay behavior.

- [ ] **Step 2: Run the bus test to verify it fails**

Run: `pnpm install && pnpm exec vitest run packages/service-bus/src/service-bus.test.ts`

Expected: FAIL because the bus package and factory do not exist.

- [ ] **Step 3: Define shared service event contracts and implement the bus**

Add discriminated events `policy.quote.created`, `policy.lifecycle.changed`, `policy.state.changed`, `finance.deposit.recorded`, `finance.premium.payment.settled`, `finance.refund.recorded`, `finance.claim.payment.recorded`, and `finance.commission.paid`. Give every envelope `messageId`, `correlationId`, optional `causationId`, `tenantId`, `schemaVersion`, and `occurredAt`. Implement synchronous FIFO drain: nested publishes append to the tail; delivery is complete only after the handler succeeds; a failure is logged, stops at the pending event, and replays on the next drain.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm exec vitest run packages/service-bus/src/service-bus.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain packages/service-bus pnpm-lock.yaml
git commit -m "feat: add deterministic insurance service bus"
```

### Task 2: Policy service owns quote and immutable policy transitions

**Files:**
- Create: `packages/policy-service/package.json`
- Create: `packages/policy-service/project.json`
- Create: `packages/policy-service/src/policy-service.ts`
- Create: `packages/policy-service/src/policy-service.test.ts`
- Create: `packages/policy-service/src/index.ts`

**Interfaces:**
- Consumes: `ServiceBus`, `Quote`, `Policy`, deterministic ID/clock ports, and a tenant-scoped customer/property reference-data port.
- Produces: `createPolicyService({ bus, clock, ids, referenceData })` with tenant-scoped `createQuote(input)`, `bindQuote({ commandId, tenantId, quoteId, policyId })`, and `transitionPolicy({ commandId, tenantId, policyId, lifecycle })`, plus query methods.

- [ ] **Step 1: Write failing Policy service tests**

Add `creates_quote_and_publishes_policy_quote_created`, `binds_a_quote_once_and_publishes_policy_lifecycle_changed`, `transitions_bound_policy_to_cancelled_at_next_revision`, `returns_original_result_for_a_replayed_command_id`, `rejects_same_command_id_with_different_payload`, and `rejects_property_from_another_tenant_or_customer`. Assert every public mutation requires command/tenant IDs and emitted envelope identity, causation, tenant, lifecycle, revision, and immutable policy contents.

- [ ] **Step 2: Run the Policy service test to verify it fails**

Run: `pnpm install && pnpm exec vitest run packages/policy-service/src/policy-service.test.ts`

Expected: FAIL because the Policy service package does not exist.

- [ ] **Step 3: Implement `createPolicyService`**

Validate quote premium and commission plan at the command boundary. Validate customer/property ownership through the injected tenant-scoped reference-data port. Store only command receipts, quotes, and policies in this service. Publish a `policy.quote.created` envelope and, when binding, a `policy.lifecycle.changed` envelope with lifecycle `bound`, revision 1, and the full immutable policy snapshot. Permit only the subsequent `bound -> cancelled` transition with the next revision; reject skipped/invalid transitions. Same-ID/same-payload commands return their stored result; conflicting input fails before publishing.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm exec vitest run packages/policy-service/src/policy-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/policy-service pnpm-lock.yaml
git commit -m "feat: add event-publishing policy service"
```

### Task 3: Policy State service publishes downstream state changes

**Files:**
- Create: `packages/policy-state-service/package.json`
- Create: `packages/policy-state-service/project.json`
- Create: `packages/policy-state-service/src/policy-state-service.ts`
- Create: `packages/policy-state-service/src/policy-state-service.test.ts`
- Create: `packages/policy-state-service/src/index.ts`

**Interfaces:**
- Consumes: versioned `policy.lifecycle.changed` envelopes through `ServiceBus.subscribe`.
- Produces: `createPolicyStateService({ bus })`, `getPolicyState(policyId)`, an append-only state timeline, and `policy.state.changed` envelopes.

- [ ] **Step 1: Write failing Policy State tests**

Add `projects_bound_policy_and_publishes_state_change`, `projects_valid_cancelled_revision`, `ignores_duplicate_policy_lifecycle_delivery`, `ignores_stale_policy_state_revision`, `rejects_conflicting_same_revision`, and `rejects_skipped_or_invalid_lifecycle_transition`. Assert that the versioned state message carries tenant, lifecycle, revision, and policy snapshot downstream, with the lifecycle `messageId` as causation.

- [ ] **Step 2: Run the Policy State test to verify it fails**

Run: `pnpm install && pnpm exec vitest run packages/policy-state-service/src/policy-state-service.test.ts`

Expected: FAIL because the service package does not exist.

- [ ] **Step 3: Implement the Policy State consumer**

Register named consumer `policy-state`. On the first `policy.lifecycle.changed` with lifecycle `bound`/revision 1, append a state record, expose it by tenant/policy ID, and publish exactly one `policy.state.changed` event. Accept only `bound -> cancelled` at the next revision without giving Finance access to Policy state; ignore older revisions and fail a conflicting same-revision, skipped-revision, or invalid-predecessor payload. Do not store Finance records or mutate Policy-owned objects.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm exec vitest run packages/policy-state-service/src/policy-state-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/policy-state-service pnpm-lock.yaml
git commit -m "feat: add policy state projection service"
```

### Task 4: Finance service consumes policy state and owns ledger rules

**Files:**
- Create: `packages/finance-service/package.json`
- Create: `packages/finance-service/project.json`
- Create: `packages/finance-service/src/finance-service.ts`
- Create: `packages/finance-service/src/finance-service.test.ts`
- Create: `packages/finance-service/src/index.ts`
- Modify: `packages/domain/src/commission.ts`
- Modify: `packages/domain/src/commission.test.ts`

**Interfaces:**
- Consumes: `policy.state.changed` and `finance.*` envelopes; commission helpers from `@testbed/domain`.
- Produces: `createFinanceService({ bus, now })`, finance-event command functions, `getLedger(policyId)`, and immutable ledger/commission/audit projections.

- [ ] **Step 1: Write failing Finance service tests**

Add tests `initializes_ledger_from_policy_state`, `rejects_finance_events_for_uninitialized_policy`, `cash_first_accrues_only_settled_premium`, `written_accrues_on_bound_state`, `does_not_reverse_an_allocated_deposit_refund`, `reverses_only_allocated_settled_premium_in_a_mixed_refund`, `rejects_over_refund_or_cross_tenant_allocation`, and `appends_commission_payment_without_rewriting_accrual`.

- [ ] **Step 2: Run the Finance service test to verify it fails**

Run: `pnpm install && pnpm exec vitest run packages/finance-service/src/finance-service.test.ts`

Expected: FAIL because the service package does not exist.

- [ ] **Step 3: Implement the Finance consumer and command publisher**

Register consumers `finance-policy-state` and `finance-ledger`. Require a tenant-matched, initialized Policy State snapshot before finance messages alter a ledger. Every Finance mutation requires a command ID and is published as a typed immutable event. A refund carries immutable allocations `{ financeEntryId, amountCents }`; validate source tenant/policy/kind and remaining refundable balance before appending an entry per allocation. Derive cash-first reversal only from settled-premium allocations and link adjustments/payment entries to the accrual they offset or settle. Store only the received state payload, ledger, commissions, and Finance command receipts.

- [ ] **Step 4: Run the focused Finance and domain rule tests to verify they pass**

Run: `pnpm exec vitest run packages/finance-service/src/finance-service.test.ts packages/domain/src/commission.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/finance-service packages/domain pnpm-lock.yaml
git commit -m "feat: make finance react to policy state events"
```

### Task 5: Compose the runtime and migrate the Test API to it

**Files:**
- Create: `packages/insurance-runtime/package.json`
- Create: `packages/insurance-runtime/project.json`
- Create: `packages/insurance-runtime/src/runtime.ts`
- Create: `packages/insurance-runtime/src/runtime.test.ts`
- Create: `packages/insurance-runtime/src/index.ts`
- Modify: `packages/api-contracts/package.json`
- Modify: `packages/api-contracts/src/contracts.ts`
- Modify: `packages/api-contracts/src/test-api.ts`
- Modify: `packages/api-contracts/src/test-api.test.ts`
- Modify: `packages/test-kit/package.json`
- Modify: `packages/test-kit/src/fixtures.ts`
- Delete: `packages/domain/src/apply-event.ts`
- Delete: `packages/domain/src/apply-event.test.ts`
- Modify: `packages/domain/src/types.ts`
- Modify: `packages/domain/src/events.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: all four service factories and typed runtime-command seed fixtures.
- Produces: `createInsuranceRuntime(seed, { now, idPrefix })`, runtime snapshot/query APIs, and a Test API backed by that runtime.

- [ ] **Step 1: Write failing runtime and API integration tests**

Add `bind_chain_is_idempotent_across_all_consumers`, `fresh_runtimes_do_not_share_bus_or_ledger_state`, `legacy_reducer_is_not_exported_or_used_by_the_runtime`, `retries_pending_finance_delivery_without_duplicate_policy_or_commission_records`, `rejects_missing_or_cross_tenant_request_context`, `replays_http_mutation_with_the_same_command_id`, and an HTTP test that binds a quote and exposes the Finance ledger created through Policy State. Add an HTTP mixed refund-allocation test proving that only the settled-premium allocation creates a commission reversal. Assert the composed runtime does not expose service stores to peers. Preserve the `/api/test/state` endpoint but expose service snapshots and delivery records rather than the old shared reducer state.

- [ ] **Step 2: Run the integration tests to verify they fail**

Run: `pnpm exec vitest run packages/insurance-runtime/src/runtime.test.ts packages/api-contracts/src/test-api.test.ts`

Expected: FAIL because no composed runtime exists and the Test API still invokes `applyEvent` directly.

- [ ] **Step 3: Implement `createInsuranceRuntime` and route Test API commands through it**

Resolve tenant only from the required `X-Tenant-Id` request header in the Test API; reject absent/unknown headers before a command reaches a service. Instantiate one bus and all services per runtime with injected clock/ID factories. Migrate every fixture and `TestSeed` field to versioned tenant-scoped runtime commands/envelopes in stable input order; remove the legacy `events` field rather than adding a reducer adapter. Require `commandId` in all Policy/Finance HTTP DTOs and fingerprint its payload. Drain after every command and form policy ledgers from service-owned projections plus relevant delivery/audit records. Inject one one-time Finance consumer failure in an integration test; map the initial pending-delivery error to a recoverable HTTP 409 response and use same-command replay to drain it without duplicate records. Replace direct `applyEvent` calls in the Test API, then remove the old reducer, its tests, and all exported legacy event/state types from `domain` types, events, and index modules. Retain HTTP response shapes unless the state snapshot explicitly gains the new service evidence.

- [ ] **Step 4: Run focused runtime, API, UI, and browser workflow tests**

Run: `pnpm exec vitest run packages/insurance-runtime/src/runtime.test.ts packages/api-contracts/src/test-api.test.ts apps/crm-web/src/features/crm-workflow.test.tsx && pnpm exec playwright test --config apps/crm-e2e/playwright.config.ts apps/crm-e2e/src/features/quote-bind-finance.spec.ts apps/crm-e2e/src/features/commission-refund.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/insurance-runtime packages/api-contracts packages/test-kit pnpm-lock.yaml
git commit -m "feat: route CRM test API through event services"
```

### Task 6: Make service-boundary behavior visible to the CRM and browser tests

**Files:**
- Modify: `apps/crm-web/src/features/crm/crm-api.ts`
- Modify: `apps/crm-web/src/features/quotes/quote-form.tsx`
- Modify: `apps/crm-web/src/features/policies/policy-detail-page.tsx`
- Modify: `apps/crm-web/src/features/finance/commission-panel.tsx`
- Modify: `apps/crm-web/src/features/crm-workflow.test.tsx`
- Modify: `apps/crm-e2e/src/features/quote-bind-finance.spec.ts`
- Modify: `apps/crm-e2e/src/features/commission-refund.spec.ts`
- Modify: `test-impact/features.json`

**Interfaces:**
- Consumes: unchanged policy ledger HTTP shape plus optional policy state/audit delivery details.
- Produces: accessible UI evidence of policy state, finance results, and updated discovered Playwright tags.

- [ ] **Step 1: Write failing UI and Playwright assertions**

Assert the bound policy displays its Policy State `bound` status, the ledger identifies event-driven history, and a refund allocation against a deposit does not display a commission adjustment while selected settled-premium allocations do. Add an accessible multi-allocation editor to the refund form and preserve its one command ID across a recoverable retry.

- [ ] **Step 2: Run focused UI/browser tests to verify they fail**

Run: `pnpm exec vitest run apps/crm-web/src/features/crm-workflow.test.tsx && pnpm exec playwright test --config apps/crm-e2e/playwright.config.ts apps/crm-e2e/src/features/quote-bind-finance.spec.ts apps/crm-e2e/src/features/commission-refund.spec.ts`

Expected: FAIL because the current UI does not expose the new service-state evidence.

- [ ] **Step 3: Implement the smallest accessible UI evidence and update ownership metadata**

Generate one command ID at mutation submission and preserve it for an HTTP retry; use the existing `X-Tenant-Id` client header managed by tenant context. Render service-derived policy state and immutable event-history labels without exposing transport internals. For refunds, let the user create, remove, and validate multiple `{ allocationId, financeEntryId, amountCents }` rows; submit allocations, never a cumulative refund total. Update `test-impact/features.json` paths and tags so all service package changes select the corresponding rule, contract, and browser tests.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `pnpm exec vitest run apps/crm-web/src/features/crm-workflow.test.tsx && pnpm exec playwright test --config apps/crm-e2e/playwright.config.ts apps/crm-e2e/src/features/quote-bind-finance.spec.ts apps/crm-e2e/src/features/commission-refund.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/crm-web apps/crm-e2e test-impact/features.json
git commit -m "test: cover event-driven policy workflow in UI"
```

### Task 7: Enforce machine-readable rules, flaky failure, and coverage ratchets

**Files:**
- Create: `test-impact/rules.json`
- Create: `test-impact/rules.schema.json`
- Create: `test-impact/coverage-baseline.json`
- Modify: `test-impact/rules.md`
- Modify: `tools/impact/src/types.ts`
- Modify: `tools/impact/src/validate.ts`
- Modify: `tools/impact/src/validate.test.ts`
- Modify: `tools/impact/src/select.ts`
- Modify: `tools/impact/src/select.test.ts`
- Modify: `tools/impact/src/main.ts`
- Modify: `tools/impact/project.json`
- Modify: `packages/test-kit/project.json`
- Modify: `packages/service-bus/project.json`
- Modify: `packages/policy-service/project.json`
- Modify: `packages/policy-state-service/project.json`
- Modify: `packages/finance-service/project.json`
- Modify: `packages/insurance-runtime/project.json`
- Modify: `apps/crm-e2e/playwright.config.ts`
- Modify: `package.json`
- Modify: `.github/workflows/verify.yml`
- Modify: `docs/TESTING.md`
- Modify: `docs/PORTABLE_TEST_AUTOMATION.md`

**Interfaces:**
- Consumes: discovered Vitest files, discovered Playwright tags, rule registry, coverage summaries.
- Produces: validated rule-to-test evidence, conservative selection reasons, CI flaky failure, and scoped coverage thresholds/ratchet report.

- [ ] **Step 1: Write failing validator/selector and coverage policy tests**

Add tests `rejects_undiscovered_rule_evidence`, `selects_all_rule_tests_for_an_owned_source_path`, `rejects_duplicate_rule_ids`, `rejects_a_critical_rule_without_deterministic_evidence`, and `runs_only_the_selected_test_identity`. Discover Vitest tests with `vitest list --json --includeTaskLocation` and Playwright tests with spec/title/line/tag identities. Prove a rule reference resolves to one exact test title/tag, not merely any tag in the spec. Add a coverage-policy script test proving a listed critical source file cannot fall below its checked-in line/branch/function/statement baseline; add execution-record validation tests for malformed lines and duplicate record IDs; add a configuration assertion that CI enables `failOnFlakyTests`.

- [ ] **Step 2: Run focused harness tests to verify they fail**

Run: `pnpm exec vitest run tools/impact/src && pnpm exec vitest run apps/crm-e2e --passWithNoTests`

Expected: FAIL because no structured registry, coverage policy, or flaky-test failure behavior exists.

- [ ] **Step 3: Implement validation and CI enforcement**

Create registry entries for all existing and service rules, each with criticality, owned paths, exact Vitest full title/file references, and exact Playwright spec/title/line/tag references where appropriate. Load and validate it before selection, add rule-path selection reasons, and execute selected Vitest tests with an anchored full-title pattern and selected Playwright tests as `file:line`; do not run the complete Nx project for this fast pass. Turn on `failOnFlakyTests` only in CI, and add `coverage:check` and `record:check` commands. Implement both scripts in `tools/impact/src`, normalize all coverage paths to repository-relative paths, and fail closed for a missing report, listed file, metric, malformed record, duplicate record ID, or Markdown registry drift. Add an `impact-tools:coverage` target and include it in root `pnpm coverage`, then extend Nx discovery/mappings, test, typecheck, and coverage targets for every new service package. Compare the reviewed critical service, Test API, and impact-validator file metrics against a checked-in baseline produced after Task 6. Generate `rules.md` from the registry and reject drift.

- [ ] **Step 4: Run full harness verification**

Run: `pnpm lint && pnpm typecheck && pnpm test:impacted -- --dry-run && pnpm test && pnpm e2e && pnpm coverage && pnpm coverage:check && pnpm record:check`

Expected: PASS, with coverage reports and impact artifacts written under `artifacts/`.

- [ ] **Step 5: Append portable evidence and commit**

Append design/review/implementation/verification records to `test-impact/execution-record.jsonl`, including commands, exit codes, rule IDs, coverage baseline locations, and the decision to use scoped ratchets.

```bash
git add test-impact tools/impact apps/crm-e2e package.json .github docs
git commit -m "feat: enforce portable service regression evidence"
```
