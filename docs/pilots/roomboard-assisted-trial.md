# Roomboard adoption — assisted retry

**Local implementation and all configured native gates passed. Independent review is pending.** This is explicitly an assisted agent retry, not human-user evidence or hosted verification. The original blocked reports/results, all native failures and commit `06ab1e7d803bc73556428930f2ac2b18b02b2272` remain retained, without rewriting them.

## Assistance and immutable source

The controller supplied the newly published, immutable public snapshot `1804725126000ec79603add98b3cabb22700c6f1`, whose documented absent-tenancy contract unblocks the original trial. Roomboard declares `tenantIsolationMode: not-applicable` with an explicit reason; no tenant or product-auth guarantee is claimed. The controller later acknowledged the independently reported Doctor resolver limitation, without supplying target implementation guidance. No private host implementation/repair history was read, no extra agents used, and no core patched locally.

All **36 core files** match the new snapshot exactly. Only `tools/impact/src/harness-manifest.ts` changed between old/new supplied core inventories. `evidence-retry/core-transition.json` retains both source SHAs and every old/new hash; `roomboard/proofline-core-hashes.json` records final copies; `evidence-retry/final-integrity.json` verifies them. Original app LICENSE is byte-identical, with separate Proofline license preserved. All application history remains.

| Purpose | Git SHA |
| --- | --- |
| Frozen original Roomboard | `91ded2ab018324357e7457486b2bc6292fb8c386` |
| Original blocked trial | `06ab1e7d803bc73556428930f2ac2b18b02b2272` |
| Governed measured bootstrap | `170e9e785a887d93be6c6ac3a85a4430491ba92f` |
| Real controlled source edit | `af8afaacd18b15b9b15339b69f8ca425da1d1763` |
| Diagnostic evidence append | `de42c99adf126aa3acc0f0cecbcd268316d6558d` |
| Final evidence commit / tested head | `9102d0d14701777a97cfa15bff20f5fd5b37db61` |

Every adaptation commit uses **Synthetic Roomboard Adoption Agent <synthetic-roomboard-adopter@example.invalid>**. No push or remote write occurred. Original six domain tests remain intact, with two more deterministic domain cases appended.

## Target adaptation

The pre-test inventory/design retained the two routes, immutable memory model, replay/cancel rules, absent auth/tenant/provider/backend/database contracts, ownership and lifecycle. The final five-rule registry binds exact discovered test titles/lines and layers. Model permutations remain in Vitest. The focused UI test validates contact, visible navigation, cancellation and released capacity. The two browser rows consume their declared workflow evidence: reserve/conflict/cancel/rebook through visible Rooms/Reservations links, and independent runtime/context startup capability checks. Setup creates no reservation and performs no in-scope user action. Final invariant inspection reads the rendered in-memory reservation list after visible outcomes; no durable database claim is made.

The target draft entry integration failed an explicit module-graph assertion before repair (`evidence-retry/red-test-entry.log`). The target uses Vite's pre-order HTML transform so its separate test artifact imports the capability validator and guarded test entry; the same assertion then passed. Production uses its original application entry. Production native module/Vite graphs exclude all declared test-only modules, and the immutable production-negative auditor passes. Each browser scenario has a fresh capability server/context; requests and WebSockets outside its exact loopback origin are aborted and asserted absent on cleanup, with service workers blocked. Runner egress is installed before test modules and a deterministic negative fetch regression proves undeclared provider dispatch is denied. Test execution contains no agent/model/live-provider call.

The only behavior-equivalent product-source edit changes normalized empty-contact guard `!contact` to `contact.length === 0`. Original product behavior is preserved. This source edit is the controlled selection proof; no new product feature was invented.

## Setup and diagnostic proof

This retry **reuses this trial's own genuine fresh installation/caches** from the blocked run: sibling HOME, npm cache, pnpm store and matching Playwright browser cache. There is no host dependency link. Runtime is Node `v24.22.1`, pnpm `11.24.0`, Git 2.51.0, Darwin arm64; Node execPath is `/Users/dio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. Every child operation sources `setup/env.sh` with the requested Node directory first. Exact direct package versions/contained realpaths and browser companion paths are retained. The optional newly added `@testing-library/user-event@14.6.1` helper was removed in favor of existing React Testing Library fireEvent after Doctor's metadata export limitation; lock was regenerated and frozen installation rerun with `--store-dir ../setup/pnpm-store`. Original app pins remain unchanged. Registry/browser downloads are setup-only.

