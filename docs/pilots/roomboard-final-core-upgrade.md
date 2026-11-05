# Roomboard compatible final-core upgrade

**All 19 configured checks passed at committed upgrade head `e0c9fbd754e9a0665ba439c3974770f5673cae4d`. Final independent review is pending.** This is a separate controller-assisted compatible upgrade of the completed assisted pilot, not a new blind adoption or human trial. The `9102d0d` report/result/source and 1,056-file artifact inventory remain byte-identical dated snapshots; their SHA-256 values are retained in `evidence-final-core-upgrade/preserved-pilot-files.json` and verified after all gates. Original blocked-trial reports/failures/history also remain intact.

## Scope and source authority

The final-core snapshot was supplied locally by the controller from the stated immutable Git commit. This report makes no claim that a remote tag, release or package was published.

Prior tested app head: `9102d0d14701777a97cfa15bff20f5fd5b37db61`. New app head: `e0c9fbd754e9a0665ba439c3974770f5673cae4d`. New immutable public core: `d3b80ced47449ed0fa910de80faa2c3fd0351b26`, replacing `1804725126000ec79603add98b3cabb22700c6f1`. Author/committer: **Synthetic Roomboard Adoption Agent <synthetic-roomboard-adopter@example.invalid>**. Commit subject: “Upgrade portable metadata preflight and remove reference-only rule prose”. No push occurred.

Copied only the supplied 36 core paths and verified every byte against the immutable snapshot. Exactly two core files differ: `tools/proofline/doctor.mjs` and `tools/impact/src/validate.ts`. No local core patch was made. Doctor now reads direct installed package metadata as contained filesystem data without requiring an exported package.json; the supplied independently reviewed change also validates package identity. The catalog generator's three presentation strings are now target-neutral. `catalog.diff` retains the exact generated prose change; RB rule rows and bindings are unchanged.

Exactly five tracked files changed: the two core files, `proofline-core-hashes.json`, generated `test-impact/rules.md`, and one appended authored execution record. All target-owned application/test source, package/lock, manifest, command table, lifecycle/workflows, rule JSON, coverage floors and licenses are unchanged. The prior execution record is a byte-exact prefix. New/old core hashes and controller intervention are recorded in `evidence-final-core-upgrade/core-transition.json`. No private host repair implementation, extra agent, remote/provider write or deployment was used.

## Verification

The upgrade uses the prior actual tested head as base and committed upgrade as head, with session `75fad987-6ff7-4496-a797-91bb407535d7`. It reuses this trial's own original fresh setup HOME/npm cache/pnpm store/Chromium cache; **no new installation or browser download**, host node_modules link, or pin/floor change occurred. Runtime `v24.22.1`, pnpm `11.24.0`, Git 2.51.0, Darwin arm64, executable `/Users/dio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. Each child PATH sources the same `setup/env.sh`. Actual direct dependency metadata/contained realpaths and browser companion readiness are in the new Doctor and integrity output. The optional user-event helper remains removed by the target's earlier choice; this upgrade does not relabel that choice as a required product change or claim a new hidden-exports target dependency test.

Full fallback was newly executed for the actual core/generated metadata changes plus a real temporary unmapped source. The probe was removed before clean primary execution. Clean generated `dist`/`coverage` outputs were rebuilt; all earlier unique native execution artifacts remained retained. Full unit aggregate executes 11/11 identities, full Chromium 2/2 workflows, two workers pass, both shards execute their applicable one workflow. The native egress negative regression still passes before external dispatch; browser exact-origin/worker/service-worker/WebSocket policies remain as declared. Production module/Vite manifests and immutable negative auditor pass.

