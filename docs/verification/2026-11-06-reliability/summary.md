# Supplementary verification reliability

3 runs / 3 attempts; 1 distinct observations.

Repository: deanmng1/proofline; workflow: .github/workflows/verify.yml (ID 399855475).
Window by run creation: 2026-11-05T00:00:00Z through 2026-11-06T17:51:32Z; latest observation 2026-11-06T17:51:32.857Z.
History: finite-observed-sample.

| Attempt group | Total | Known terminal | Unknown | Outcomes |
| --- | ---: | ---: | ---: | --- |
| First attempt | 3 | 3 | 0 | {"failure":2,"success":1} |
| Retries | 0 | 0 | 0 | {} |

| Platform | Observed jobs | Missing jobs | Outcomes |
| --- | ---: | ---: | --- |
| linux-x64-chromium | 3 | 0 | {"failure":1,"success":2} |
| darwin-arm64-chromium | 3 | 0 | {"failure":2,"success":1} |

| Platform / gate | Known terminal | Unknown | Outcomes |
| --- | ---: | ---: | --- |
| linux-x64-chromium / lint | 3 | 0 | {"success":3} |
| linux-x64-chromium / typecheck | 3 | 0 | {"success":3} |
| linux-x64-chromium / manifest | 3 | 0 | {"success":3} |
| linux-x64-chromium / production | 3 | 0 | {"success":3} |
| linux-x64-chromium / record | 3 | 0 | {"failure":1,"success":2} |
| linux-x64-chromium / impactPreview | 3 | 0 | {"skipped":1,"success":2} |
| linux-x64-chromium / impact | 3 | 0 | {"skipped":1,"success":2} |
| linux-x64-chromium / unit | 3 | 0 | {"success":3} |
| linux-x64-chromium / browser | 3 | 0 | {"success":3} |
| linux-x64-chromium / browserScenario | 3 | 0 | {"success":3} |
| linux-x64-chromium / browserScenarioShard1 | 3 | 0 | {"success":3} |
| linux-x64-chromium / browserScenarioShard2 | 3 | 0 | {"success":3} |
| linux-x64-chromium / coverage | 3 | 0 | {"success":3} |
| linux-x64-chromium / coverageCheck | 3 | 0 | {"failure":1,"success":2} |
| linux-x64-chromium / whitespace | 3 | 0 | {"success":3} |
| linux-x64-chromium / portability | 3 | 0 | {"skipped":1,"success":2} |
| darwin-arm64-chromium / lint | 3 | 0 | {"success":3} |
| darwin-arm64-chromium / typecheck | 3 | 0 | {"success":3} |
| darwin-arm64-chromium / manifest | 3 | 0 | {"success":3} |
| darwin-arm64-chromium / production | 3 | 0 | {"success":3} |
| darwin-arm64-chromium / record | 3 | 0 | {"failure":1,"success":2} |
| darwin-arm64-chromium / impactPreview | 3 | 0 | {"skipped":1,"success":2} |
| darwin-arm64-chromium / impact | 3 | 0 | {"skipped":1,"failure":1,"success":1} |
| darwin-arm64-chromium / unit | 3 | 0 | {"failure":1,"success":2} |
| darwin-arm64-chromium / browser | 3 | 0 | {"success":3} |
| darwin-arm64-chromium / browserScenario | 3 | 0 | {"success":3} |
| darwin-arm64-chromium / browserScenarioShard1 | 3 | 0 | {"success":3} |
| darwin-arm64-chromium / browserScenarioShard2 | 3 | 0 | {"success":3} |
| darwin-arm64-chromium / coverage | 3 | 0 | {"failure":1,"success":2} |
| darwin-arm64-chromium / coverageCheck | 3 | 0 | {"failure":1,"success":2} |
| darwin-arm64-chromium / whitespace | 3 | 0 | {"success":3} |
| darwin-arm64-chromium / portability | 3 | 0 | {"skipped":2,"success":1} |

- Supplementary aggregate observations; required native verification and release authority are unchanged.
- PR runs are outside this sample; their original outcomes are unchanged.
- Per-test flake rates and infrastructure causes are unknown from workflow aggregates.
- Unobserved history is unknown; finite samples do not establish future reliability or an SLA.
- Gate names describe the current canonical workflow; historical absent gates remain unknown.
