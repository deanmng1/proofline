# Broad final repair round 1 report

Base: `3f7e1e4d4f74c4ec796601766a730ae0ac394b51`

## Result

The Critical canonical-runner egress finding, both Important findings, and the controller-ruled identity-registry Minor are implemented and verified. The tracked tree is clean apart from the pre-existing untracked `.codex/` directory. This repair does not perform the independent broad re-review or the controller-owned final two-pass completion gate.

Implementation commits:

- `a115e7b` — `fix: enforce guarded runners and executable workflow evidence`
- `f56dcf9` — `fix: supply deterministic scenario rule evidence`
- `c242a0d` — `fix: bind scenario rule evidence into harness ownership`
- `f73313c` — `fix: ignore in-flight scenario evidence files`
- `b1d0f4e` — `chore: record broad final repair evidence`

## Architecture

### Canonical runner egress

`tools/proofline/canonical-runner.mjs` is now the repository's executable Vitest and Playwright boundary. Root `pnpm test`, root `pnpm e2e`, all eleven Nx coverage targets, impact discovery/execution, and the scenario worker/shard commands enter through it. The runner resolves the repository-local Vitest and Playwright CLIs and calls the existing reviewed `withProoflineGuard` API with structured argv, `shell: false`, the guard preload, and exact child capabilities.

The canonical runner admits only reviewed local tools and exact installed browser/transform executables. Git remains restricted by the guard's safe-argument policy; nested preload replacement remains rejected. Playwright browser processes, its pinned ffmpeg helper, esbuild, Nx, pnpm, Vitest, and the test-app launcher continue to work without granting wildcard origins. Runner fetch, HTTP, HTTPS, WebSocket, and inherited-child network requests are denied before dispatch. BrowserContext routing and the guarded test-app server remain independent defense planes.

The unit integration probe enters through the real root `pnpm test` path; the browser probe enters through the real root `pnpm e2e` path. Each binds an otherwise reachable loopback server, exercises all five runner planes, and asserts zero server hits. Static governance binds every canonical test and coverage path to `canonical-runner.mjs` so future direct Vitest/Playwright bypasses fail.

### Exact impact discovery

The harness schema now separates `browserDiscoveryCommand` from `browserCommands`. Each browser-owning workspace has exactly one discovery/exact-execution adapter, `browser`, while `browserScenario`, `browserScenarioShard1`, and `browserScenarioShard2` remain required canonical-full gates. `plansFor()` consumes the explicit discovery role instead of rejecting the full-gate commands as ambiguous.

`real-manifest-selection.test.ts` loads the checked-in manifest, performs actual Vitest and Playwright discovery, creates a controlled owned-source change, revalidates the checked-in static title against runner output, selects one exact Vitest and one exact Playwright identity without fallback, and executes both identities. Separate regressions retain fail-closed canonical-full broadening for ambiguity or configuration changes.

### Executable workflow evidence

The workflow schema now requires every `implemented` row to contain exact evidence with row ID, canonical command key, file, line, title, tag, and an exact rule-ID set. Harness validation compares those bindings to actual Playwright discovery and rejects absent, stale, ambiguous, undiscovered, wrong-row, wrong-rule, and line/title metadata drift. Excluded rows remain service-owned and carry no browser evidence.

`apps/crm-e2e/src/proofline/workflow-matrix.ts` reads the checked-in matrix and every bound spec calls `bindWorkflowEvidence()` with its row and rule IDs. This runtime link rejects a row/rule/title/line/tag mismatch before the workflow executes. The recovery row now describes an unauthenticated scenario followed by visible form login. Tenant isolation no longer claims browser retry-state behavior; retry isolation is bound to deterministic scenario evidence instead. Scenario-rule evidence files are written atomically, and the evidence reader considers only completed `.json` files so concurrent shards cannot observe an in-flight temporary file.

### Identity registry rollback

Scenario identity claims now use a pending reservation with a reference count. Validation checks committed and pending definitions, concurrent same-definition setup is allowed, and a conflicting concurrent definition fails. A definition is committed only after BrowserContext creation and fixture installation succeed. A failed setup releases only its own pending reservation and closes/removes only its own context. The corrected retry therefore succeeds, while successful identities retain conflicting-redefinition protection.

## Workflow row linkage