| Check | Exact argv | Exit | Log |
| --- | --- | --- | --- |
| doctor-source | `["node","tools/proofline/doctor.mjs","--stage","source","--json","--base","9102d0d14701777a97cfa15bff20f5fd5b37db61","--head","e0c9fbd754e9a0665ba439c3974770f5673cae4d"]` | 0 | `evidence-final-core-upgrade/final-doctor-source.log` |
| doctor-installed | `["node","tools/proofline/doctor.mjs","--stage","installed","--independent","--json","--base","9102d0d14701777a97cfa15bff20f5fd5b37db61","--head","e0c9fbd754e9a0665ba439c3974770f5673cae4d"]` | 0 | `evidence-final-core-upgrade/final-doctor-installed.log` |
| lint | `["node","tools/roomboard/lint.mjs"]` | 0 | `evidence-final-core-upgrade/final-lint.log` |
| typecheck | `["pnpm","typecheck"]` | 0 | `evidence-final-core-upgrade/final-typecheck.log` |
| manifest | `["pnpm","harness:validate"]` | 0 | `evidence-final-core-upgrade/final-manifest.log` |
| fallback-execute | `["node","tools/impact/src/main.ts","--base","9102d0d14701777a97cfa15bff20f5fd5b37db61","--head","e0c9fbd754e9a0665ba439c3974770f5673cae4d"]` | 0 | `evidence-final-core-upgrade/final-fallback-execute.log` |
| unit | `["node","tools/proofline/canonical-runner.mjs","unit"]` | 0 | `evidence-final-core-upgrade/final-unit.log` |
| browser | `["node","tools/proofline/canonical-runner.mjs","browser"]` | 0 | `evidence-final-core-upgrade/final-browser.log` |
| browserWorkers | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--workers=2"]` | 0 | `evidence-final-core-upgrade/final-browserWorkers.log` |
| browserShard1 | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--shard=1/2"]` | 0 | `evidence-final-core-upgrade/final-browserShard1.log` |
| browserShard2 | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--shard=2/2"]` | 0 | `evidence-final-core-upgrade/final-browserShard2.log` |
| coverage | `["node","tools/proofline/canonical-runner.mjs","vitest","run","--coverage","--coverage.provider=v8","--coverage.reportsDirectory=coverage","--coverage.reporter=json-summary","--coverage.include=src/{model.mjs,main.jsx,test-mode.mjs}"]` | 0 | `evidence-final-core-upgrade/final-coverage.log` |
| coverage-normalize | `["node","tools/impact/src/coverage-policy.ts","--normalize-reports"]` | 0 | `evidence-final-core-upgrade/final-coverage-normalize.log` |
| coverageCheck | `["node","tools/impact/src/coverage-policy.ts","--base","9102d0d14701777a97cfa15bff20f5fd5b37db61","--head","e0c9fbd754e9a0665ba439c3974770f5673cae4d"]` | 0 | `evidence-final-core-upgrade/final-coverageCheck.log` |
| recordCheck | `["node","tools/impact/src/record-check.ts","--base","9102d0d14701777a97cfa15bff20f5fd5b37db61","--head","e0c9fbd754e9a0665ba439c3974770f5673cae4d"]` | 0 | `evidence-final-core-upgrade/final-recordCheck.log` |
| buildProduction | `["pnpm","build"]` | 0 | `evidence-final-core-upgrade/final-buildProduction.log` |
| checkProduction | `["node","tools/proofline/check-production.mjs"]` | 0 | `evidence-final-core-upgrade/final-checkProduction.log` |
| diffCheck | `["git","diff","--check"]` | 0 | `evidence-final-core-upgrade/final-diffCheck.log` |
| gitClean | `["git","status","--porcelain"]` | 0 | `evidence-final-core-upgrade/final-gitClean.log` |

`final-command-results.jsonl` retains exact working directory/argv/timestamps/status and source/session authority. `final-integrity.json` independently validates every native execution-index digest and all 15 new-session passing verification records, including full aggregate and full browser authority; no stale or unrelated-source/session outcomes are assembled. It also proves unchanged prior reports, exact commit scope, unchanged dependency boundaries and clean Git state. Complete native reports/events/discovery/stdout/stderr/media remain under `roomboard/artifacts/proofline`.

Coverage measurements and monotonic floors are unchanged: model 100% lines/functions/statements and 97.29% branches; main 98.07% lines/statements, 66.66% functions and 87.17% branches; test-mode 100% lines/functions/statements and 83.33% branches. Merge-base compatibility/ratchet and append-only record checks both pass against `9102d0d14701777a97cfa15bff20f5fd5b37db61`. These are the same limited three-file unit-coverage scope, not whole-core/browser coverage.

The exact narrow-selection proof remains explicitly historical (`170e9e7`→`af8afaa`: eight model + one UI + one browser identity). Its records were neither rerun nor relabeled as new-core narrow-selection evidence. A core/metadata upgrade correctly requires full fallback instead.

## Evidence and remaining limits

No new upgrade gate failures or unresolved user questions. All prior failures remain preserved, including the original absent-tenant blocker, test-entry red assertion, and Doctor export failure. The supplied final core resolves the upstream package-metadata and generated-prose concerns identified in the earlier pilot. This local target run confirms the actual installed target's preflights and full gates; the controller's independently reviewed hidden-export/identity/containment regressions are separate upstream evidence.

Start `2026-11-05T20:45:44.413453+00:00`; final evidence completed `2026-11-05T20:47:09.954106+00:00`. Machine result: `ADOPTION_FINAL_CORE_UPGRADE_RESULT.json`. New tracked source inventory: `ADOPTION_FINAL_CORE_UPGRADE_SOURCE_INVENTORY.json`. New complete retained native snapshot: `ADOPTION_FINAL_CORE_UPGRADE_ARTIFACT_INVENTORY.json`. Existing pilot inventories remain dated snapshots and are not rewritten when new native files/index entries are added. The old inventory is **not claimed to fully match the current worktree**: shared generated impact/ratchet/record/coverage paths can be overwritten and the execution index gains appended entries. `historical-native-preservation.json` verifies that all 905 original native run-directory files remain byte-identical and the old execution-index bytes remain a hash-matching prefix; separately copied old retry ratchet/record/selection evidence is preserved. It lists the actual changed generated paths. No auth, roles, tenancy, backend, database or provider contract has been invented. No human, hosted CI, Linux, provider or deployment verification is claimed. Final independent review remains pending with the controller's reviewer.