At bootstrap→controlled head the selector resolved **fallback none**, exactly eight model tests + one UI test + one browser journey, excluding boundary/isolation identities. Actual guarded selected execution passed all ten required identities (runner-filtered other identities were not counted). Exact native discovery, rationale and runtime records remain under `evidence-retry/impact-controlled-execute` and `roomboard/artifacts/proofline`.

A real temporary unmapped source (`src/unmapped-probe.mjs`, retained in external evidence and removed from the app) produced canonical-full fallback; an unknown immutable base SHA also did so. Full fallback was actually executed, including all seven registered command adapters. Its outputs are retained. The temporary probe was removed before the final clean full gates.

## Final complete native gates

All commands below ran at head `9102d0d14701777a97cfa15bff20f5fd5b37db61`, merge-base `170e9e785a887d93be6c6ac3a85a4430491ba92f`, session `7207a490-030a-4d26-8a91-7721a4c7ecec`. Working directory: `/private/var/folders/53/tczzd1xs309dz5gqx3h41lnm0000gn/T/proofline-roomboard-adopter-k8xehgkh/roomboard`. `evidence-retry/final-completion/final-command-results.jsonl` retains exact argv, native paths, start/end times and exit codes. The run removes only target `dist`/`coverage` generated outputs before clean primary execution; earlier unique native execution artifacts remain preserved. A previous complete pass at `de42c99` was authored into the final record-only commit, followed by this fresh final-source run.

| Gate | Exact argv | Exit | Log |
| --- | --- | --- | --- |
| doctor-source | `["node","tools/proofline/doctor.mjs","--stage","source","--json","--base","170e9e785a887d93be6c6ac3a85a4430491ba92f","--head","9102d0d14701777a97cfa15bff20f5fd5b37db61"]` | 0 | `evidence-retry/final-completion/final-doctor-source.log` |
| doctor-installed | `["node","tools/proofline/doctor.mjs","--stage","installed","--independent","--json","--base","170e9e785a887d93be6c6ac3a85a4430491ba92f","--head","9102d0d14701777a97cfa15bff20f5fd5b37db61"]` | 0 | `evidence-retry/final-completion/final-doctor-installed.log` |
| lint | `["node","tools/roomboard/lint.mjs"]` | 0 | `evidence-retry/final-completion/final-lint.log` |
| typecheck | `["pnpm","typecheck"]` | 0 | `evidence-retry/final-completion/final-typecheck.log` |
| manifest | `["pnpm","harness:validate"]` | 0 | `evidence-retry/final-completion/final-manifest.log` |
| fallback-execute | `["node","tools/impact/src/main.ts","--base","170e9e785a887d93be6c6ac3a85a4430491ba92f","--head","9102d0d14701777a97cfa15bff20f5fd5b37db61"]` | 0 | `evidence-retry/final-completion/final-fallback-execute.log` |
| unit | `["node","tools/proofline/canonical-runner.mjs","unit"]` | 0 | `evidence-retry/final-completion/final-unit.log` |
| browser | `["node","tools/proofline/canonical-runner.mjs","browser"]` | 0 | `evidence-retry/final-completion/final-browser.log` |
| browserWorkers | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--workers=2"]` | 0 | `evidence-retry/final-completion/final-browserWorkers.log` |
| browserShard1 | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--shard=1/2"]` | 0 | `evidence-retry/final-completion/final-browserShard1.log` |
| browserShard2 | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--shard=2/2"]` | 0 | `evidence-retry/final-completion/final-browserShard2.log` |
| coverage | `["node","tools/proofline/canonical-runner.mjs","vitest","run","--coverage","--coverage.provider=v8","--coverage.reportsDirectory=coverage","--coverage.reporter=json-summary","--coverage.include=src/{model.mjs,main.jsx,test-mode.mjs}"]` | 0 | `evidence-retry/final-completion/final-coverage.log` |
| coverage-normalize | `["node","tools/impact/src/coverage-policy.ts","--normalize-reports"]` | 0 | `evidence-retry/final-completion/final-coverage-normalize.log` |
| coverageCheck | `["node","tools/impact/src/coverage-policy.ts","--base","170e9e785a887d93be6c6ac3a85a4430491ba92f","--head","9102d0d14701777a97cfa15bff20f5fd5b37db61"]` | 0 | `evidence-retry/final-completion/final-coverageCheck.log` |
| recordCheck | `["node","tools/impact/src/record-check.ts","--base","170e9e785a887d93be6c6ac3a85a4430491ba92f","--head","9102d0d14701777a97cfa15bff20f5fd5b37db61"]` | 0 | `evidence-retry/final-completion/final-recordCheck.log` |
| buildProduction | `["pnpm","build"]` | 0 | `evidence-retry/final-completion/final-buildProduction.log` |
| checkProduction | `["node","tools/proofline/check-production.mjs"]` | 0 | `evidence-retry/final-completion/final-checkProduction.log` |
| diffCheck | `["git","diff","--check"]` | 0 | `evidence-retry/final-completion/final-diffCheck.log` |
| gitClean | `["git","status","--porcelain"]` | 0 | `evidence-retry/final-completion/final-gitClean.log` |

