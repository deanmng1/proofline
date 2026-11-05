# Roomboard post-review cohort upgrade

**All 19 checks passed at `ee6b8518d72d1ea37e30f2abb594e06fbc9134cd`. The target is frozen for independent review; no further upgrade is planned.** This is controller-assisted maintenance using the original trial's own setup, not a new fresh install, blind adoption, human or hosted trial. All earlier reports/results/source/artifact inventories remain byte-identical dated snapshots.

## Source and target scope

Base `bc487b371dfd5dabe52daee05a6a9553f0877268`; committed head `ee6b8518d72d1ea37e30f2abb594e06fbc9134cd`; immutable public-only cohort **H `8c7614f16e69cb578ef880be961bdd33118e729f`**. Author/committer: **Synthetic Roomboard Adoption Agent <synthetic-roomboard-adopter@example.invalid>**. Subject: “Adopt reviewed cohort boundaries before every Roomboard browser context”. The controller supplied the local immutable snapshot and reported closure/approval of the original whole-project source review, conditional on separate fresh/current-target/hosted evidence. This report supplies **current-target evidence with reused setup**, not those other classes or a remote publication claim.

All **37** supplied core files match H byte-for-byte; the supplied source inventory contains 44 public/core files total. Five copied paths differ from prior core6c: new `browser-runtime-boundary.mjs`, plus canonical-runner, egress-guard, guard-policy and run-guarded. No core was patched locally. `core-transition.json` records all old/new hashes and assistance. Only ten tracked paths changed: those five core paths, two target browser fixture/spec files, core provenance, one production forbidden-module declaration in the manifest, and three appended authored JSONL events. App/src, original history/license, package/lock, unit11/browser2 titles and exact lines, business rules/lifecycle/workflows, command table and coverage floors remain unchanged. Catalog/binding validation confirmed no regeneration/rebinding was necessary.

The public portable guide and new helper were read. Both target-owned context types now register the imported `blockUnsupportedBrowserWorkers` using addInitScript **before the first newPage**. Main context: initializer before existing HTTP/WebSocket routes and page. Bootstrap/missing-capability context: initializer plus exact-origin HTTP route, denied WebSocket route, blocked service workers and asserted cleanup before its first page. In-page Worker/SharedWorker execution is unsupported; Playwright's parallel test worker processes and shards remain supported. The helper was added to `production.forbiddenModules`; the production negative audit proves it absent from normal production graphs/output.

## Own red/green evidence

Before implementing main-context initialization, an assertion for locked Worker/SharedWorker constructors was added to the existing browser workflows. Both tests genuinely failed: native descriptors were still unblocked. No worker is spawned when a descriptor is unguarded; the assertion returns that observation. After main initialization, the reservation journey passed but the bootstrap/missing-capability context genuinely failed the same assertion before its own initialization was added. After bootstrap initialization both unchanged identities passed. The final assertion also invokes each installed constructor and checks its exact rejection, so the test proves rejection rather than a missing global.

- Main RED: exit1, two failed, `red-main-worker-boundary.log`; native run `02a5d919-d13f-41d2-a8e5-c7bfdedd10bc`.
- Bootstrap RED: exit1, one failed/one passed, `red-bootstrap-worker-boundary.log`; native run `c397efc0-fbca-4964-b076-a13b4863222f`.
- Fixture GREEN: exit0, two passed, `green-browser-worker-boundaries.log`.

Exact failed fixture drafts, native receipts, screenshots/traces/media and verification errors remain retained. These pre-commit red/green runs had dirty fixture drafts at the historical base commit and are labeled accordingly; they are not substituted for the clean committed-head checks below. All three authored events preserve real failures and the implementation decision.

## Committed-head full checks

Session `559e7752-268b-4817-b452-4c7607c24127`, actual base/head above, working directory `/private/var/folders/53/tczzd1xs309dz5gqx3h41lnm0000gn/T/proofline-roomboard-adopter-k8xehgkh/roomboard`. Setup reuses this trial's own original fresh HOME/npm cache/pnpm store/matching Chromium cache; **no new install, browser download, host dependency link, provider call or remote write** occurred. Runtime `v24.22.1`, pnpm `11.24.0`, Git 2.51.0, Darwin arm64; Node executable `/Users/dio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. The same setup/env.sh prepends that Node and own pinned pnpm for every child. New preflights and integrity output retain actual dependency versions/contained realpaths and browser companion readiness.

