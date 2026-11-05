# Portable test automation

Proofline is a repository-native Node/shell/JSON harness. Agents may author tests and review ownership before merge, but CI executes only deterministic commands. It never calls an agent, model, hosted prompt, or provider credential. A future Codex or Cursor skill/plugin can consume the same manifest, JSONL history, commands, and artifacts; that integration is not required to run the harness.

## Adapt a target repository

Apply the portable core in this order:

1. Inventory workspaces, routes, authentication and role boundaries, tenant/workspace behavior, API seams, test runners, and build entrypoints.
2. Inventory business rules, state transitions, side effects, recovery/idempotency behavior, and every external provider or egress plane.
3. Create `proofline.harness.json` with structured canonical commands, workspace membership, adapters, coverage groups, exact ownership/test bindings, a lifecycle matrix (or `null` for a stateless target), and a golden workflow matrix. Declare `execution.unitBuildCommands`, `unitTargets`, `browserBuildCommands`, and `browserArgs`, plus `production.directory` and target-owned `forbiddenModules`. Canonical execution requires these fields and uses no CRM/Nx defaults.
4. Implement a deterministic scenario adapter plus the golden rows. Each row declares adapter-only setup, user-performed UI actions, expected URL transitions, accessible visible assertions, and persisted invariants inspected only after the visible outcome. The adapter may establish fixtures and inspect invariants; it must not perform an in-scope user action.
5. Put rule permutations, contracts, authority, retries, and recovery in focused deterministic tests. Keep Playwright for a small set of visible, navigated workflows.
6. Append execution evidence and run selection diagnostics followed by every canonical full gate.

Lifecycle matrices make transitions reviewable even when generation is unnecessary. Stateless targets set `lifecycleMatrix` to `null`. State-model generation is intentionally parked: a target may add service-level generated transition tests when its matrix becomes too large to maintain by hand, without generating the default browser suite.

## Test-only and egress boundary

The production app and test app are separate build entrypoints. The test launcher generates a fresh random startup capability, passes it to a loopback-only server, and the server refuses missing, incorrect, or replayed capabilities. Test API, fake authentication, seeded identities, and provider fakes must be absent from production module/route manifests; `pnpm proofline:check-production` proves this negative boundary.

Canonical Vitest/Playwright processes enter through the manifest-declared runner egress adapter before test modules load. Runner fetch, HTTP(S), WebSocket, and inherited child egress are denied. Child authority binds an exact executable to a reviewed purpose and argv pattern; pnpm, Nx, Vitest, Playwright, browser, video, transform, and local Git children all receive the immutable preload and guard policy even when a caller supplies an empty environment. Arbitrary wrapper execution, nested package-manager commands, loaders, inspectors, shell commands, and positional browser URLs are rejected before dispatch. Guarded server/runtime, BrowserContext, page, dedicated worker, service-worker policy, WebSocket, and configured provider SDK planes remain separate. Git admits only filter-free object and metadata operations, with system/global configuration excluded and hooks, signing, pagers, fsmonitor, and lazy fetching disabled. Worktree change detection hashes raw file bytes in Node; transformed files may conservatively appear modified, and renames retain both paths as deletion/addition evidence. Git 2.48 or newer is required by the fail-closed `--no-lazy-fetch` launch option. Only manifest-declared loopback origins and deterministic provider fakes are allowed. Scenario installation happens before navigation, and cleanup asserts that no unexpected request was silently accepted.

The reference authentication fixture rotates and revokes opaque **access tokens**. Its returned `refreshToken` is only a reference-client capability marker that permits the client to attempt access-token refresh; it is not an independently authenticated refresh credential. Modeling an independent refresh-credential protocol remains deferred because it would require coordinated production client, mock/session API, scenario authority, replay, logout, and reset changes outside the portable-harness acceptance.

## Selection, coverage, and evidence

Impact selection records the requested and resolved base/head plus the unique merge base in `artifacts/impact/manifest.json`. A browser workspace declares one `browserDiscoveryCommand` used for discovery and exact execution; scenario worker/shard commands remain in `browserCommands` and therefore in canonical-full. `selection.json` contains exact discovered identities and machine-readable reasons. Literal dynamic-import reasons retain the importer, literal specifier, resolved target, and target owner. Missing history, configuration changes, structural changes, stale or ambiguous bindings, unsupported dynamic imports, or missing ownership trigger the canonical-full fallback; the full CI gates remain authoritative even when selection is narrow.

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
| browserScenario | . | playwright | ["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","apps/crm-e2e/playwright.config.ts","apps/crm-e2e/src/fixtures/scenario-contract.spec.ts","--project","chromium","--workers=2"] |
| browserScenarioShard1 | . | playwright | ["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","apps/crm-e2e/playwright.config.ts","apps/crm-e2e/src/fixtures/scenario-contract.spec.ts","--project","chromium","--shard=1/2"] |
| browserScenarioShard2 | . | playwright | ["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","apps/crm-e2e/playwright.config.ts","apps/crm-e2e/src/fixtures/scenario-contract.spec.ts","--project","chromium","--shard=2/2"] |
| portability | . |  | ["node","tools/proofline/validate-portability.mjs"] |
<!-- proofline-canonical-commands:end -->

