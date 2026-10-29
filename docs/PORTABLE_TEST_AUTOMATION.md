# Portable test automation

Proofline is a repository-native Node/shell/JSON harness. Agents may author tests and review ownership before merge, but CI executes only deterministic commands. It never calls an agent, model, hosted prompt, or provider credential. A future Codex or Cursor skill/plugin can consume the same manifest, JSONL history, commands, and artifacts; that integration is not required to run the harness.

## Adapt a target repository

Apply the portable core in this order:

1. Inventory workspaces, routes, authentication and role boundaries, tenant/workspace behavior, API seams, test runners, and build entrypoints.
2. Inventory business rules, state transitions, side effects, recovery/idempotency behavior, and every external provider or egress plane.
3. Create `proofline.harness.json` with structured canonical commands, workspace membership, adapters, coverage groups, exact ownership/test bindings, a lifecycle matrix (or `null` for a stateless target), and a golden workflow matrix.
4. Implement a deterministic scenario adapter plus the golden rows. Each row declares adapter-only setup, user-performed UI actions, expected URL transitions, accessible visible assertions, and persisted invariants inspected only after the visible outcome. The adapter may establish fixtures and inspect invariants; it must not perform an in-scope user action.
5. Put rule permutations, contracts, authority, retries, and recovery in focused deterministic tests. Keep Playwright for a small set of visible, navigated workflows.
6. Append execution evidence and run selection diagnostics followed by every canonical full gate.

Lifecycle matrices make transitions reviewable even when generation is unnecessary. Stateless targets set `lifecycleMatrix` to `null`. State-model generation is intentionally parked: a target may add service-level generated transition tests when its matrix becomes too large to maintain by hand, without generating the default browser suite.

## Test-only and egress boundary

The production app and test app are separate build entrypoints. The test launcher generates a fresh random startup capability, passes it to a loopback-only server, and the server refuses missing, incorrect, or replayed capabilities. Test API, fake authentication, seeded identities, and provider fakes must be absent from production module/route manifests; `pnpm proofline:check-production` proves this negative boundary.

The runner, guarded server/runtime, BrowserContext, page, dedicated worker, service-worker policy, WebSocket plane, and configured provider SDKs deny undeclared egress. Only manifest-declared loopback origins and deterministic provider fakes are allowed. Scenario installation happens before navigation, and cleanup asserts that no unexpected request was silently accepted.

The reference authentication fixture rotates and revokes opaque **access tokens**. Its returned `refreshToken` is only a reference-client capability marker that permits the client to attempt access-token refresh; it is not an independently authenticated refresh credential. Modeling an independent refresh-credential protocol remains deferred because it would require coordinated production client, mock/session API, scenario authority, replay, logout, and reset changes outside the portable-harness acceptance.

## Selection, coverage, and evidence

Impact selection records the requested and resolved base/head plus the unique merge base in `artifacts/impact/manifest.json`. `selection.json` contains exact discovered identities and machine-readable reasons. Literal dynamic-import reasons retain the importer, literal specifier, resolved target, and target owner. Missing history, configuration changes, structural changes, stale or ambiguous bindings, unsupported dynamic imports, or missing ownership trigger the canonical-full fallback; the full CI gates remain authoritative even when selection is narrow.

Coverage groups declare compatible source globs, exact exclusions, report format, aggregation, producer command, adapter, provider, and installed provider version. The merge-base manifest and baseline are immutable comparison authority. Every critical metric is monotonic in ordinary changes. `artifacts/coverage/ratchet.json` records measurements and failures.

`test-impact/execution-record.jsonl` is append-only. Each line uses repository-relative scopes/artifacts and records real outcomes, including failures and review decisions. `pnpm record:check -- --base <trusted-base> --head <head>` proves byte-exact merge-base prefix preservation, schema validity, one trailing LF, new evidence for every changed governed path, generated rule parity, and the command-table parity below. Old or unrelated records cannot authorize a new change.

## Canonical command contract

This table is generated from the final `proofline.harness.json` command map. `pnpm record:check` parses it and requires each key, working directory, optional runner, and exact argv exactly once, with no stale rows. Callers must use these structured argv values; aliases are not parity.

<!-- proofline-canonical-commands:start -->
| Command key | Working directory | Runner | Exact argv (JSON) |
| --- | --- | --- | --- |
| lint | . |  | ["pnpm","lint"] |
| typecheck | . |  | ["pnpm","typecheck"] |
| unit | . |  | ["pnpm","test"] |
| browser | . |  | ["pnpm","e2e"] |
| coverage | . |  | ["pnpm","coverage"] |
| coverageCheck | . |  | ["pnpm","coverage:check"] |
| recordCheck | . |  | ["pnpm","record:check"] |
| buildProduction | . |  | ["pnpm","build"] |
| buildTest | . |  | ["pnpm","build:test"] |
| checkProduction | . |  | ["pnpm","proofline:check-production"] |
| testEntrypoint | . |  | ["node","tools/proofline/run-guarded.mjs","--test-app","--allow-origin","http://127.0.0.1","--","node","tools/proofline/serve-test-app.mjs","--directory","dist/crm-web-test","--port","0"] |
| browserScenario | . | playwright | ["pnpm","exec","playwright","test","--config","apps/crm-e2e/playwright.config.ts","apps/crm-e2e/src/fixtures/scenario-contract.spec.ts","--project","chromium","--workers=2"] |
| browserScenarioShard1 | . | playwright | ["pnpm","exec","playwright","test","--config","apps/crm-e2e/playwright.config.ts","apps/crm-e2e/src/fixtures/scenario-contract.spec.ts","--project","chromium","--shard=1/2"] |
| browserScenarioShard2 | . | playwright | ["pnpm","exec","playwright","test","--config","apps/crm-e2e/playwright.config.ts","apps/crm-e2e/src/fixtures/scenario-contract.spec.ts","--project","chromium","--shard=2/2"] |
<!-- proofline-canonical-commands:end -->

The selected-run entrypoints are `pnpm test:impacted -- --dry-run --base <base> --head <head>` and `pnpm test:impacted -- --base <base> --head <head>`. They are selector operations around the registered manifest commands rather than additional canonical command keys.

## Browser matrix and artifacts

Chromium runs the complete reference suite. With `PROOFLINE_CROSS_BROWSER=1`, Firefox and WebKit are added with `grep: /@proofline-smoke/`; each runs only the invariant protected-link/login/restoration/navigation/mutation/logout/denied-revisit smoke. The full recovery, tenant, refund, and golden journeys stay Chromium-only. Local Firefox/WebKit evidence requires installed Playwright binaries; the Task 7 run retained the missing-binary limitation instead of claiming a pass.

The implemented reference rows are flagship intake/bind/finance/logout, accepted-response-lost bind recovery, role denial, two-context shared-runtime tenant isolation, and visible refund/correction. Cancellation and commission payment remain explicitly excluded browser operations with service-layer evidence until visible controls exist.

CI retains harness, impact, record, coverage, production module manifests, full-unit/browser logs, Playwright HTML, traces, screenshots, videos, and `test-results/` under `always()`. A controlled failure verifies these are real usable outputs. The completion authority is the full lint, typecheck, manifest, selected dry-run/execution, Vitest, Chromium, coverage/ratchet, record, production-negative, and diff-check chain with explicit revision authority.