| Row | Exact Playwright evidence | Rule IDs |
| --- | --- | --- |
| `protected-intake-bind-finance-logout` | `apps/crm-e2e/src/proofline/golden-workflow.spec.ts:6` — `completes_the_unauthenticated_deep_link_to_policy_finance_logout_journey` | `AUTH-001`, `POL-001`, `API-002`, `FIN-001` |
| `recoverable-bind` | `apps/crm-e2e/src/proofline/recovery-and-authority.spec.ts:12` — `recovers_an_accepted_bind_without_duplicate_policy_or_ledger` | `UI-001`, `POL-001`, `API-002` |
| `role-denied-navigation` | `apps/crm-e2e/src/proofline/recovery-and-authority.spec.ts:132` — `denies_crm_navigation_and_direct_routes_for_viewer` | `AUTH-001`, `API-001` |
| `tenant-isolation` | `apps/crm-e2e/src/proofline/recovery-and-authority.spec.ts:52` — `denies_cross_tenant_read_and_mutation_in_a_shared_runtime` | `TEN-001`, `API-001` |
| `visible-refund-correction` | `apps/crm-e2e/src/features/commission-refund.spec.ts:38` — `commission corrections > @commission @finance @refund allocations reverse only selected settled premium commission` | `COM-002`, `COM-003`, `FIN-003`, `FIN-004` |
| `cross-browser-smoke` | `apps/crm-e2e/src/proofline/cross-browser-smoke.spec.ts:5` — `runs_the_cross_browser_invariant_smoke @proofline-smoke` | `AUTH-001` |
| `cancellation-and-commission-payment` | Excluded; deterministic service evidence only | `POL-003`, `COM-005` |

## TDD evidence

RED evidence retained:

- `red-canonical-unit.log`: root canonical unit runner reached the undeclared probe before preload integration.
- `red-canonical-browser.log`: root canonical browser runner reached the undeclared probe before preload integration.
- `red-unit-runner.log` and `red-trusted-local-tools.log`: direct/broad runner orchestration and child authority were not yet governed.
- `red-coverage-runner-governance.log`: coverage targets still invoked Vitest directly.
- `red-golden-schema.log`: implemented rows lacked executable evidence validation.
- `red-identity-rollback.log`: post-validation setup failure poisoned a later corrected identity retry.

Final GREEN evidence retained:

- `green-canonical-unit-final-2.log` and `green-canonical-browser-final.log`
- `green-real-exact-selection-final.log`
- `green-focused-final.log`, `green-golden-runner.log`, and `green-identity-registry.log`
- `green-scenario-workers-final.log`, `green-scenario-shard-1-final.log`, `green-scenario-shard-2-final-2.log`, and `green-shard-2-atomic-evidence.log`
- `green-impacted-exact-dry-run-final-2.log` and `green-impacted-exact-execution-final-2.log`
- `green-impacted-canonical-full-dry-run-final.log` and `green-impacted-canonical-full-execution-final.log`
- `green-full-coverage-final-head.log` and `green-coverage-ratchet-final-head.log`
- `green-final-governance.log`

Failed attempts are retained under `failed-*.log`, not represented as GREEN. They record the direct coverage-runner bypass, insufficient child capability sets, nested-preload contract regression, partial scenario evidence race, interrupted exact-impact attempts, and the final governance attempt made with the wrong system Node. Each root cause was repaired and rerun to a distinct final GREEN log.

## Exact verification

All commands below ran with `PATH=/opt/homebrew/bin:$PATH`.

- `pnpm test` — passed all eleven Nx unit targets through the guarded canonical runner. Current final-head coverage reran the same guarded target commands.
- `pnpm e2e` — passed 43 Chromium tests, including the canonical browser runner egress integration.
- `pnpm exec vitest run tools/impact/src/real-manifest-selection.test.ts` — passed 2 repository-level real-manifest tests, including exact selected execution.
- Controlled `pnpm test:impacted -- --dry-run --base <controlled-base> --head <controlled-head>` — fallback `none`, command keys `unit` and `browser`, one exact Vitest identity and one exact Playwright identity.
- Controlled `pnpm test:impacted -- --base <controlled-base> --head <controlled-head>` — executed exactly the selected Vitest and Playwright identities with fallback `none`.
- `pnpm test:impacted -- --dry-run --base HEAD --head HEAD` after a controlled manifest-only newline — fallback `canonical-full` with unit, browser, two-worker scenario, and both shard gates.
- `pnpm test:impacted -- --base HEAD --head HEAD` under the same controlled configuration change — exited 0 after the guarded unit targets, 43 browser tests, 24 scenario-contract tests with two workers, 12 shard-one tests, and 12 shard-two tests. The controlled manifest newline was restored immediately afterward.
- `pnpm exec playwright test --config apps/crm-e2e/playwright.config.ts apps/crm-e2e/src/fixtures/scenario-contract.spec.ts --project=chromium --workers=2` — 24 passed.
- The same scenario command with `--shard=1/2` and `--shard=2/2` — 12 passed per shard. The shard-two atomic-evidence rerun also passed 12.
- `pnpm coverage` — passed all eleven projects. Every Vitest process entered through `canonical-runner.mjs`; the impact suite passed 9 files/129 tests and Proofline passed 4 files/27 tests.
- `pnpm coverage:check -- --base 3f7e1e4d4f74c4ec796601766a730ae0ac394b51 --head HEAD` — passed all eight manifest source groups.
- `pnpm rules:generate` — passed with no tracked drift.
- `pnpm harness:validate` — passed with no validation errors.
- `pnpm record:check -- --base 3f7e1e4d4f74c4ec796601766a730ae0ac394b51 --head HEAD` — append-only prefix, record schema, and governed changed-path scopes passed.
- `pnpm lint` — checked 278 files with no fixes.
- `pnpm typecheck` — all eleven Nx targets passed.
- `pnpm build` and `pnpm build:test` — both CRM builds passed.
- `pnpm proofline:check-production` — production artifact contained no test-only capabilities.
- `git diff --check 3f7e1e4d4f74c4ec796601766a730ae0ac394b51..HEAD` — passed.

