# Independent Proofline production-readiness reassessment

Reviewed2026-11-06. Exact reviewed and hosted-verified source: **`775c62087aa2f443fc409aba750911215ba2aa2e` (F)**. Latest fresh implementation: **`389513c2d14bcffa3b992cd7b89989c0ebaedd6d` (F0)**; F differs only in documentation and appended evidence, with every executable/test/manifest input identical.

**Rating:8.6/10, up from8.0/10 using the same rubric.** The reviewed preview source is published on public GitHub main and is ready for scoped adopter use on the demonstrated stack, with actual two-platform hosted verification and an independently audited immutable release artifact. No unresolved material finding remains in this review. This does not establish an operated production service, universal compatibility, an OS sandbox or a support SLA.

**Integrated spec compliance:APPROVED. Source/configuration quality:APPROVED. Fresh and actual hosted evidence:ACCEPTED.** This whole-project reviewer did not implement the changes. It inspected the binding original/enterprise/readiness sources, integrated implementation, public setup/support, target adaptation and raw evidence; earlier task approvals were not accepted blindly. It raised and replayed concrete runtime-boundary findings before accepting their repairs, then reviewed later actual-CI failures and their bounded corrections. Administrative local documentation closeout remains the controller's responsibility and must continue naming verified F rather than imply a later code revision was executed.

## Original weighted rubric

Scores are engineering judgments, not probabilities. Weights are unchanged from the [previous independent reassessment](2026-11-05-adoption-readiness.md). The unrounded result is **8.625**, rounded to **8.6/10**; the previous8.025 rounded to8.0.

| Dimension | Weight | Previous | Current | Basis and limit |
| --- | ---: | ---: | ---: | --- |
| Correctness and reliability |30%|8.5|8.5|Public runtime execution/egress gaps were concretely repaired, native identity and artifact checks fail closed, and current fresh/hosted gates pass. Repeated genuine integration and timing failures required several repairs; one final successful PR/main pair and finite local repeats do not establish a long-run flake rate. Stronger boundaries justify confidence within scope, not a higher reliability score yet. |
| Portability |20%|8.0|9.0|Actual Linux x64 and Darwin arm64 Chromium cells reconcile exact-source native/runtime evidence; work-orders owns a fresh independent installation in each. A third, structurally different application retains37 identical core files and target-owned adapters. Other platforms/browsers/version tuples remain unverified. |
| Onboarding and distribution |15%|8.0|8.5|Source/installed Doctor, exact setup diagnostics, working source demo and own-history third-app bundle improve reproducibility. The initial blind agent trial failed and final adoption was assisted; source adaptation still requires engineering. No unassisted human study or published package exists. |
| CI and release readiness |15%|7.5|9.0|Both full current-source PR/main cells genuinely pass; real native GitHub acquisition, current-attempt/source pinning, archive digest/strict extraction and both compatibility receipts are independently audited. Main is still unprotected; operational deployment is untested and intentionally pending. |
| Documentation and developer experience |10%|8.5|8.5|Clone-visible authorities, setup, recovery, scope and detailed failed/successful evidence support recovery and review. The accumulated plan/history is dense, and status needed repeated reconciliation. New exact-F hosted claims require the factual local closeout; documentation completeness is not measured human usability. |
| Support and maintenance |10%|7.0|8.0|Named ownership, upgrade/recovery/security guidance, actual target history, compatible-upgrade and mutation/repetition drills improve maintainability. Support remains best effort, with no response SLA, demonstrated incident service or long-lived release history. |

Weighted calculation: `(8.5×30 + 9×20 + 8.5×15 + 9×15 + 8.5×10 + 8×10) /100 =8.625`.

## What is actually established

The [latest fresh F0 run](../verification/2026-11-05-fresh-overview-successor.md) completes25 steps in a new full-history clone with separate HOME, package stores and browser cache. Root/target installs download464/127 packages with zero reuse. Independent inspection verifies52 root and11 target direct dependency realpaths, all30 coverage floors in9 groups, all24 original floor objects and the complete232,196-byte original authored-record prefix. The local719-file ZIP is independently validated and remains explicitly synthetic/local evidence, not hosted provenance.

