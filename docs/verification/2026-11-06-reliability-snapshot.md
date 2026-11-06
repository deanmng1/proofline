# Initial actual reliability observation

The native source CLI at `fa5be0b2fe6e6abbe35b361cc6aac60f5bcf8e7f` successfully collected actual GitHub REST history outside tests. The [exact observation](2026-11-06-reliability/observation.json.txt), [machine summary](2026-11-06-reliability/summary.json.txt), [readable summary](2026-11-06-reliability/summary.md) and [SHA-256 inventory](2026-11-06-reliability/SHA256SUMS) are byte-for-byte copies of its immutable output. The JSON payloads use the .json.txt extension for verbatim archival alongside the source formatter; their bytes and hashes equal the native .json outputs. Transport remains `github-api` and authority remains `supplementary-only`; these files do not authorize releases or replace required native test evidence.

The window selects run creation from `2026-11-05T00:00:00Z` through `2026-11-06T17:51:32Z`; collection observed at `2026-11-06T17:51:32.857Z`, exit0. Three default-branch push runs and their three first attempts were observed, with no retries or missing first attempts. PR/fork runs are explicitly outside the sample.

| Historical main run | Source | Original conclusion |
| --- | --- | --- |
| [42137240862](https://github.com/deanmng1/proofline/actions/runs/42137240862) | `63ae8d66a443843897f61d786d4ec5babb42d9aa` | failure |
| [42146835227](https://github.com/deanmng1/proofline/actions/runs/42146835227) | `a8b201a6c6acaeb6c964a759ca782e996d82a23f` | failure |
| [42163108445](https://github.com/deanmng1/proofline/actions/runs/42163108445) | `775c62087aa2f443fc409aba750911215ba2aa2e` | success |

Both earlier failures remain failed. This describes the historical main sources, including the subsequently repaired failures; it is not a new execution of the current collector or application tests at those sources. The three-run sample establishes no long-term flake rate, future reliability or SLA. The summary preserves platform, gate, skipped and failed outcomes rather than presenting a later success as a rewritten history.

## Native integration repair and limits

The first actual CLI collection at `17bdfa50b997765a30a30738148a1b887d856782` failed and remains retained in `output/adopter-confidence/reliability-actual/snapshot-1-operation.{json,log}`. A separately labeled diagnostic wrapper located the failure; it was not promoted to native transport evidence. Repeated authenticated read-only observations showed stable list/global-run `updated_at=2026-11-06T04:59:00Z` and attempt `updated_at=2026-11-06T04:59:01Z` for the same successful F run, source, status and attempt. The differing endpoint views were not actual run advancement.

A causal offline regression retained that native difference before the narrowly reviewed repair. Only cross-endpoint update-time equality was removed. Exact source/attempt/status/conclusion checks and list-to-final global-run advancement checks remain. The subsequent native CLI collection used a new output directory and succeeded; the initial failure was not overwritten or relabeled. Independent task repair review approved the correction together with fork exclusion, retained known history and timestamp interval fixes.

The operator passed credentials only through the child environment, never command arguments or saved files. Reproduction uses the [documented collector](../RELIABILITY.md) with the same repository/workflow/window and a new physical output path; a later query is a new observation and may reflect availability changes. The saved snapshot is supplementary aggregate API evidence, with authenticated operator acquisition recorded separately. Current-source full/fresh/hosted verification and repository protection read-back are separate gates, not established by this historical sample.