| Check | Exact argv | Exit | Log |
| --- | --- | --- | --- |
| doctor-source | `["node","tools/proofline/doctor.mjs","--stage","source","--json","--base","bc487b371dfd5dabe52daee05a6a9553f0877268","--head","ee6b8518d72d1ea37e30f2abb594e06fbc9134cd"]` | 0 | `evidence-cohort-upgrade/final-doctor-source.log` |
| doctor-installed | `["node","tools/proofline/doctor.mjs","--stage","installed","--independent","--json","--base","bc487b371dfd5dabe52daee05a6a9553f0877268","--head","ee6b8518d72d1ea37e30f2abb594e06fbc9134cd"]` | 0 | `evidence-cohort-upgrade/final-doctor-installed.log` |
| lint | `["node","tools/roomboard/lint.mjs"]` | 0 | `evidence-cohort-upgrade/final-lint.log` |
| typecheck | `["pnpm","typecheck"]` | 0 | `evidence-cohort-upgrade/final-typecheck.log` |
| manifest | `["pnpm","harness:validate"]` | 0 | `evidence-cohort-upgrade/final-manifest.log` |
| fallback-execute | `["node","tools/impact/src/main.ts","--base","bc487b371dfd5dabe52daee05a6a9553f0877268","--head","ee6b8518d72d1ea37e30f2abb594e06fbc9134cd"]` | 0 | `evidence-cohort-upgrade/final-fallback-execute.log` |
| unit | `["node","tools/proofline/canonical-runner.mjs","unit"]` | 0 | `evidence-cohort-upgrade/final-unit.log` |
| browser | `["node","tools/proofline/canonical-runner.mjs","browser"]` | 0 | `evidence-cohort-upgrade/final-browser.log` |
| browserWorkers | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--workers=2"]` | 0 | `evidence-cohort-upgrade/final-browserWorkers.log` |
| browserShard1 | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--shard=1/2"]` | 0 | `evidence-cohort-upgrade/final-browserShard1.log` |
| browserShard2 | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--shard=2/2"]` | 0 | `evidence-cohort-upgrade/final-browserShard2.log` |
| coverage | `["node","tools/proofline/canonical-runner.mjs","vitest","run","--coverage","--coverage.provider=v8","--coverage.reportsDirectory=coverage","--coverage.reporter=json-summary","--coverage.include=src/{model.mjs,main.jsx,test-mode.mjs}"]` | 0 | `evidence-cohort-upgrade/final-coverage.log` |
| coverage-normalize | `["node","tools/impact/src/coverage-policy.ts","--normalize-reports"]` | 0 | `evidence-cohort-upgrade/final-coverage-normalize.log` |
| coverageCheck | `["node","tools/impact/src/coverage-policy.ts","--base","bc487b371dfd5dabe52daee05a6a9553f0877268","--head","ee6b8518d72d1ea37e30f2abb594e06fbc9134cd"]` | 0 | `evidence-cohort-upgrade/final-coverageCheck.log` |
| recordCheck | `["node","tools/impact/src/record-check.ts","--base","bc487b371dfd5dabe52daee05a6a9553f0877268","--head","ee6b8518d72d1ea37e30f2abb594e06fbc9134cd"]` | 0 | `evidence-cohort-upgrade/final-recordCheck.log` |
| buildProduction | `["pnpm","build"]` | 0 | `evidence-cohort-upgrade/final-buildProduction.log` |
| checkProduction | `["node","tools/proofline/check-production.mjs"]` | 0 | `evidence-cohort-upgrade/final-checkProduction.log` |
| diffCheck | `["git","diff","--check"]` | 0 | `evidence-cohort-upgrade/final-diffCheck.log` |
| gitClean | `["git","status","--porcelain"]` | 0 | `evidence-cohort-upgrade/final-gitClean.log` |

Actual canonical-full fallback executed for the real upgrade/manifest/fixture changes and a temporary unmapped source. The probe was removed before clean primary execution. Full unit aggregate genuinely passes 11/11, full Chromium 2/2 visible workflows, two-worker run and both one-identity shards pass. Coverage/normalization, merge-base compatibility/monotonic floors, byte-exact append-only records, production build/negative audit, manifest/syntax/type checks and clean Git/diff all pass. Target dist/coverage outputs were rebuilt while unique native run directories remained preserved.

`final-command-results.jsonl` retains exact commands/cwd/timestamps/source/session/exits/logs; `final-integrity.json` verifies every index digest and 15 passing new-session native records with complete unit aggregate and full-browser authority. Earlier failed native sessions remain distinct. Native reports/events/discovery/stdout/stderr/traces/screenshots/video remain under `roomboard/artifacts/proofline`.

Coverage measurements/floors remain the same: model100% lines/functions/statements and97.29% branches; main98.07% lines/statements,66.66% functions,87.17% branches; test-mode100% lines/functions/statements,83.33% branches. These are limited three-file unit measurements, not whole-core/browser coverage. Historical exact narrow selection remains `170e9e7`→`af8afaa` and is not relabeled as an H exact-selection run. A core/manifest upgrade requires full fallback.

## Preservation and evidence limits

All earlier report/result/inventory files are byte-identical, verified against `preserved-prior-report-files.json`. Earlier unique native files and index prefixes remain preserved:

- `ADOPTION_RETRY_ARTIFACT_INVENTORY.json`: all 905 native run files unchanged; historical 10608-byte index prefix hash matches. Changed shared generated paths are explicitly listed in the preservation audit.
- `ADOPTION_FINAL_CORE_UPGRADE_ARTIFACT_INVENTORY.json`: all 1252 native run files unchanged; historical 13923-byte index prefix hash matches. Changed shared generated paths are explicitly listed in the preservation audit.
- `ADOPTION_STARTUP_REPAIR_UPGRADE_ARTIFACT_INVENTORY.json`: all 1599 native run files unchanged; historical 17238-byte index prefix hash matches. Changed shared generated paths are explicitly listed in the preservation audit.

Old inventories remain dated snapshots, **not a claim that every old mutable generated path still matches the current worktree**. Shared impact/ratchet/record outputs can be overwritten and the execution index gains an appended suffix. Copied old selection/ratchet/record evidence remains in separate earlier evidence directories. The bc487 authored record is a byte-exact prefix, preserving all older history.

No final gate failure, unresolved question or permission request occurred. The two new intentional failing fixture stages and all older schema/bootstrap/entry/Doctor failures remain retained. No auth, roles, tenancy, backend, provider or database contract has been invented. No human, fresh-install, hosted CI, Linux, deployment or remote-publication proof is claimed. The controller's source/cohort review and independent fresh run are separate evidence, not aggregated into this target's result.

Start `2026-11-05T22:06:57.743558+00:00`; finished `2026-11-05T22:10:30.869241+00:00`. New files: `ADOPTION_COHORT_UPGRADE_RESULT.json`, `ADOPTION_COHORT_UPGRADE_SOURCE_INVENTORY.json`, and `ADOPTION_COHORT_UPGRADE_ARTIFACT_INVENTORY.json`; evidence is under `evidence-cohort-upgrade`. The target is frozen for review.