## Records and generated state

`test-impact/execution-record.jsonl` was extended by one append-only event, `2026-10-29.final-repair-1-implementation`, in commit `b1d0f4e`. The event scopes every governed repair path, cites the retained evidence directory and this report, and records the pinned-base coverage and exact canonical execution results. Existing JSONL bytes were not rewritten. Rules generation, workflow metadata, coverage baselines, and the harness manifest are reconciled.

## Limitations

- V8 reports `canonical-runner.mjs` at zero because it executes the real Vitest/Playwright processes as guarded external children. Its behavior is covered by canonical-path integration tests and static command governance rather than misleading in-process line attribution; the zero baseline is explicit and ratcheted.
- Playwright child capability discovery is intentionally tied to exact locally installed browser, headless-shell, ffmpeg, and esbuild executables. An unsupported or missing executable fails closed and requires a reviewed capability update.
- The scenario's `refreshToken` remains a refresh-capability marker. An independently authenticated refresh credential remains the previously accepted, explicit deferral.
- Expected-failure teardown tests display Playwright's failure glyph for the intentionally rejected inner test, while their enclosing suite exits zero. Final evidence is classified by the process exit and passed summary.
- Independent broad acceptance re-review and the controller-owned final two-pass completion gate remain pending by instruction.

---

# Broad final repair round 2

Repair base: `b1d0f4ede54a5f2d266ab4d45aada35c4c875afc`
Pinned governance base: `3f7e1e4d4f74c4ec796601766a730ae0ac394b51`

## Result

The scoped re-review's remaining Critical child-wrapper escape and Important TEN-001 retry-evidence finding are repaired. This section supersedes round 1's statement that tenant retry isolation was already bound to deterministic scenario evidence: the browser wording had been corrected, but the exact pending-delivery runtime identity was still absent until this round.

Implementation commits:

- `2555674` — `fix: constrain guarded child capabilities`
- `ced09e0` — `test: cover strict child capability shape`
- `ccdec1e` — `chore: record final repair round 2 evidence`

## Structured child capabilities

The guard no longer trusts an executable name or realpath by itself. Every admitted non-Node child is an exact realpath plus one reviewed purpose, and the purpose selects a strict argv validator:

- `pnpm-runner` accepts only `exec vitest run`, `exec playwright test`, and the two exact CRM Nx build targets.
- `nx-build` accepts only the exact production/test CRM builds with `--skip-nx-cache`.
- `vitest-cli` and `playwright-cli` require their reviewed `run`/`test` verbs and reject loader, preload, inspector, arbitrary command, and code-generation modes.
- `playwright-browser` accepts only reviewed Chromium, Firefox, or WebKit launch contracts. Chromium requires Playwright's pipe and owned profile and rejects positional URLs or unknown flags.
- `playwright-ffmpeg` accepts only Playwright's exact WebM recording shape.
- `esbuild-service` accepts only the versioned service and ping arguments.
- `git-local` retains local-only subcommands. The guard forces `core.hooksPath=/dev/null` into every child environment and rejects a caller-supplied hook-path override, preventing an admitted local commit from executing repository code.

Every admitted `spawn`, `spawnSync`, `execFile`, and `execFileSync` child receives the immutable origin, capability, preload, and `NODE_OPTIONS` policy. Direct Node/fork descendants retain the existing safe-argv preload contract. A stripped caller environment therefore cannot remove the guard before an allowed wrapper creates a descendant.

The permanent canonical-path adversarial regression enters through the real guarded Vitest process. It rejects stripped-environment `pnpm exec node`, nested `pnpm exec pnpm exec node`, Nx `exec`, Playwright `codegen`, and Vitest inspector attempts before dispatch. It also proves the reviewed `pnpm exec vitest run` path remains usable while the descendant's undeclared fetch is denied and the probe receives zero hits. Existing production-negative, full browser, scenario, coverage, build, ffmpeg, esbuild, and package-manager paths prove required capabilities remain functional.

