# CI-sensitive selection fixture repair

The first complete candidate PR check at source `0e38d1652ee583e0bd169272909f07e309c3a0e3` is [run 42128347489](https://github.com/deanmng1/proofline/actions/runs/42128347489), attempt 1. This is actual GitHub execution, distinct from the accepted local gate at `10dde98`. Remote main remains legacy `f4f10c7`; no main advance is permitted from a failed candidate check.

The completed Linux job `127598247190` fails the same single selection-fixture test during impact, full unit and coverage execution: `runs_only_one_declared_vitest_and_playwright_identity`. Its strict JSON parser receives a `GitCommitInfo` prefix. Browser, explicit multi-worker and both scenario shard gates pass. The subsequent coverage check correctly rejects unnormalized absolute report paths: the coverage command only normalizes reports after all coverage tests succeed, and that prerequisite failed. No path acceptance or coverage floor is relaxed. The completed macOS job `127598246968` has the same JSON-fixture failure and also fails data-gallery UI queries: the table query during impact, and the chart query during unit/coverage. Those additional UI failures have a separately [diagnosed and independently reviewed test-fixture repair](2026-11-05-data-gallery-determinism.md); its full normal/PR CRM groups pass 114/114. Both jobs completed with failure; portability and release packaging were skipped. No full Linux or macOS compatibility success is claimed.

## Cause and bounded repair

Playwright 1.62.1 enables optional Git commit/diff enrichment when GitHub Actions metadata is present. This isolated synthetic fixture uses a JSON stdout protocol. Its optional Git-info plugin attempts an unsupported Git argv, the existing runtime guard rejects that argv, and Playwright logs the caught exception to stdout before its JSON. The fixture did not explicitly disable that unrelated enrichment. Canonical application reporting and native source identity are separate and remain unchanged.

Only the body of `tools/impact/src/main-selection.test.ts` changes. The original first case now forces and asserts `GITHUB_ACTIONS=true`, making ordinary local runs exercise the CI condition, and its generated synthetic Playwright config sets `captureGitInfo: {commit:false,diff:false}`. The original finally block restores stubbed environment. All 31 original assertion expressions, three titles, time limits and the bound declaration at line 38 remain unchanged. The strict JSON parser, stdout forwarding and unsafe-Git guard remain intact. No portable core, real application/browser configuration, reporter, retry, dependency, manifest, floor or provider changes.

## Local evidence

These are local diagnostic runs with reused dependencies and browser cache, under explicitly synthetic PR metadata where applicable. They are not fresh installations or successful hosted checks.

| Check | Result | Native invocation |
| --- | --- | --- |
| Unchanged C2 full impact under PR metadata | 138 pass, one expected failure | `2dca6dd1-baec-4c23-9f6d-a50491cb4d7c` |
| Forced CI regression before fixture config repair | Expected GitCommitInfo/JSON failure | `57e669bd-f9ca-4121-b20f-34687b63a310` |
| Same forced case after repair | 1/1 pass | `a946480e-15f7-4177-ad87-9727f3da11da` |
| Full impact, normal local context | 139/139 pass, no unhandled errors | `7cf0d9f2-11b5-477f-a965-a5269f6bb13b` |
| Full impact, same PR context | 139/139 pass, no unhandled errors | `5bb2b2e8-bff9-4e59-b79c-e14bf652b69e` |
| Unchanged C2 tools suite under PR context | 292/292 pass, no unhandled errors | `4fdc9e60-a728-439d-a4b4-2f61cedf0928` |

The repaired full PR-context impact run genuinely executes one selected unit (`a72a6041`) and one selected Chromium test (`59d163cd`). Strict impact TypeScript, one-file Biome and patch whitespace pass. All 37 portable core hashes remain unchanged from the reviewed cohort/current Roomboard fixture. No further core upgrade is required. Coverage will be measured by the subsequent real full hosted candidate checks; these scoped local runs do not claim a new complete gate.

Evidence and before/after source invariants are preserved under `output/readiness-milestones/pr-context-diagnostic/`; authenticated run/job metadata and completed logs are preserved under `output/readiness-milestones/hosted-candidate-C2/`. Independent spec and quality review approved this exact one-file repair with zero findings, including an independent 3/3 focused native run `faa591b4-45c4-426e-8384-4b57c4e18b39`. Actual completed job logs correlate the JSON failure on both cells. All eight failed-run artifacts are retained with authenticated metadata, API digest checks and strict ZIP extraction. Both observed failure classes now have independently approved scoped repairs. Exact combined successor source-publication approval and both full subsequent PR cells remain required. The failed candidate run remains immutable and ineligible. Live staging remains pending by user choice; no provider invocation, tag/release, settings change or deployment occurred.
