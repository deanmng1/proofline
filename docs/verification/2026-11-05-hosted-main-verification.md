# Actual main and release-artifact verification

**Accepted source:** `775c62087aa2f443fc409aba750911215ba2aa2e` (F). Its executable, test and manifest inputs are identical to independently accepted fresh implementation F0 `389513c2d14bcffa3b992cd7b89989c0ebaedd6d`. The subsequent administrative documentation closeout names this verified source; it does not claim a later code revision was executed.

[PR 3 run 42160268263](https://github.com/deanmng1/proofline/actions/runs/42160268263), attempt 1, passed both full platform cells. Independent source, ref, API, archive and native-result review approved a normal main fast-forward from D to exactly F. No merge/rebase substituted another head. The [actual push/main run 42163108445](https://github.com/deanmng1/proofline/actions/runs/42163108445), attempt 1, then completed successfully on both platforms, including compatibility collection and Linux release packaging.

## Actual execution evidence

| Evidence | Linux x64 | Darwin arm64 |
| --- | --- | --- |
| Runner label / job | `ubuntu-24.04` / `127713200369` | `macos-15` / `127713200413` |
| Full unit | 186 required / 683 observed passes | 186 required / 683 observed passes |
| Unit native invocation | `d1611bb4-2b6d-40bb-98dc-8dccc866a223` | `6a87691b-ef9e-4860-8c1b-f1087831151c` |
| Full Chromium | 34 required / 47 observed passes, two workers | 34 required / 47 observed passes, two workers |
| Browser native invocation | `8d6e5a9a-81e4-4015-b7fc-a0a47a8fb9ff` | `5f3f8538-45b0-484d-bec5-e724f7ce20b1` |
| Worker scenario / shards | 24 / 12+12 passes | 24 / 12+12 passes |
| Native indexes | 62 root / 11 target | 62 root / 11 target |
| Independent work-orders | All ten gates; 2 unit / 4 browser passes | All ten gates; 2 unit / 4 browser passes |
| Core / coverage | 37 matching core files; all 30 floors | 37 matching core files; all 30 floors |

The demonstrated stack is Node 24.22.1, pnpm 11.24.0, React 19.2.8, Vite 6.4.3, Vitest/V8 3.2.7 and Playwright 1.62.1 with Chromium. This establishes the two pinned cells, not additional platforms, browsers or dependency versions. All original 24 floors and the complete original 232,196-byte authored-record prefix remain unchanged. Nine deliberate negative-fixture records per cell remain failed and excluded from passing gate authority.

## Authenticated artifact and content audit

The actual native command `node tools/proofline/hosted-proof.mjs --repository deanmng1/proofline --commit 775c62087aa2f443fc409aba750911215ba2aa2e --directory <new-absolute-directory> --receipt <new-absolute-receipt>` completed successfully through the bounded GitHub transport. Its verifier names exact F, reports `dirty:false` and retains `provenance.authoritative:false`: the saved operator receipt supplements the independently checked API and native evidence.

Release artifact **13478931649** is **25,227,522 bytes**, SHA-256 **`1874e23ca6e855af34af112b6db31cfc425f102e65a92e01de701481c1401084`**. Strict extraction verifies the **719-file** inventory and all **16** embedded gate outcomes. Independently retained ZIP contents match both the transferred directory and the native CLI download. No rebuild substitutes for the downloaded artifact.

Linux compatibility artifact **13478806980** has digest `86d393a4ab5361750f0257427e445c71f15c758dbddb8ac0a45bd2534a4c5236`; macOS artifact **13479090788** has digest `e315e8a271b918d367d554a0c8c58b40bf8a8d00bf6e922fcf2f5b0eec3be214`. Both persisted observations are bound to exact source/run/attempt, producing job/upload IDs and digests, actual runtime, complete native/target inventories, portability-record hash and core37. Their stored `mode:hosted`, `observation:executed-local` and `hostedProvenance:not-verified-by-collector` fields remain unchanged. External API/log/content corroboration establishes the hosted observation; flags alone do not.

All five authority archives and four diagnostic archives match authenticated API digests and lengths. Job upload logs bind artifact name/ID/digest to the producing cell because artifact metadata alone does not identify its job. Both complete log hashes match their authenticated captures: Linux `0cd8f0a5051a8d101c90514c3c3abd60c1eecf496a040e3de639d8ed2e6b174e`; macOS `53be2da57fa626c066a1b9f24662f356c911254f97c8cf47701a0aba20638e73`.

Independent API observations before and after content auditing confirm the same successful current attempt, exact source/main, jobs and all nine artifact IDs/digests. The thirteen audit areas cover source/workflow, current authenticated run, jobs/gates, refreshed authority, digests, upload binding, native CLI/verifier, release inventory, root outcomes, independent target/setup, both compatibility observations, coverage/negative classification and retained failure history. No material finding remains. A reviewer helper initially used a relative directory where the validator requires an absolute retained-evidence root; correcting that reviewer argument resolved it without product or evidence changes.

## Scope and retained evidence

The [latest fresh F0 gate](2026-11-05-fresh-overview-successor.md) and actual hosted F gate are separate observations. Earlier failed local, PR and main runs remain failed. In particular, D's overall failed main run remains ineligible despite its Linux release-named upload, and E's PR coverage failure remains preserved. No synthetic identity, successful PR or persisted receipt was promoted into main release authority.

Raw authenticated captures, both logs, native CLI observation and all ZIPs are under `output/readiness-milestones/hosted-main-F/`. Transfer manifests are `authority-artifacts/transfers.json` and `diagnostic-artifacts/diagnostics-transfers.json`. Independent executable/content audits and before/after API observations are under `output/readiness-milestones/final-independent-review/`, including `F-main-actual-hosted-acceptance.md`, `F-main-hosted-content-audit.json` and `F-main-supplemental-audit.json`. These supplement the clone-visible report and linked actual workflow runs.

Source is published on public GitHub main. No package, tag, GitHub Release or deployment is claimed by this artifact verification. Live staging remains pending by user choice. The [independent 8.6/10 reassessment](../reviews/2026-11-05-production-readiness.md) records the remaining adoption, support, platform and operating-history limits.