## TEN-001 retry-state evidence

`TEN-001` now binds the exact deterministic runtime identity:

`packages/insurance-runtime/src/runtime.test.ts:606` — `insurance runtime > rejects_foreign_quote_references_without_draining_another_tenants_pending_delivery`

The binding is present in the rule registry and in every manifest ownership scope that carries TEN-001 (`insurance-runtime`, `finance-service`, `policy-state-service`, and `api-contracts`). The generated catalog is reconciled. The test creates tenant A's failed pending delivery, attempts foreign tenant B work, and proves the foreign operation neither observes nor drains tenant A's retry state.

The `tenant-isolation` golden row continues to claim only the visible browser customer/property/quote/bind/finance and cross-tenant denial flow. Its persisted invariant now explicitly links TEN-001's separate deterministic runtime proof. It does not claim that the browser test creates pending retry state.

## RED and GREEN evidence

Retained RED:

- `round-2-red-wrapper-escape-final.log` — actual canonical Vitest path launched stripped-environment `pnpm exec node`; the child exited zero and the undeclared loopback server received one hit.
- `round-2-red-git-hook.log` — the old Git policy accepted a caller hook-path override. The same log also contains a system-Node WebSocket capability mismatch, so only the Git assertion is used as the RED.
- `round-2-failed-coverage-ratchet.log` — the first pinned ratchet correctly rejected new `guard-policy.mjs` branches at 79.10% versus the 79.41% baseline.
- `round-2-failed-focused-stale-binding.log` and `round-2-failed-lint-format.log` — retained intermediate stale-line and formatting failures. They are not classified as GREEN.

Final GREEN:

- `round-2-green-focused-final.log` — 6 files, 76 tests passed, including the canonical adversarial escape, strict capability shape/hook regressions, TEN-001 runtime test, manifest validation, and production-negative paths.
- `round-2-green-canonical-unit.log` — exact `pnpm test` passed all eleven unit targets through the canonical runner.
- `round-2-green-canonical-browser-final-3.log` — exact `pnpm e2e` exited 0 with 43 Chromium tests passed.
- `round-2-green-scenario-workers.log`, `round-2-green-scenario-shard-1.log`, and `round-2-green-scenario-shard-2.log` — 24 two-worker tests and 12 tests in each shard passed.
- `round-2-green-impact-exact.log` — real manifest discovery/selection and exact Vitest/Playwright execution passed 2 tests.
- `round-2-green-impact-dry-run.log` — clean-head real dry-run discovered successfully with fallback `none`.
- `round-2-green-coverage-final.log` and `round-2-green-coverage-check-final.log` — all eleven coverage targets passed and the pinned ratchet passed all eight source groups after the new policy-branch regression.
- `round-2-green-build-production.log`, `round-2-green-build-test.log`, and `round-2-green-production-audit.log` — both builds and the production artifact audit passed.
- `round-2-green-governance.log` and `round-2-green-record-check.log` — rules, harness, lint, eleven typechecks, append-only record governance, and diff checks passed.

## Exact verification

All commands used `PATH=/opt/homebrew/bin:$PATH`.

- `node tools/proofline/canonical-runner.mjs vitest run tools/proofline/src/canonical-runner-egress.test.ts tools/proofline/src/egress-guard.test.ts tools/proofline/src/product-e2e-boundary.test.ts tools/proofline/src/production-negative.test.ts packages/insurance-runtime/src/runtime.test.ts tools/impact/src/harness-manifest.test.ts` — 6 files, 76 tests passed.
- `pnpm test` — exited 0; all eleven unit targets passed.
- `pnpm e2e` — exited 0; 43 Chromium tests passed.
- `node tools/proofline/canonical-runner.mjs playwright test --config apps/crm-e2e/playwright.config.ts apps/crm-e2e/src/fixtures/scenario-contract.spec.ts --project chromium --workers=2` — 24 passed.
- The same command with `--shard=1/2` and `--shard=2/2` — 12 passed per shard.
- `node tools/proofline/canonical-runner.mjs vitest run tools/impact/src/real-manifest-selection.test.ts` — 2 passed, including exact selected execution.
- `pnpm test:impacted -- --dry-run --base HEAD --head HEAD` — exited 0 with fallback `none` and no selected identities for a clean head.
- `pnpm coverage` — exited 0 after all eleven coverage targets; the final Proofline target includes 31 tests and exercises the added strict-shape branches.
- `pnpm coverage:check -- --base 3f7e1e4d4f74c4ec796601766a730ae0ac394b51 --head HEAD` — all eight source-group ratchets passed.
- `pnpm build`, `pnpm build:test`, and `pnpm proofline:check-production` — passed.
- `pnpm rules:generate`, `pnpm harness:validate`, `pnpm lint`, and `pnpm typecheck` — passed; typecheck completed all eleven targets.
- `pnpm record:check -- --base 3f7e1e4d4f74c4ec796601766a730ae0ac394b51 --head HEAD` — append-only governance passed.
- `git diff --check 3f7e1e4d4f74c4ec796601766a730ae0ac394b51..HEAD` — passed.

