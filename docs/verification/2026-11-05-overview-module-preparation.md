# Prepare the actual overview module for unit accessibility checks

Source E `291c1f8d4f384e7bd3fdf19e26f79ef7033d4023` passed its accepted E0 fresh gate with identical executable inputs, then actual PR 3 run `42153668145`, attempt 1, failed macOS coverage. Linux completed successfully. Both platforms first passed impact, full unit, browser, worker and shard execution. The sole macOS test failure is coverage invocation `36dbd86d-e700-4bfc-825a-451ce3561d79`: 119/120 CRM outcomes pass; the overview heading query fails after 1,187.657 milliseconds in **Loading route / Preparing the dashboard view**, before axe runs.

The failed coverage command prevents subsequent report normalization. The ratchet then rejects raw absolute coverage paths; those errors are downstream, not evidence that every listed floor regressed. No coverage policy, normalization fallback or floor reduction is proposed.

Both completed logs and all eight failed PR archives are retained under `output/readiness-milestones/hosted-successor-E/`. Linux log SHA-256 is `3cbf3f7514efe3a7c35917100f6cf92492e7bfd8e99ac12623b8bdfe15e7060e`; macOS is `b0ce6e750614b697fbd9ffd7ee7ca6216e91b8fa4208c487e30795e0d896dcc5`. Independent audit matches all archive bytes to authenticated API IDs and digests. PR compatibility uploads contain declarations only; their GitHub merge-SHA names are not source-bound compatibility receipts. The run remains release-ineligible and main remains at D.

## Controlled diagnosis

The immediate membership policy removes demo waits, but a cold real module can still consume the original one-second readiness window. The hosted log does not measure transform duration. Separate controlled coverage experiments establish this compatible causal mechanism without claiming the hosted transform took exactly 1,200 milliseconds.

A public Vite pre-transform hook waits only on the selected real module, then returns `null` without changing its contents. All original query arguments, real providers/router, full-container axe and zero-violation assertion remain. Each guarded run discovers 14 identities, selects the original overview case and skips 13.

| Coverage experiment | Result | Native invocation |
| --- | --- | --- |
| Ordinary cold baseline | Pass | `bb8261d0-7534-4ccc-b081-8ac421224e9c` |
| Real overview transform delayed 1,200 ms | Same route-fallback failure, with memberships already delivered | `ce4e7f80-b429-4ca2-88c5-212fca81c557` |
| Actual awaited module preparation under the same delay | Pass; diagnostic comparison only | `72605e94-4f19-4b6a-a9a0-4d932846213d` |
| Actual static module preparation under the same delay | Pass | `5ab55b82-a334-4170-9fa5-5c8cbd754987` |
| Concurrent real users-module transform delayed 1,200 ms | Pass while that unrelated import remains pending | `0041dd7f-0387-42fd-ae8a-32cea8eabcd6` |
| Static preparation with explicitly held memberships | Expected failure in **Loading workspace**, no protected requests before cleanup releases membership | `2c848039-3d04-426e-aefd-c4d8af911b7c` |

The held-membership control proves module preparation does not bypass TenantProvider. Current overview/API module initialization consists of declarations and literal data; requests and provider hooks execute on React mount. Independent review reconciles all six native reports/events and 1,974 retained evidence hashes. Raw configuration, traces, source audits and proposal are under `output/readiness-milestones/lazy-overview-diagnostic/`.

## Approved implementation boundary

Add one genuine static side-effect import of the actual overview module to the accessibility test file. The real lazy loader, Suspense route, providers, HTTP behavior, all case callbacks, query arguments and axe assertions remain. Browser/demo imports, cold browser navigation, production code and all 37 portable-core files remain unchanged. A dynamic alias import would trigger the existing fail-closed dependency policy; do not weaken the selector or add unrelated module ownership.

Preparation deliberately moves into **file collection and native discovery**, before individual tests. It is outside the per-test 10-second deadline and the one-second query window, under the existing runner/process bounds. No numeric timeout changes. This is a prepared-module unit accessibility fixture; it does not measure cold-route performance. Missing/broken real modules still fail collection or rendering, and browser workflows retain cold navigation coverage.

Independent design iteration 1 approves only the import and honest metadata-line/catalog updates. Source normalization, original body preservation, focused/full CRM normal and coverage, real selection preview, TypeScript/Biome and independent implementation review remain required. A new committed full fresh gate and exact source publication review precede a normal update to the same owned PR 3. Both full hosted cells and exact ref/source approval remain required before main advancement, followed by actual successful main/API/native/archive verification and final weighted reassessment. Live staging remains pending.

## Scoped implementation verification

The final code delta is exactly one bare static import at the start of `a11y.test.tsx`. Removing that line restores source E byte-for-byte. All 120 callback bodies and identity names remain unchanged; the other four fixture-policy files, production/router/browser code and core37 remain unchanged. Only two manifest and two registry anchors move by one line; the catalog is regenerated. Actual required census remains186unit/34browser. TypeScript, Biome, harness validation and whitespace pass.

| Actual local run | Result | Native invocation |
| --- | --- | --- |
| Accessibility normal | 14/14 pass | `e44692d5-dd5f-4a6b-a8f4-173e289c4775` |
| Accessibility coverage | 14/14 pass | `6b2be5d0-76ce-457d-b374-91ff6588396d` |
| Complete CRM normal | 120/120 pass | `9c1d5eda-a1d0-46dd-9eaf-56bfe1669ac9` |
| Complete CRM coverage | 120/120 pass | `c69d2678-480b-4e22-801e-1f9d0d5cb438` |
| Independent accessibility focus | 14/14 pass | `7c154e37-4253-40c7-bb0c-b0116a040d85` |

The actual selection preview discovers683unit/47browser identities, reports `executionBlocked:false` and chooses canonical-full unit/browser/worker/shard commands. Its twelve diagnostic reasons describe conservative fallback for metadata/direct-test changes; there is no dynamic-import closure error. A summary helper initially mistook any nonempty reason list for a blocked execution, then corrected its classification without changing raw files or outcomes. Static validation alone was not used as selection evidence.

Independent spec/code-quality review approves the exact source and metadata with zero findings. Raw implementation, preservation, native and selection receipts are under `output/readiness-milestones/overview-static-import/`; independent raw focus/review are under `final-independent-review/` and the local task ledger. These are reused-installation, reviewed dirty-source observations with explicitly synthetic PR identity `900000028-1`, not fresh or hosted proof. The [new committed F0 full fresh gate](2026-11-05-fresh-overview-successor.md) is independently accepted. Exact successor publication and the hosted sequence remain required.

The successor F `775c62087aa2f443fc409aba750911215ba2aa2e` subsequently passed exact publication review, both full PR cells and actual main run42163108445attempt1. Independent authenticated API/native/compatibility/archive audit accepts that source's real hosted evidence; see the [final hosted verification](2026-11-05-hosted-main-verification.md) and [8.6 reassessment](../reviews/2026-11-05-production-readiness.md). Live staging remains pending.
