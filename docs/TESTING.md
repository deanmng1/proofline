# Testing the insurance CRM

This project treats business rules as executable contracts. Start with a rule
and its customer-visible outcome, then choose the smallest test layer that
can prove it. The full suite remains the safety net; impact selection only
chooses a fast, explainable first pass.

## Rule-to-regression workflow

1. Write an acceptance example with a stable rule ID in
   [`test-impact/rules.md`](../test-impact/rules.md). State the input, the
   expected ledger/policy/commission outcome, and the rule ID (for example,
   `COM-002` for cash-first commission).
2. Add a deterministic Vitest rule test in `packages/domain/src`. Use integer
   cents and source-event IDs; test positive and compensating/refund cases.
3. When a workflow crosses the HTTP contract, add an API-boundary test in
   `packages/api-contracts/src`. It must use a fresh `createTestApi()` per
   test, never a shared mutable server.
4. Add a Playwright journey only when the value crosses screens or guards a
   real browser regression. Reuse the Test API fixture; it aborts unexpected
   CRM API calls instead of reaching a provider or live service.
5. Update `test-impact/features.json` when paths, Vitest files, or Playwright
   tags change. Review this metadata with the production change: a stale tag
   intentionally makes the selector fail safe.
6. Run the selected tests and then the complete gate before merging.

```bash
# Show the changed files, selected tests, and rationale without executing them.
pnpm test:impacted -- --dry-run

# Run the conservative selection. Supply a base locally when comparing a branch.
IMPACT_BASE=main IMPACT_HEAD=HEAD pnpm test:impacted

# Required release-quality safety gate.
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e
```

## Test layers

| Layer | Owns | Use it for |
| --- | --- | --- |
| Domain Vitest | `packages/domain` | Money, idempotency, commission timing, refunds, and append-only events. |
| Contract Vitest | `packages/api-contracts` | HTTP shape, Test API isolation, and audit/ledger transitions. |
| UI Vitest | `apps/crm-web` | Form validation, values displayed to users, and recoverable error states. |
| Playwright | `apps/crm-e2e` | Customer → quote → bind → finance journeys and cross-browser-context isolation. |

## Impact selection and artifacts

`pnpm test:impacted` builds a manifest in `artifacts/impact/manifest.json`
and selection in `artifacts/impact/selection.json`. The selection is a union
of changed tests, static imports, and reviewed feature metadata. Each chosen
file records its reason.

The selector runs **all** tests if it cannot make a safe claim: Git history
is missing, configuration changes, an executable path has no owner, or feature
metadata has stale Playwright tags. Do not suppress that fallback.

Playwright saves the HTML report in `playwright-report/` and failures in
`test-results/` (trace, screenshot, and video where configured). These,
along with impact manifests and the full-Vitest log, are uploaded by
`verify.yml` on failure or when selection falls back to the complete suite.

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
projects, then run the complete Chromium suite. The workflow supplies the PR
base and head explicitly to prevent selection from guessing at CI history.

No test path should use live Epay, GhostDraft, Smarty, Sage, or other provider
credentials. Provider integration belongs behind a contract adapter and must
be exercised with deterministic test doubles in this harness.
