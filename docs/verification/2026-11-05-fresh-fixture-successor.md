# Fresh verification of the deterministic fixture successor

Implementation **`f2b960d34d5ce0ed7472a6d1b646f4ecb90e52bc` (E0)** passes all 25 fresh validation steps against foundation `024aa838ade882fdcca46e63a4ae665569c16fd0`. Independent whole-project audit accepts the actual setup, native outcomes, coverage, separately installed work-orders target, local compatibility observation and release directory/ZIP. This result belongs to E0; earlier Q and D0 results remain separate historical snapshots.

The run uses a new Git clone without local-object/hard-link reuse, separate HOME/tooling/npm cache/pnpm stores/browser cache, Node 24.22.1, pnpm 11.24.0 and Git 2.51.0. Root dependencies download 464 packages with zero reuse; work-orders downloads 127 with zero reuse. Independent realpath checks confirm 52 direct root and 11 direct target packages remain within their own installations. Both source and installed preflight pass.

`GITHUB_ACTIONS=true`, main/push metadata and full-SHA `IMPACT_HEAD` exercise the CI-sensitive paths. Identity `900000022`, attempt 1, is explicitly synthetic local metadata. Compatibility output remains `local`, `executed-local` and `not-verified-by-collector`; it does not authenticate GitHub execution or deployment.

| Gate | Actual outcome | Native invocation |
| --- | --- | --- |
| Full unit | 186 required identities, 683 observed outcomes pass; 11 bound children | `0db5c15a-4651-4fef-86df-53c7bae448f1` |
| Full Chromium | 34 required identities, 47 observed outcomes pass; two workers | `a808a234-09e9-487d-95db-837405d08f28` |
| Explicit multi-worker scenario | 24/24 pass | `7a7b8752-edfe-4611-bcb6-9a1ad47bb713` |
| Shard 1/2 | 12/12 pass | `a196fef6-b152-48d8-9c8a-36091e167b42` |
| Shard 2/2 | 12/12 pass | `f006bcd5-c63a-418e-88f0-ce62483d772f` |

All original twelve completion commands, nine coverage groups and 30 current floor entries pass. All 24 original floor entries and the complete original 232,196-byte authored-record prefix remain unchanged. All ten independent work-orders gates pass, including 2/2 unit and 4/4 browser outcomes. All 37 core hashes match. Roomboard retains its independently reviewed current-core fixture; no core upgrade is required by the reference-app fixture changes.

Independent audit revalidates all 62 root and 11 target native-index entries, actual runtime, discovery/results/events, required outcomes, compatibility inventories and the serialized portability-record hash. Nine deliberately failed negative-fixture records remain failed and are excluded from passing authority. All nine `FIX-001` bindings genuinely pass exactly once without retries. The increase from 177 to 186 required unit identities consists of six new contracts and three previously existing regression cases; it is not nine new product capabilities.

The actual ZIP is **22,788,882 bytes**, SHA-256 **`12d8056706a1ec0eec7695c1012b1bf088ec4890d8c689317ea46d3273b6f50f`**. Strict independent extraction matches the release directory's **719-file** inventory and all 16 embedded gate outcomes are successful. The independent auditor's first helper call preceded extraction of the compatibility stdout; it stopped on the absent observation file, then independently extracted the real stdout and confirmed equality with the controller's copy. This was evidence-helper sequencing, not a failed product gate or a changed outcome.

Raw controller state/log, summary and faithfully extracted compatibility output are under `output/readiness-milestones/fresh-attempt-7/`. Independent acceptance, setup/negative-record classification, native audit and executable helper are under `output/readiness-milestones/final-independent-review/`. The [causal diagnosis and scoped implementation](2026-11-05-unit-fixture-policy.md) retain all failed hosted, instrumentation, focused and full-suite attempts.

A documentation-only successor may record this accepted E0 result with identical executable/test/manifest inputs. Its exact source requires independent publication review, its own full two-cell PR against D/main, exact ref/source approval and normal main advancement. Only a complete successful actual main push plus authenticated API/native/compatibility/archive verification supplies release authority. The final independent weighted rating remains pending. Live staging remains pending by the user's explicit choice.

E `291c1f8d` subsequently recorded this accepted E0 result with identical executable inputs and received publication approval. Its actual PR3 passed Linux but failed macOS overview readiness during coverage. See the [preserved failure and module-preparation repair](2026-11-05-overview-module-preparation.md) and the later [accepted F0 fresh result](2026-11-05-fresh-overview-successor.md). The failed E event remains release-ineligible.