[PR3 run42160268263](https://github.com/deanmng1/proofline/actions/runs/42160268263), attempt1, passes both complete cells at F against D/main. After independent source/ref approval, main advances normally to exact F. [Actual push/main run42163108445](https://github.com/deanmng1/proofline/actions/runs/42163108445), attempt1, subsequently passes both full16-gate cells, both source-bound compatibility collectors and Linux release packaging. Independent authenticated API observations before/after content auditing confirm the same current run/attempt/source, jobs and all9 artifact digests.

| Actual main evidence | Linux x64 / ubuntu-24.04 | Darwin arm64 / macos-15 |
| --- | --- | --- |
| Job |127713200369|127713200413|
| Full unit |186 required /683 observed passes|186 required /683 observed passes|
| Full Chromium |34 required /47 observed passes,2workers|34 required /47 observed passes,2workers|
| Scenario / shards |24 /12+12 passes|24 /12+12 passes|
| Native indexes |62 root /11 target|62 root /11 target|
| Work-orders |10 gates,2unit/4browser,37matching core files|10 gates,2unit/4browser,37matching core files|
| Compatibility artifact |13478806980|13479090788|

The demonstrated tuple is Node24.22.1,pnpm11.24.0,React19.2.8,Vite6.4.3,Vitest/V8coverage3.2.7,Playwright1.62.1 and Chromium. Both cells meet all30 coverage floors. Each cell's nine deliberate expected-failure/retry/runtime-skip records remain failed and excluded from required passing authority.

Release artifact **13478931649** is **25,227,522 bytes**, SHA-256 **`1874e23ca6e855af34af112b6db31cfc425f102e65a92e01de701481c1401084`**. Independent strict extraction,719-file inventory, all16 embedded gate outcomes, native records and portability evidence agree with the actual user-facing hosted-proof CLI download. Both compatibility receipts are separately bound to authenticated jobs, upload artifact IDs/digests, current source/attempt, runtime, native indexes, full inventories, serialized target record and core37. Stored collector flags and the CLI's `authoritative:false` supplemental receipt were not treated as provenance by themselves. External API/log/content corroboration supplies the review's hosted finding. All5 authority and4 diagnostic archives are digest-checked; diagnostic and release ZIP contents are independently re-extracted and compared.

## Source, adoption and reliability boundaries

The [runtime-boundary cohort](../verification/2026-11-05-runtime-boundary-cohort.md) closes the independently found ordinary JavaScript execution planes: unsupported worker/loader APIs, effective network authority and public constructor aliases, child argument/environment snapshots, additional network/DNS interfaces and browser worker aliases. Original negative reproductions and supported positive execution were retained. All37 approved core files remain identical through F. This is a finite supported execution boundary, not containment of hostile operating-system/native code or an assurance about unreviewed future APIs.

Actual hosted checks exposed issues local runs missed: workflow context validity, CI Git metadata in a synthetic Playwright fixture, artificial UI latency, an aggregate probe budget, and cold real module preparation. Failed local/PR/main evidence remains preserved. Repairs were independently reviewed with causal RED/GREEN and unchanged fail-closed policies. Final unit fixtures retain real providers/HTTP interception, held login/membership ordering and exact logical refresh behavior. The accessibility test prepares the actual Overview module during collection, outside the per-test budget; original callbacks/query limits/axe assertions remain, and genuine browser workflows retain cold navigation. Neither this boundary nor a final green run proves absence of all timing failures.

[Roomboard's adopted own-history fixture](../pilots/roomboard-adoption.md) at `aeaf7a04e99f8e313dde1de6f10d39c6ca201722` preserves13 frozen baseline files and11 target commits;71 source files include37 byte-identical current core files. Reviewed native evidence establishes17 unit outcomes,2 genuine browser workflows and19 checks. Its initial blind trial stopped on an absent-tenant declaration gap; assistance, retries and subsequent core/cleanup upgrades are named. This demonstrates an unrelated target's feasible adoption, not an unassisted human or external-organization success.

[Maintenance drills](../verification/2026-11-05-maintenance-drills.md) retain a source-pinned31→36-file compatible upgrade with26 checks, harmless argv/native-outcome mutations and three real24-case two-worker repeats. These are finite historical observations with dependency reuse, not a new full37-file upgrade trial, a measured SLA or operational longevity.

## Remaining limits and next evidence

- The `0.9.0-preview.2` source is published on public GitHub main with manifest schema1; packaged distribution remains unpublished. No npm publication, tag, GitHub Release or deployment is established by an Actions release artifact.
- Two pinned full Chromium platform cells are demonstrated. Windows, other architectures, Firefox/WebKit and additional dependency versions require their own execution evidence before support claims expand.
- Agent-assisted adoption is not human onboarding validation. A genuinely independent human pilot and measured integration effort would materially strengthen onboarding confidence.
- CI enforcement remains partly procedural: final read-only API inspection finds main unprotected and private vulnerability reporting disabled. CODEOWNERS and documented instructions do not enable those controls; no settings changes were made.
- Long-running operational/reliability history, multiple independent maintainers and response/recovery SLAs remain absent. Preserve source-bound evidence across future dependency upgrades and releases rather than extrapolate from finite repeats.
- Live staging was explicitly left pending by the user. Its absence is not failure to perform an authorized deployment; deployment behavior remains unproven. Test/demo auth, adapters and harness contracts do not establish production-backend authorization, persistence or live-provider behavior.

The three readiness milestones now have accepted evidence within these boundaries. The final administrative closeout should update tracked status, compatibility/support wording and the append-only record to this exact reviewed result, without implying that pending deployment or broader external validation occurred.

Independent raw audit artifacts are retained under `output/readiness-milestones/final-independent-review/`, including `F-main-actual-hosted-acceptance.md`, `F-main-hosted-content-audit.json`, `F-main-supplemental-audit.json`, authenticated before/after observations, exact-source approvals, fresh8 acceptance and the earlier source/pilot/control audits. These ignored artifacts supplement the clone-visible reports and linked actual workflow runs; they are not required to infer the current milestone from a clean clone.