Full unit aggregate genuinely executes **11/11** identities. Chromium full genuinely executes **2/2** workflows; two-worker execution passes, shard1 and shard2 each execute their applicable one identity. Final-session native index digests are validated in `evidence-retry/final-integrity.json`: 15 same-source/session passing records including fallback and clean primary runs, with full unit aggregate and full browser authority present. No unrelated-session results are assembled into completion evidence. All native discovery/reports/events/stdout/stderr/traces/screenshots/video remain under `roomboard/artifacts/proofline`; browser artifacts are real native outputs, not a result summary.

Coverage is per file over model/main/test-mode with the pinned V8 provider and measured initial whole-percent floors. Final model has 100% lines/functions/statements and 97.29% branches; main has 98.07% lines/statements, 66.66% functions and 87.17% branches; test-mode has 100% lines/functions/statements and 83.33% branches. These explicit limits are not whole-product/core/browser coverage. Immutable merge-base group compatibility and monotonic minima pass without lowering any baseline. Raw native and normalized summaries and native ratchet details are retained. Append-only record governance passes with byte-exact bootstrap prefix; an additional integrity check proves the original blocked trial's first three records also remain a byte-exact prefix.

## Retained failures, questions and remaining limits

No permission requests or unresolved user questions. Failures/interventions retained:

- Original mandatory-tenant schema blocker and missing-bootstrap red regression remain in the original evidence/report.
- Wrong draft test-entry module graph failed before the pre-order transform repair, then passed; both outputs remain.
- Initial installed Doctor failed because it resolves every direct dependency's exported `package.json`; user-event does not export that subpath. `doctor-installed.json` and `direct-package-json-probe.json` retain the actual failure. Removing the optional target helper lets final Doctor pass, **without repairing the general upstream Doctor limitation**.
- The original pnpm symlink/probe and metadata-probe failures remain documented in the blocked report. No failing output was replaced with a success summary.

The core-generated rules Markdown still carries generic reference boilerplate about money even though Roomboard has no monetary rules; the actual RB rows describe reservation semantics. This is an upstream presentation limitation, not product functionality. Syntax lint and the original app typecheck are scoped checks; they are not a new full-repository static-analysis claim. No human, Linux, hosted CI, provider, deployment, authentication, role, tenant or database evidence is claimed. Independent review remains controller-owned and pending.

Retry duration: approximately 421.2 seconds (2026-11-05T20:35:15.128984+00:00 through 2026-11-05T20:42:16.279400+00:00); about 20 tool batches including inventory, red/green, independent probes, bootstrap/controlled commits, selected/fallback diagnostics and two final source-bound complete passes. Machine result is `ADOPTION_RETRY_RESULT.json`; tracked source inventory is `ADOPTION_RETRY_SOURCE_INVENTORY.json`; complete retained native artifact hashes are in `ADOPTION_RETRY_ARTIFACT_INVENTORY.json`. These are target-specific records, not the work-orders fixed v1 certifier contract.