## Records and cleanup

`test-impact/execution-record.jsonl` has one append-only round-2 event, `2026-10-29.final-repair-1-round-2`, committed in `ccdec1e`. Existing bytes were not rewritten.

The earlier reviewer probe left a Chrome-for-Testing process tree and Playwright profile behind. It ignored a normal TERM grace period, so the exact orphaned PIDs were killed and their temporary profile removed before verification. After all final browser, coverage, and focused gates, `round-2-process-cleanup.log` records `matches=0` for Chrome-for-Testing, Playwright, canonical-runner, test-app server, and Proofline runner processes.

The tracked tree is clean; only the pre-existing untracked `.codex/` directory remains. The independent broad re-review and controller-owned final two-pass completion gate remain pending by instruction.

---

# Broad final repair round 3

Repair base: `ccdec1edc3d91aa6776c27493ca0e751fb657f6e`
Pinned governance base: `3f7e1e4d4f74c4ec796601766a730ae0ac394b51`

## Result

The remaining canonical-runner containment finding is repaired. Guarded descendants can no longer broaden installed origins or structured child capabilities through the public delegation marker, and the native Git capability accepts only exact reviewed full argv and an inert environment.

Implementation commit:

- `bbe46da8c934c906ad18f1b7019ae68879bf1d84` — `fix: make guarded child authority monotonic`

## Monotonic delegated authority

The initial unguarded `canonical-runner.mjs` establishes the runner policy through `withProoflineGuard`. Once the preload is installed, a nested canonical runner parses and propagates the installed origin and capability sets instead of creating new authority. An intercepted spawn that presents the reproducible delegated-policy symbol must supply origins and exact executable-plus-purpose capabilities that are subsets of the installed parent policy. Added origins or capabilities throw before native child dispatch. Ordinary child requests continue to receive the immutable parent policy, preload, and merged safe `NODE_OPTIONS`.

The canonical-path regression recreates `Symbol.for("proofline.egress-guard.delegated-policy")`. It separately tries to add the reachable probe origin and an `/bin/echo` `git-local` capability, requires both children to fail, and proves the server receives zero requests. The reviewed pnpm/Vitest descendant path remains usable, while its environment-gated fetch is denied before dispatch.

## Exact Git authority

`git-local` validates the complete argv shape for only the repository operations used by impact selection, governance, and their fixtures: init, add, commit, name-status diff, ls-files, ls-tree, merge-base, rev-parse, rm, show, status, update-ref, and the exact local shallow no-checkout clone. Revision and path arguments are constrained. Global options, unreviewed flags, `--ext-diff`, `--textconv`, `-c`, `--config-env`, paging, aliases, hooks, remote commands, and arbitrary paths fail before Git starts.

The guard removes ambient unsafe `GIT_*` variables and rejects caller Git config, external-diff, SSH, pager, editor, attributes, or related helper authority. Every admitted Git child receives forced inert configuration for hooks, signing, paging, and fsmonitor plus deterministic non-secret identity. Fixture repositories use allowed author/committer variables instead of command-line `-c` overrides.

The permanent external-helper regression attempts external diff, textconv, alias, config-env, paging, and SSH environment routes. Every attempt is rejected by the Node guard, and the executable helper's marker remains absent.

## TDD evidence

Retained RED:

- `round-3-red-containment.log` — the forged delegated-origin child exited zero under the prior policy, and the old Git policy failed the external-helper denial contract.

Final GREEN:

- `round-3-green-focused-final-3.log` — 6 files and 58 tests passed, including forged-policy denial, Git-helper denial, production-negative coverage, manifest governance, and real-manifest exact discovery/execution.
- `round-3-green-canonical-unit-final.log` — exact `pnpm test` passed all eleven canonical unit targets; Proofline passed 4 files and 34 tests.
- `round-3-green-canonical-browser-final.log` — exact `pnpm e2e` passed 43 Chromium tests.
- `round-3-green-scenario-workers-final.log`, `round-3-green-scenario-shard-1-final.log`, and `round-3-green-scenario-shard-2-final.log` — 24 two-worker tests and 12 tests in each shard passed.
- `round-3-green-coverage-final.log` and `round-3-green-coverage-check-final.log` — all eleven coverage targets passed and the pinned ratchet passed all eight source groups.
- `round-3-green-build-final.log`, `round-3-green-build-test-final.log`, `round-3-green-production-audit-final.log`, `round-3-green-lint-final.log`, `round-3-green-typecheck-final.log`, `round-3-green-harness-final.log`, and `round-3-green-impact-dry-run-final.log` — final static and artifact gates passed.
- `round-3-process-cleanup-final.log` — no Chrome-for-Testing, Playwright, canonical-runner, test-app, or related Proofline process remained.

