# Supplementary verification reliability

7 runs / 7 attempts; 1 distinct observations.

Repository: deanmng1/proofline; workflow: .github/workflows/verify.yml (ID 399855475).
Window by run creation: 2026-10-09T21:30:15Z through 2026-11-08T21:30:15Z; latest observation 2026-11-08T21:30:15.272Z.
History: finite-observed-sample.

| Attempt group | Total | Known terminal | Unknown | Outcomes |
| --- | ---: | ---: | ---: | --- |
| First attempt | 7 | 7 | 0 | {"failure":4,"success":3} |
| Retries | 0 | 0 | 0 | {} |

| Platform | Observed jobs | Missing jobs | Outcomes |
| --- | ---: | ---: | --- |
| linux-x64-chromium | 5 | 2 | {"failure":1,"success":4} |
| darwin-arm64-chromium | 5 | 2 | {"failure":2,"success":3} |

| Platform / gate | Known terminal | Unknown | Outcomes |
| --- | ---: | ---: | --- |
| linux-x64-chromium / lint | 5 | 2 | {"success":5} |
| linux-x64-chromium / typecheck | 5 | 2 | {"success":5} |
| linux-x64-chromium / manifest | 5 | 2 | {"success":5} |
| linux-x64-chromium / production | 5 | 2 | {"success":5} |
| linux-x64-chromium / record | 5 | 2 | {"failure":1,"success":4} |
| linux-x64-chromium / impactPreview | 5 | 2 | {"skipped":1,"success":4} |
| linux-x64-chromium / impact | 5 | 2 | {"skipped":1,"success":4} |
| linux-x64-chromium / unit | 5 | 2 | {"success":5} |
| linux-x64-chromium / browser | 5 | 2 | {"success":5} |
| linux-x64-chromium / browserScenario | 5 | 2 | {"success":5} |
| linux-x64-chromium / browserScenarioShard1 | 5 | 2 | {"success":5} |
| linux-x64-chromium / browserScenarioShard2 | 5 | 2 | {"success":5} |
| linux-x64-chromium / coverage | 5 | 2 | {"success":5} |
| linux-x64-chromium / coverageCheck | 5 | 2 | {"failure":1,"success":4} |
| linux-x64-chromium / whitespace | 5 | 2 | {"success":5} |
| linux-x64-chromium / portability | 5 | 2 | {"skipped":1,"success":4} |
| darwin-arm64-chromium / lint | 5 | 2 | {"success":5} |
| darwin-arm64-chromium / typecheck | 5 | 2 | {"success":5} |
| darwin-arm64-chromium / manifest | 5 | 2 | {"success":5} |
| darwin-arm64-chromium / production | 5 | 2 | {"success":5} |
| darwin-arm64-chromium / record | 5 | 2 | {"failure":1,"success":4} |
| darwin-arm64-chromium / impactPreview | 5 | 2 | {"skipped":1,"success":4} |
| darwin-arm64-chromium / impact | 5 | 2 | {"skipped":1,"failure":1,"success":3} |
| darwin-arm64-chromium / unit | 5 | 2 | {"failure":1,"success":4} |
| darwin-arm64-chromium / browser | 5 | 2 | {"success":5} |
| darwin-arm64-chromium / browserScenario | 5 | 2 | {"success":5} |
| darwin-arm64-chromium / browserScenarioShard1 | 5 | 2 | {"success":5} |
| darwin-arm64-chromium / browserScenarioShard2 | 5 | 2 | {"success":5} |
| darwin-arm64-chromium / coverage | 5 | 2 | {"failure":1,"success":4} |
| darwin-arm64-chromium / coverageCheck | 5 | 2 | {"failure":1,"success":4} |
| darwin-arm64-chromium / whitespace | 5 | 2 | {"success":5} |
| darwin-arm64-chromium / portability | 5 | 2 | {"skipped":2,"success":3} |

Unclassified legacy jobs: 2. Current platforms and gates are unknown for these jobs.

- Supplementary aggregate observations; required native verification and release authority are unchanged.
- PR runs are outside this sample; their original outcomes are unchanged.
- Per-test flake rates and infrastructure causes are unknown from workflow aggregates.
- Unobserved history is unknown; finite samples do not establish future reliability or an SLA.
- Gate names describe the current canonical workflow; historical absent gates remain unknown.
