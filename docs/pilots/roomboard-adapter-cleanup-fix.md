# Roomboard cohort adapter cleanup — fix1

**Bounded repair committed at `aeaf7a04e99f8e313dde1de6f10d39c6ca201722`; all 19 checks passed. Frozen for the original independent reviewer.** The ee6 cohort report/result/source/artifact inventory and all earlier reports remain immutable historical evidence. This is not another core upgrade, source approval or new fresh/human/hosted trial.

## Review finding and retained RED

Base `ee6b8518d72d1ea37e30f2abb594e06fbc9134cd`. The complete explicitly supplied reviewer report and actual probe/result were read and copied under `evidence-cohort-fix1/reviewer-evidence`. The sole P2 finding was setup cleanup: actual scenario addInitScript rejection produced context.close0 and one owned loopback server still listening; reviewer closed it. Bootstrap initializer/routes were likewise outside cleanup. `before-target` snapshots the exact pre-repair owned sources/metadata.

A semantics-preserving extraction exposed the existing bootstrap/main setup as one injectable public fixture seam before cleanup repair. Six new literal deterministic tests then ran against the faulty sequence: **five failed, one passed**. The tests use actual core numeric-loopback servers with a minimal local test artifact, observing successful real server closure; a test teardown releases intentionally leaked RED servers. BrowserContext failures are deterministic public fakes. RED covers server/context allocation, initializer, HTTP route, WebSocket route and first-page rejection, plus retaining setup/cleanup errors and continuing after a context close rejection. Native RED run `d4305c98-d885-48bb-9113-3d7bc752d9b2`, log `red-cleanup-regression.log`; exact faulty fixture/test drafts are retained. GREEN run `b96d915d-6b64-4156-b72c-010521ac19c6` passes all six; browser GREEN passes both original identities. These pre-commit runs had dirty retained drafts at ee6, distinct from final committed-head proof.

## Repair and unchanged scope

Commit `aeaf7a04e99f8e313dde1de6f10d39c6ca201722`, author/committer **Synthetic Roomboard Adoption Agent <synthetic-roomboard-adopter@example.invalid>**, subject “Release Roomboard fixtures after partial setup and cleanup failures”. Exactly eight target-owned paths changed: scenario/spec, new deterministic test module, its Vitest discovery include, exact manifest workspace/ownership/bindings, rules JSON/generated catalog, and appended authored review/RED/GREEN records. No core file or core provenance changed. All **37 core H** bytes still match `8c7614f16e69cb578ef880be961bdd33118e729f` exactly. App/src, original history/license, package/lock, coverage source groups/floors, lifecycle/workflows, production forbidden metadata and old rules/bindings are unchanged.

Main and bootstrap now use one context allocation/initializer/routes/first-page cleanup boundary. Any rejected setup releases the allocated context before propagating failure. Main scenario also releases its owned server if context/page setup fails. Every release is attempted even if a previous one rejects; original and cleanup failures are retained, using AggregateError for multiple failures. The bootstrap caller closes its returned page/context in its finally. H's worker initializer and exact-origin HTTP/WebSocket/service-worker policies still precede every first page.

All six new tests are required under RB-006 with literal file/title/line bindings and the new deterministic test workspace. The original 11 unit identities and two browser titles/lines remain unchanged. Full unit is now **17/17**; browser remains **2/2**. `new-required-cleanup-identities.json` verifies all six new expected identities genuinely executed in final native unit records.

## Final source-bound gates

Base `ee6b8518d72d1ea37e30f2abb594e06fbc9134cd`, head `aeaf7a04e99f8e313dde1de6f10d39c6ca201722`, session `f8ebd7b4-0fbf-4058-8f6d-0ea094117185`, working directory `/private/var/folders/53/tczzd1xs309dz5gqx3h41lnm0000gn/T/proofline-roomboard-adopter-k8xehgkh/roomboard`. This uses the trial's own original genuine fresh setup/cache; no new install/download, host dependency link, provider, remote or host write. Node `v24.22.1`, pnpm `11.24.0`, Git2.51.0, Darwin arm64, executable `/Users/dio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. Every child still sources setup/env.sh. Actual contained direct package metadata and browser readiness are in the new preflights/integrity output.