Failed attempts remain classified as `round-3-failed-*.log`. They preserve the first nested subset-policy conflict, the transient discovery-file race, stale line bindings, and the rejected new-file coverage exclusion. The final design places the descendant egress probe in the pre-existing governed product-boundary test, so it creates neither discovery races nor a new coverage exclusion.

## Exact verification

All commands used `PATH=/opt/homebrew/bin:$PATH`.

- `node tools/proofline/canonical-runner.mjs vitest run tools/proofline/src/canonical-runner-egress.test.ts tools/proofline/src/egress-guard.test.ts tools/proofline/src/product-e2e-boundary.test.ts tools/proofline/src/production-negative.test.ts tools/impact/src/harness-manifest.test.ts tools/impact/src/real-manifest-selection.test.ts` — 6 files, 58 tests passed; the exact selected Playwright identity also passed.
- `pnpm test` — exited 0 across all eleven unit targets.
- `pnpm e2e` — exited 0 with 43 browser tests passed.
- `node tools/proofline/canonical-runner.mjs playwright test --config apps/crm-e2e/playwright.config.ts apps/crm-e2e/src/fixtures/scenario-contract.spec.ts --project chromium --workers=2` — 24 passed; the same command with `--shard=1/2` and `--shard=2/2` passed 12 each.
- `pnpm coverage` — exited 0 across all eleven guarded coverage targets; impact passed 9 files/129 tests and Proofline passed 4 files/34 tests.
- `pnpm coverage:check -- --base 3f7e1e4d4f74c4ec796601766a730ae0ac394b51 --head HEAD` — all eight source-group ratchets passed.
- `pnpm test:impacted -- --dry-run --base HEAD --head HEAD` — the governed configuration change failed closed to canonical-full and selected unit, browser, two-worker scenario, and both shard commands. Real-manifest exact discovery/execution passed in the focused repository test above.
- `pnpm rules:generate`, `pnpm harness:validate`, `pnpm lint`, and `pnpm typecheck` — passed; typecheck completed all eleven targets.
- `pnpm build`, `pnpm proofline:check-production`, and `pnpm build:test` — both builds passed and the production artifact contained no test-only capability.

## Limitations and handoff

The global delegation symbol remains reproducible by test code, but it conveys no widening authority: the installed parent sets are the ceiling, and only equal or narrower policy can pass. Initial canonical-runner loopback ports are reserved before the guarded child starts so real canonical tests can bind exact declared origins; the tests preserve manifest `--port 0` where ephemeral-port behavior is part of the product contract.

The independent broad re-review and controller-owned final two-pass completion gate remain pending by instruction.


---

# Broad final repair round 4

Repair base: `83c3012dcbf26b7c6843c3233c4941f5f5bedfc2`
Pinned governance base: `3f7e1e4d4f74c4ec796601766a730ae0ac394b51`
Implementation commit: `72f3ed4` — `fix: prevent native Git helpers in guarded tests`

## Native Git boundary

This round addresses only the remaining native Git configuration/helper escape. Round three's delegated-policy subset restriction remains unchanged, with its canonical forged-symbol regression retained. Round three's claim of complete inert Git configuration was too strong: an allowed `add` executed a repository clean filter, and the same conversion was reachable through ordinary worktree `diff`, including index-refresh/racy-stat paths.

The guard now admits no `add`, porcelain `commit`, `status`, `diff`, `show`, `rm`, `clone`, `write-tree`, or `update-index`. The last two were excluded after auditing index writes: even a plumbing index writer may revisit a racily clean entry and invoke conversion. Local clone was removed because its native transport is an external-program boundary.

Each admitted Git child uses the reviewed executable's exact realpath, a real absolute directory, no caller `argv0`, fully matched arguments, constrained revisions/object IDs/paths, and a sealed native environment. HOME, XDG, library-loader variables, caller PATH, and arbitrary environment values are not inherited. System/global configuration points to `/dev/null`; system attributes are disabled. Command-scope configuration overrides repository/worktree/included hooks, signing, pager, fsmonitor, attributes/excludes files, maintenance, automatic GC, and transport policy. Every invocation forces no paging, no lazy fetching, no replacement objects, and literal pathspecs. Unsupported Git versions fail before execution on the required `--no-lazy-fetch` option; adaptation documentation requires Git 2.48 or newer.

Repository/worktree configuration may still be parsed by Git. Safety does not depend on discovering and overriding filter names: no admitted operation processes worktree attributes or content through Git, and no admitted operation uses a diff/textconv/remote/credential/editor/alias display path. The remaining known configurable program boundaries are explicitly disabled.

