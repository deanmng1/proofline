# Actual hosted bootstrap observations

The reviewed candidate `63ae8d66a443843897f61d786d4ec5babb42d9aa` (C4) passed [PR run 42133726936](https://github.com/deanmng1/proofline/actions/runs/42133726936), attempt 1. Linux job `127616473437` and macOS job `127616473768` each passed all 16 required gates. Independent review reconciled the actual PR base `024aa838ade882fdcca46e63a4ae665569c16fd0`, source head, canonical workflow/current attempt, runner labels, source/ref ancestry and complete native contents before main advanced normally to that exact checked commit.

For each cell, independent native review accepted 670 unit outcomes, 47 Chromium outcomes, the 24-case multi-worker scenario, both 12-case shards, all ten work-orders gates and matching core37. All eight actual PR archives were retained through authenticated bounded transport, API SHA-256 checks and strict ZIP extraction. PR compatibility archives contain the declaration alone; they are not successful compatibility receipts or release authority.

## First main migration

Main advanced from legacy `f4f10c727edd2622182b93131f1eb7c31553f411` to exact C4 using a normal, non-force ref update with the old SHA checked. [Actual main run 42137240862](https://github.com/deanmng1/proofline/actions/runs/42137240862), attempt 1, completed with failure. Both governance checks correctly reject `git cat-file` for the old source's absent `proofline.harness.json`. No comparison base, parser, floor or missing-metadata behavior changed to make that event pass.

| Cell/job | Completed result |
| --- | --- |
| Linux `127628404592` | Record and coverage-ratchet comparison fail on the absent legacy manifest. Full unit, Chromium, worker/shards and coverage generation pass. |
| macOS `127628404914` | The same historical rejection, plus two genuine test failures: required-execution's multi-probe deadline during unit testing, and the unauthorized-role redirect query during CRM coverage. |

Impact preview/execution, installed preflight, portability and compatibility collection were skipped after prerequisites failed; they are not passing gates. Failed macOS coverage also leaves raw report paths unnormalized because normalization follows successful coverage behind `&&`; those later path/missing-file diagnostics are downstream symptoms. No report-path acceptance or coverage floor is relaxed.

The two additional macOS failures are distinct from the planned historical rejection. They now have separately [reviewed CLI-budget](2026-11-05-required-tuning-budgets.md) and [role-redirect](2026-11-05-role-redirect-determinism.md) test repairs; the original failures remain retained:

- `canonical tuning flags cannot omit required unit targets or browser identities`: 291/292 tools cases pass; the single case exceeds its 30-second aggregate deadline at 30.397 seconds, native `29a3f761-df76-45f4-b5f8-57ac500d6098`. Its eleven original CLI probes are preserved across independently bounded required cases; the required outcomes and flag forms remain mandatory.
- `app routing > denies_crm_direct_routes_to_an_authenticated_unauthorized_role`: 113/114 CRM coverage cases pass; the dashboard query expires at 1.049 seconds, native `1f3f1deb-cf0c-43f5-aa3d-c75f41a06d0c`. The test-local immediate tenant fixture preserves real auth, Viewer role, tenant/provider routing, all three direct-route denials and zero protected CRM requests.

## Retained evidence and release rejection

Both authenticated completed job logs and before/after API records are preserved. Linux log SHA-256 is `cb5a69b9f91c82e9a53946e1e08af1883d042cdaadb0e9a20081b79159842945`; macOS is `4630bd8fe514b6bc4594ccf5f9540c32cd82c9e42cf79b988f1539782d70de7b`. All eight first-main archives were downloaded through the native bounded GitHub transport, matched their API digests and passed strict ZIP extraction under `output/readiness-milestones/hosted-main-C4/failed-artifacts/`. Their outcomes remain failed and release-ineligible.

An actual read-only native `hosted-proof.mjs` audit of C4 also exits 1 and writes no successful observation receipt. The successful PR and failed main cannot satisfy the resolver's successful push/main authority. Its sanitized failure and exact arguments are retained in `actual-failed-main-rejection.{json,log}`; this is an operator negative check against GitHub, not a network call from a test.

## Reviewed next step

Independent operational review permits a repair-and-observation successor instead of an inaccurately labeled documentation-only change. Each actual repair now has causal evidence, retained original assertions and independent spec/quality approval. The integrated implementation also passes [new full fresh validation](2026-11-05-fresh-repair-successor.md) at D0 `dfe62fc`, with independent acceptance. Controller-owned metadata must make every required probe case explicit and preserve all original floors and append-only history.

The exact reviewed successor must have its own codex PR against C4/main and pass both full current-attempt cells/all 16 gates before a normal main advance. Its actual successful main run, immutable archive, native/portability contents and both compatibility observations then require authenticated API/job/artifact validation. Only that eligible successful push/main result can establish release proof. The first failed event stays unchanged; rerunning it cannot supply a new historical base. Final rating remains pending. Live staging stays pending by user choice.