| Check | Exact argv | Exit | Log |
| --- | --- | --- | --- |
| doctor-source | `["node","tools/proofline/doctor.mjs","--stage","source","--json","--base","ee6b8518d72d1ea37e30f2abb594e06fbc9134cd","--head","aeaf7a04e99f8e313dde1de6f10d39c6ca201722"]` | 0 | `evidence-cohort-fix1/final-doctor-source.log` |
| doctor-installed | `["node","tools/proofline/doctor.mjs","--stage","installed","--independent","--json","--base","ee6b8518d72d1ea37e30f2abb594e06fbc9134cd","--head","aeaf7a04e99f8e313dde1de6f10d39c6ca201722"]` | 0 | `evidence-cohort-fix1/final-doctor-installed.log` |
| lint | `["node","tools/roomboard/lint.mjs"]` | 0 | `evidence-cohort-fix1/final-lint.log` |
| typecheck | `["pnpm","typecheck"]` | 0 | `evidence-cohort-fix1/final-typecheck.log` |
| manifest | `["pnpm","harness:validate"]` | 0 | `evidence-cohort-fix1/final-manifest.log` |
| fallback-execute | `["node","tools/impact/src/main.ts","--base","ee6b8518d72d1ea37e30f2abb594e06fbc9134cd","--head","aeaf7a04e99f8e313dde1de6f10d39c6ca201722"]` | 0 | `evidence-cohort-fix1/final-fallback-execute.log` |
| unit | `["node","tools/proofline/canonical-runner.mjs","unit"]` | 0 | `evidence-cohort-fix1/final-unit.log` |
| browser | `["node","tools/proofline/canonical-runner.mjs","browser"]` | 0 | `evidence-cohort-fix1/final-browser.log` |
| browserWorkers | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--workers=2"]` | 0 | `evidence-cohort-fix1/final-browserWorkers.log` |
| browserShard1 | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--shard=1/2"]` | 0 | `evidence-cohort-fix1/final-browserShard1.log` |
| browserShard2 | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--shard=2/2"]` | 0 | `evidence-cohort-fix1/final-browserShard2.log` |
| coverage | `["node","tools/proofline/canonical-runner.mjs","vitest","run","--coverage","--coverage.provider=v8","--coverage.reportsDirectory=coverage","--coverage.reporter=json-summary","--coverage.include=src/{model.mjs,main.jsx,test-mode.mjs}"]` | 0 | `evidence-cohort-fix1/final-coverage.log` |
| coverage-normalize | `["node","tools/impact/src/coverage-policy.ts","--normalize-reports"]` | 0 | `evidence-cohort-fix1/final-coverage-normalize.log` |
| coverageCheck | `["node","tools/impact/src/coverage-policy.ts","--base","ee6b8518d72d1ea37e30f2abb594e06fbc9134cd","--head","aeaf7a04e99f8e313dde1de6f10d39c6ca201722"]` | 0 | `evidence-cohort-fix1/final-coverageCheck.log` |
| recordCheck | `["node","tools/impact/src/record-check.ts","--base","ee6b8518d72d1ea37e30f2abb594e06fbc9134cd","--head","aeaf7a04e99f8e313dde1de6f10d39c6ca201722"]` | 0 | `evidence-cohort-fix1/final-recordCheck.log` |
| buildProduction | `["pnpm","build"]` | 0 | `evidence-cohort-fix1/final-buildProduction.log` |
| checkProduction | `["node","tools/proofline/check-production.mjs"]` | 0 | `evidence-cohort-fix1/final-checkProduction.log` |
| diffCheck | `["git","diff","--check"]` | 0 | `evidence-cohort-fix1/final-diffCheck.log` |
| gitClean | `["git","status","--porcelain"]` | 0 | `evidence-cohort-fix1/final-gitClean.log` |

All 19 checks passed. New actual fallback executes every canonical adapter for real test/config/manifest changes plus a temporary unmapped source, then removes the probe. Clean primary unit17, browser2, two-worker and 1+1 shard gates pass. Coverage normalization, compatible merge-base monotonic floors, byte-exact append-only record governance, manifest/syntax/type checks and production build/negative audit pass. `final-command-results.jsonl` retains exact argv/cwd/timestamps/source/session/exits/logs; `final-integrity.json` verifies all execution-index digests and 15 matching passing final native records. No unrelated/stale session is used. Cleanup RED and all older failures remain separate preserved native evidence.

Coverage measurements/floors are unchanged: model100% lines/functions/statements and97.29% branches; main98.07% lines/statements,66.66% functions,87.17% branches; test-mode100% lines/functions/statements,83.33% branches. The six cleanup regressions execute outside that pre-existing three-file coverage measurement scope; their genuine outcomes are separately required and verified, without inventing or lowering coverage floors. Historical narrow selection remains170e9e7→af8afaa; this adapter/config repair correctly uses full fallback.

## Historical preservation and limits

All earlier reports/results/inventories remain byte-identical and ee6's authored record is a byte-exact prefix. Unique earlier native files and index prefixes verify:

- `ADOPTION_RETRY_ARTIFACT_INVENTORY.json`: all 905 native run files unchanged; historical 10608-byte index prefix hash matches.
- `ADOPTION_FINAL_CORE_UPGRADE_ARTIFACT_INVENTORY.json`: all 1252 native run files unchanged; historical 13923-byte index prefix hash matches.
- `ADOPTION_STARTUP_REPAIR_UPGRADE_ARTIFACT_INVENTORY.json`: all 1599 native run files unchanged; historical 17238-byte index prefix hash matches.
- `ADOPTION_COHORT_UPGRADE_ARTIFACT_INVENTORY.json`: all 2060 native run files unchanged; historical 21216-byte index prefix hash matches.

Old inventories are dated snapshots, not a promise that shared mutable generated impact/ratchet/record paths still match the current worktree. `historical-native-preservation.json` lists exact changed generated paths; copied old gate results remain in their earlier external evidence. Complete native reports, discovery, task events, logs and browser media remain under `roomboard/artifacts/proofline`.

No final gate failure or unresolved user question. Original P2 review and intentional five-failure RED stage remain retained. Approval remains withheld until the original reviewer re-reviews this frozen fix. No source/runtime core upgrade, product feature, auth/tenant/provider/database claim or fresh/human/hosted/deployment evidence is claimed. Start `2026-11-05T22:14:44.551556+00:00`; finished `2026-11-05T22:18:58.095509+00:00`. New report/result/source/artifact files use the `ADOPTION_COHORT_FIX1_` prefix, with separate `evidence-cohort-fix1`.