| Retained operation | Complete admitted purpose and helper control |
| --- | --- |
| `init -q` | Adds empty template, fixed SHA-1 object format, files ref backend, and initial branch; no configured template is installed. |
| `hash-object -w --stdin --no-filters` | Writes supplied raw blob bytes; no worktree path or filter mode exists. |
| `mktree -z` | Constructs a tree from object records on stdin; no index or worktree refresh. |
| `commit-tree <oid> [-p <oid>] -m <message>` | Constructs an object; additionally forces `--no-gpg-sign`, with signing configuration false. |
| `update-ref HEAD/refs/heads/.../refs/remotes/... <oid>` | Updates a local ref; the reference-transaction hook path is inert. |
| Exact `ls-files` stage/cached/other listings | Reads index/untracked metadata only; fsmonitor is false and no modified/deleted/content-refresh mode is admitted. |
| Exact `ls-tree -r [--name-only] -z <revision>` | Reads tree metadata only. |
| Exact `rev-parse` / `merge-base --all` | Reads revisions/commit topology; lazy fetching and transports are disabled. |
| `cat-file blob <revision>:<path>` | Returns a typed raw blob; no polymorphic display, textconv, filter, or signature path. |

## Filter-free repository evidence and fixtures

`readRepositoryChanges()` in the existing governed `changed-files.ts` reads index/tree metadata and compares raw Git-blob hashes computed in Node. It records committed, staged, unstaged, mode, symlink, deletion, addition, and untracked changes. Unsupported/ambiguous index/tree entries or failed reads become uncertainty/gate errors. Renames conservatively retain both paths as deletion/addition evidence. Transformed worktree content may conservatively be reported modified; it is never passed through configured conversion programs. `readGovernedChanges()` consumes that same evidence, so record governance has no separate unsafe worktree-diff path. Historical JSON/text reads use typed `cat-file blob`.

The test-only `tools/impact/test-fixtures/git.ts` builds fixture blobs and trees through the restricted object operations and writes a valid SHA-1 v2 index directly in Node. It respects the fixture's tracked/untracked listing and ignores, preserves executable modes and symbolic links, and creates commits with an explicit parent. Shallow fixtures copy local bytes and write `.git/shallow`; fixture deletion uses Node filesystem calls. No fixture requires unsafe porcelain or index writers.

## Permanent covering tests and RED/GREEN evidence

- `tools/proofline/src/canonical-runner-egress.test.ts`: real canonical runner rejects the exact previously admitted `git add tracked.txt` despite local clean-filter configuration and `.gitattributes`; the helper marker stays absent. It ignores malformed HOME and XDG configuration, exercises all four intercepted child APIs with legitimate object/metadata operations under hostile repository/worktree/include configuration, rejects unsafe modes/env/cwd/argv0, and fails a missing promised blob without running a fetch/remote helper. Existing network and forged-policy regressions remain intact.
- `tools/proofline/src/egress-guard.test.ts`: retained wrapper/egress coverage and native external-diff denial; reference-transaction hooks remain inert for legitimate commit-tree/update-ref work.
- `tools/impact/src/select.test.ts`: raw change detection under a real hostile clean filter leaves its marker absent. A separate real-repository test checks committed and staged deletion/rename paths, raw unstaged changes, executable modes, symlinks, and untracked files against hand-written expected results.
- `tools/impact/src/governance.test.ts`, `main-selection.test.ts`, `harness-manifest.test.ts`, and `real-manifest-selection.test.ts`: legitimate repository history, shallow failure, baseline/blob/record governance, manifest discovery, and exact Vitest/Playwright selection/execution remain operational using the new fixture path.
- `tools/proofline/src/product-e2e-boundary.test.ts` and `production-negative.test.ts`: command governance, every intercepted child's policy construction, and production-negative builds remain covered.

Retained RED logs:

- `round-4-red-clean-filter.log`: the prior canonical guard dispatched the exact `add`, and `helperRan` was `true` (expected denial and `false`).
- `round-4-red-worktree-and-user-config.log`: the prior worktree detector executed the clean filter; caller HOME config was also read and caused Git exit 128.

Retained intermediate failures are explicitly named `round-4-failed-*`: stale line bindings/static command-governance expectations after the wrapper refactor, and one missing explicit TypeScript stat type caught by formatting/lint. Each was repaired before the final covering run.

The final focused command, with `PATH=/opt/homebrew/bin:$PATH`, was:

