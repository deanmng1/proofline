# Testing the insurance CRM

Proofline treats business rules as executable contracts. Use the smallest deterministic layer that proves a behavior, then retain a few real browser workflows for navigation and cross-screen state. Impact selection is a diagnostic first pass; canonical full gates remain the correctness authority.

## Rule-to-regression workflow

1. Add or update a stable rule in `test-impact/rules.json` and its ownership in `proofline.harness.json`.
2. Write a failing deterministic test before implementation. Domain tests own values; service/runtime tests own commands, delivery, persistence, and transitions; contract tests own HTTP/authority boundaries; UI tests own validation and recovery controls.
3. Use Playwright only when the proof requires authentication, route restoration, visible navigation, cross-screen state, recovery controls, role/tenant guards, or logout.
4. Bind the exact discovered file, full title, declaration line, optional tag, runner, command, rule, and layer. Run `pnpm rules:generate`; never edit `test-impact/rules.md` by hand.
5. Append the RED, GREEN, review, repair, and verification outcomes to `test-impact/execution-record.jsonl`.
6. Run selection diagnostics and the complete gate with an explicit trusted base/head.

## Test layers

| Layer | Owns |
| --- | --- |
| Domain Vitest | Money, arithmetic, and shared values. |
| Service/runtime Vitest | Command identity, event delivery, checkpoints/restart, state transitions, finance, and commission. |
| Contract Vitest | Request/response shape, role and tenant authority, and Test API behavior. |
| UI Vitest | Forms, visible values, route guards, validation, and recoverable states. |
| Playwright | A small set of true multi-screen user workflows. |

## Portable contracts

`pnpm harness:validate` validates structured commands without executing them; workspace membership; capability-gated test entrypoint and adapters; browser matrix; coverage groups; exact ownership; rule registry; and lifecycle/golden matrices. Missing or ambiguous metadata fails closed and writes `artifacts/harness/validation.json`.

A target adapts Proofline by inventorying its repository and boundaries, inventorying rules/providers/side effects, declaring the manifest and matrices, implementing deterministic scenarios and golden rows, authoring narrow tests plus true browser journeys, then appending evidence and running complete gates. See [Portable test automation](PORTABLE_TEST_AUTOMATION.md) for the ordered protocol and the machine-checked canonical command table.

A lifecycle target declares rows with state, operation, role, tenant scope, expected result, next state, rule IDs, and deterministic owner layer. A stateless target declares `lifecycleMatrix: null`. State-model generation remains an optional parked extension for unusually large lifecycle matrices.

Every golden row declares adapter-only setup, user-performed actions, URL transitions, accessible visible assertions, and persisted invariants inspected only after visible success. The adapter may seed or inspect; it cannot perform an in-scope user operation.

## Test-only boundary and egress

The test application is a separate build. Its loopback server accepts one fresh launcher-generated capability and rejects missing, incorrect, or replayed capabilities. `pnpm proofline:check-production` rejects Test API, fake-auth, provider-fake, test-entrypoint modules, and test markers in production output.

Deny-by-default egress covers runner fetch/HTTP(S)/WebSocket/children, guarded server/runtime requests and configured SDK clients, BrowserContext pages and workers, the service-worker block/cleanup policy, WebSockets, and deterministic provider fakes. No test uses live Epay, GhostDraft, Smarty, Sage, fonts, or provider credentials.

The fixture refresh flow rotates the opaque access bearer. The `refreshToken` field is a client-side refresh-capability marker, not a separately authenticated refresh credential; that broader protocol remains explicitly deferred.

## Impact, coverage, and immutable evidence

`pnpm test:impacted` writes `artifacts/impact/manifest.json`, `discovery.json`, and `selection.json`. Evidence names exact test identities and ownership. Dynamic-import evidence includes importer, literal specifier, resolved target, and target owner. Configuration/structural changes, incomplete Git history, missing ownership, stale discovery, ambiguous bindings, or unresolved dynamic imports trigger canonical-full fallback.

`pnpm coverage` generates normalized repository-relative Istanbul summaries. `pnpm coverage:check -- --base <trusted-base> --head <head>` verifies a unique merge base, compatible manifest groups, provider provenance, complete classified sources, and monotonic line/function/branch/statement baselines. It writes `artifacts/coverage/ratchet.json` on success or failure.

`pnpm record:check -- --base <trusted-base> --head <head>` verifies byte-exact append-only history, schema and path safety, new scope for every changed governed artifact (including README), generated rule parity, and manifest/documentation command parity. It writes `artifacts/record/check.json` even on failure.

## Implemented browser workflows

Chromium owns the complete matrix:

- protected customer deep link → password login → restored route → visible customer/property/quote/bind/policy/finance → logout → denied revisit;
- accepted-but-response-lost bind → visible retry → exactly one policy/projection/ledger result;
- Viewer navigation and all direct CRM routes denied before protected API work;
- two independently authenticated tenant contexts sharing one scenario runtime, with foreign reads and mutations denied;
- visible allocated-deposit and settled-premium refunds with eligible commission correction.

Cancellation and commission payment have no reference UI controls and remain explicit browser exclusions with deterministic service evidence. The cross-browser invariant smoke is tagged `@proofline-smoke`. Default discovery contains the full Chromium suite only. `PROOFLINE_CROSS_BROWSER=1` adds Firefox/WebKit projects filtered to that one smoke identity; it never schedules recovery, tenant, refund, or other full golden tests on optional browsers.

## Completion gate

Use the Homebrew Node path in this repository and pin the review-clean comparison base for the entire command:

```bash
export PATH=/opt/homebrew/bin:$PATH
export IMPACT_BASE=<trusted-review-clean-base>
export IMPACT_HEAD=HEAD
pnpm lint && pnpm typecheck && pnpm harness:validate && pnpm test:impacted -- --dry-run && pnpm test:impacted && pnpm test && pnpm e2e && pnpm coverage && pnpm coverage:check && pnpm record:check && pnpm proofline:check-production && git diff --check
```

CI checks out full history, supplies explicit base/head authority, runs the same deterministic Node/shell/JSON gates, and never invokes an agent or model. Chromium is mandatory. An opt-in workflow input installs Firefox/WebKit and runs only the smoke projects. Playwright retries aid diagnostics, but `failOnFlakyTests` makes a retry-pass fail CI.

CI retains `artifacts/harness/`, `artifacts/impact/`, `artifacts/record/`, `artifacts/coverage/`, production output/module manifests, unit/browser logs, `playwright-report/`, and `test-results/` under `always()`. Failures retain trace, screenshot, video, and network/route diagnostics for review.