The selected-run entrypoints are `pnpm test:impacted -- --dry-run --base <base> --head <head>` and `pnpm test:impacted -- --base <base> --head <head>`. They are selector operations around the registered manifest commands rather than additional canonical command keys.

## Required execution and preserved diagnostics

Test discovery establishes applicability before execution. Guarded Vitest and Playwright commands retain native reports and reconcile expected identities with actual outcomes. A required identity must execute exactly once with the applicable project and genuinely pass. Runtime skip/fixme, expected-failure substitution, retries, duplicate/missing outcomes, malformed evidence, or an omitted canonical unit target cannot satisfy the requirement. Vitest additionally records native task events because its JSON reporter alone omits expected-failure/retry/project details. A native API shim checks the effective coverage configuration before provider cleanup; report destinations cannot overlap or contain the protected execution root. V8/Istanbul providers are supported; unsupported custom providers fail closed. Canonical unit verifies an aggregate across its explicit targets; subset and shard commands retain their actual applicability.

Each executing command allocates a unique directory under `artifacts/proofline/runs/`. It contains discovery, native results, verification, stdout/stderr and browser report/media. The generated `artifacts/proofline/execution-index.jsonl` links verification files by SHA256. Later commands preserve earlier failed-command files. CI uploads the complete execution root even after failure. Optional tooling capabilities are admitted only when the executable is installed; a non-Nx target does not require Nx.

Verification binds source commit, execution session, repository/workflow, CI run/attempt, gate key/execution ID, scope, project/worker/shard metadata, and child references. Complete gates cannot be assembled from unrelated passing records or stale same-commit runs. This generated index is separate from the authored append-only `test-impact/execution-record.jsonl`.

## Independent application validation

`pnpm proofline:validate-portability` prepares an unrelated work-order application in a fresh Git repository outside the host checkout. It copies the reusable core byte-for-byte and supplies target-owned manifest, rules, auth/API seams, configs and tests. Dependencies are reused offline from the existing installation; the result records the actual tested versions.

The target proves request-to-completed navigation, dispatcher/observer permissions and organization isolation, then runs exact discovery/selection, canonical full unit/browser, compatible coverage ratchets, append-only evidence and production-negative checks. Target files live in `examples/work-orders`; they import no CRM application code. Results are retained under `artifacts/portability`. This demonstrates the recorded compatibility scope, rather than every React/Vite version or deployment environment.

## Release verification

The verification workflow publishes a deployable production bundle only after its complete required gate set passes, including standalone portability, multi-worker scenarios and both scenario shards. The bundle retains Vercel Build Output, a strict file inventory, source/run/attempt identity, gate outcomes and the referenced execution evidence.

Published-release deployment uses verifier tooling from the trusted default branch and resolves the tag to an immutable commit. It requires the corresponding successful same-repository push/main verification run and exact non-expired artifact, verifies the archive digest before safe extraction, then checks every inventory member and current-run complete gate reference. Wrong commits, workflows, attempts, missing gates, stale evidence, unsafe paths, symlinks and tampered files fail closed. Deployment uses the verified prebuilt output; it does not rebuild application source. Deterministic tests validate this policy with offline fixtures; they never call the deployment provider.

## Browser matrix and artifacts

Chromium runs the complete reference suite. With `PROOFLINE_CROSS_BROWSER=1`, Firefox and WebKit are added with `grep: /@proofline-smoke/`; each runs only the invariant protected-link/login/restoration/navigation/mutation/logout/denied-revisit smoke. The full recovery, tenant, refund, and golden journeys stay Chromium-only. Local Firefox/WebKit evidence requires installed Playwright binaries; the Task 7 run retained the missing-binary limitation instead of claiming a pass.

The implemented reference rows are flagship intake/bind/finance/logout, accepted-response-lost bind recovery, role denial, two-context shared-runtime tenant isolation, visible refund/correction, and cross-browser smoke. Each implemented row names exact discovered Playwright evidence and its rule IDs; each bound spec consumes that contract through the shared workflow helper. Cancellation and commission payment remain explicitly excluded browser operations with service-layer evidence until visible controls exist.

CI retains harness, impact, record, coverage, production module manifests, full-unit/browser logs, Playwright HTML, traces, screenshots, videos, and `test-results/` under `always()`. A controlled failure verifies these are real usable outputs. The completion authority is the full lint, typecheck, manifest, selected dry-run/execution, Vitest, Chromium, coverage/ratchet, record, production-negative, and diff-check chain with explicit revision authority.

## Measurement scope

The existing critical coverage thresholds are unchanged. New helper thresholds start at the whole-percent floor of their measured V8 counters. The native execution shim and reporter execute in child processes and remain zero in the parent coverage report; real child-process regressions separately prove their behavior. These explicit measurement limits do not imply whole-product or browser coverage. The standalone lifecycle runtime has its own fixed 100% four-metric baseline.
