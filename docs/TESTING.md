# Testing the insurance CRM

This project treats business rules as executable contracts. Start with a rule
and its customer-visible outcome, then choose the smallest test layer that
can prove it. The full suite remains the safety net; impact selection only
chooses a fast, explainable first pass.

## Rule-to-regression workflow

1. Write an acceptance example with a stable rule ID in
   [`test-impact/rules.json`](../test-impact/rules.json), then run
   `pnpm rules:generate` to update the checked-in Markdown catalog. State the input, the
   expected ledger/policy/commission outcome, and the rule ID (for example,
   `COM-002` for cash-first commission).
2. Add a deterministic Vitest rule test in the owning service package, or
   `packages/insurance-runtime/src` when the behavior crosses services. Reserve
   `packages/domain/src` tests for value and arithmetic helpers. Use integer cents
   and source-event IDs; test positive and compensating/refund cases.
3. When a workflow crosses the HTTP contract, add an API-boundary test in
   `packages/api-contracts/src`. It must use a fresh `createTestApi()` per
   test, never a shared mutable server.
4. Add a Playwright journey only when the value crosses screens or guards a
   real browser regression. Reuse the Test API fixture; it aborts unexpected
   CRM API calls instead of reaching a provider or live service.
5. Update `test-impact/features.json` and the rule registry when ownership or
   tests change. Each critical rule needs deterministic Vitest evidence with
   its full discovered title, file, and line. Supplemental Playwright evidence
   needs the exact spec, nested title, line, and tag. A tag elsewhere in the
   same spec is not evidence. Run discovery to refresh moved locations.
6. Run the selected tests and then the complete gate before merging.

```bash
# Show the changed files, selected tests, and rationale without executing them.
pnpm test:impacted -- --dry-run

# Run the conservative selection. Supply a base locally when comparing a branch.
IMPACT_BASE=main IMPACT_HEAD=HEAD pnpm test:impacted

# Required release-quality safety gate.
pnpm lint && pnpm typecheck && pnpm test:impacted -- --dry-run && pnpm test && pnpm e2e

# Generate line, branch, function, and statement baselines for production code.
pnpm coverage && pnpm coverage:check && pnpm record:check
```

`pnpm coverage` includes CRM web, domain, Test API, all five service/runtime
packages, test-kit, and impact-tools targets. Reports live below
`artifacts/coverage/`. Open a project's `index.html` for the local HTML
report; `lcov.info` and `coverage-summary.json` support later CI dashboards or
threshold discussions. `test-impact/coverage-baseline.json` ratchets each
line, branch, function, and statement percentage for seven reviewed critical
files: service bus, Policy, Policy State, Finance, runtime, Test API, and the
impact validator. Missing reports/files/metrics and lower coverage fail.
There is no global percentage gate; untested template code remains visible.
Baseline reductions require a recorded review decision. Raise the checked-in
metrics after reviewing improved reports; ordinary CI never rewrites them.
Vitest preserves those reports when a covered suite fails; CI still reports
the failure and uploads the available coverage evidence after dependency
installation succeeds.

## Test layers

| Layer | Owns | Use it for |
| --- | --- | --- |
| Domain Vitest | `packages/domain` | Money, arithmetic, and shared value helpers. |
| Service/runtime Vitest | Owning service and `packages/insurance-runtime` | Command idempotency, commission timing, refunds, delivery, and append-only events. |
| Contract Vitest | `packages/api-contracts` | HTTP shape, Test API isolation, and audit/ledger transitions. |
| UI Vitest | `apps/crm-web` | Form validation, values displayed to users, and recoverable error states. |
| Playwright | `apps/crm-e2e` | Customer → quote → bind → finance journeys and cross-browser-context isolation. |

## Impact selection and artifacts

`pnpm test:impacted` builds a manifest in `artifacts/impact/manifest.json`
and selection in `artifacts/impact/selection.json`. The selection is a union
of changed tests, static imports, reviewed feature metadata, and rule ownership.
`discovery.json` records actual runner identities; `selection.json` retains
both file-selection and rule reasons plus the exact selected identities.
Vitest discovery runs `list --json --includeTaskLocation`, using the CRM Vite
configuration for UI tests. Execution batches only selected anchored full
titles in the same file. Playwright execution uses exact `file:line` locations.
Feature tags and rule references select only matching Playwright identities;
direct spec edits and static imports select every identity in the affected spec.
Selected runs never substitute a whole Nx test project. The later full gates
still run every test.

The selector runs **all** tests if it cannot make a safe claim: Git history
is missing, configuration changes, an executable path has no owner, or feature
metadata has stale Playwright tags. Invalid or ambiguous evidence/discovery
also fails the command and writes an `executionBlocked` fallback artifact.
Missing/malformed registries, duplicate IDs, critical rules without Vitest,
undiscovered references, and generated Markdown drift cannot pass a dry run.
Do not suppress that fallback or its failure.

Playwright saves the HTML report in `playwright-report/` and failures in
`test-results/` (trace, screenshot, and video where configured). These,
along with impact manifests and the full-Vitest log, are uploaded by
`verify.yml` on failure or when selection falls back to the complete suite.
Coverage is uploaded as a separate artifact on every CI run.

## Portable execution record

The append-only
[`test-impact/execution-record.jsonl`](../test-impact/execution-record.jsonl)
records design, review, implementation, verification, evidence, and durable
decisions in a tool-neutral form. See
[`PORTABLE_TEST_AUTOMATION.md`](PORTABLE_TEST_AUTOMATION.md) for the recording
protocol and the adapter boundary for a future Codex or Cursor integration.

## CI order

Pull requests check out full Git history, install dependencies, lint and
typecheck, preview impact selection, run selected tests, run all Vitest
projects, then run the complete Chromium suite and generate/check coverage.
CI validates the JSONL record and generated catalog. Playwright retries remain
available for diagnostics, but CI sets `failOnFlakyTests`: passing on a retry
still fails the gate. Local runs do not enable this setting.
The workflow supplies the PR base and head
explicitly to prevent selection from guessing at CI history.

No test path should use live Epay, GhostDraft, Smarty, Sage, or other provider
credentials. Provider integration belongs behind a contract adapter and must
be exercised with deterministic test doubles in this harness.