```sh
node tools/proofline/canonical-runner.mjs vitest run tools/proofline/src/canonical-runner-egress.test.ts tools/proofline/src/egress-guard.test.ts tools/proofline/src/product-e2e-boundary.test.ts tools/proofline/src/production-negative.test.ts tools/impact/src/select.test.ts tools/impact/src/governance.test.ts tools/impact/src/main-selection.test.ts tools/impact/src/harness-manifest.test.ts tools/impact/src/real-manifest-selection.test.ts
```

`round-4-green-focused-complete.log` exited 0: **9 files, 135 tests passed**, including actual exact selected Vitest and Chromium execution. The separate missing-promisor-object/native-env regression rerun passed 6 canonical tests in `round-4-green-native-object-final.log` before the complete focused run.


## Complete repair verification

All commands below used `PATH=/opt/homebrew/bin:$PATH`; every command exited 0. These are the repair verification runs, not the controller-owned final two-pass completion gate.

| Exact command | Observed output | Evidence log |
| --- | --- | --- |
| `pnpm test` | All eleven canonical unit targets completed; impact 9 files/131 tests, Proofline 4 files/37 tests. | `round-4-green-canonical-unit-complete.log` |
| `pnpm e2e` | `43 passed` (Chromium). | `round-4-green-canonical-browser-complete.log` |
| `node tools/proofline/canonical-runner.mjs playwright test --config apps/crm-e2e/playwright.config.ts apps/crm-e2e/src/fixtures/scenario-contract.spec.ts --project chromium --workers=2` | `24 passed`. | `round-4-green-scenario-workers-complete.log` |
| `node tools/proofline/canonical-runner.mjs playwright test --config apps/crm-e2e/playwright.config.ts apps/crm-e2e/src/fixtures/scenario-contract.spec.ts --project chromium --workers=2 --shard=1/2` | `12 passed`. | `round-4-green-scenario-shard-1-complete.log` |
| `node tools/proofline/canonical-runner.mjs playwright test --config apps/crm-e2e/playwright.config.ts apps/crm-e2e/src/fixtures/scenario-contract.spec.ts --project chromium --workers=2 --shard=2/2` | `12 passed`. | `round-4-green-scenario-shard-2-complete.log` |
| `pnpm coverage` | `Successfully ran target coverage for 11 projects`, cache 0/11. | `round-4-green-coverage-complete.log` |
| `pnpm coverage:check -- --base 3f7e1e4d4f74c4ec796601766a730ae0ac394b51 --head HEAD` | `Coverage ratchets passed for 8 manifest source groups.` | `round-4-green-coverage-check-complete.log` |
| `pnpm test:impacted -- --dry-run --base HEAD --head HEAD` | `fallback: none`, no selected identities for same-head source state. Exact selected execution is separately proved by the focused real-manifest regression. | `round-4-green-impact-dry-run-complete.log` |
| `pnpm lint` | Checked 279 files; no fixes. | `round-4-green-lint-complete.log` |
| `pnpm typecheck` | `11 tasks: 11 succeeded`. | `round-4-green-typecheck-complete.log` |
| `pnpm build` | Production CRM build passed. | `round-4-green-build-complete.log` |
| `pnpm build:test` | Test-entrypoint CRM build passed. | `round-4-green-build-test-complete.log` |
| `pnpm proofline:check-production` | `Proofline production artifact is free of test-only capabilities.` Repeated after coverage because production-negative tests rebuild the artifacts. | `round-4-green-production-audit-complete.log`, `round-4-green-production-audit-after-coverage.log` |
| `pnpm rules:generate` | Generated catalog with reconciled exact identities. | `round-4-rules-generate.log` |
| `pnpm harness:validate` | Exit 0; no manifest validation errors. | `round-4-green-harness-complete.log` |
| `pnpm record:check -- --base 3f7e1e4d4f74c4ec796601766a730ae0ac394b51 --head HEAD` | `Execution record governance passed.` | `round-4-green-record-check-complete.log` |
| `git diff --check 83c3012dcbf26b7c6843c3233c4941f5f5bedfc2..HEAD` | Exit 0; no whitespace errors in implementation. The staged evidence diff was also checked before its commit. | Final verification output |

`round-4-process-cleanup-complete.log` reports `matches=0` for Chrome-for-Testing/headless-shell, Playwright, canonical-runner, Vitest, test-app server, and Proofline runner processes. No process termination was needed.

The append-only event `2026-11-04.final-repair-1-round-4` scopes every governed changed path and records the implementation, RED/GREEN behavior, exact-selection proof, complete gates, and cleanup. Existing JSONL bytes were not rewritten. New retained logs preserve substantive output with trailing terminal whitespace and extra final blank lines removed for the repository diff gate; raw captures remain under local generated artifacts.

Implementation and evidence are committed separately. The remaining review is the controller's scoped re-review of this repair and its final two-pass completion gate, neither of which this implementer ran. The previously deferred loopback bind-race Minor is unchanged. No push was performed.
