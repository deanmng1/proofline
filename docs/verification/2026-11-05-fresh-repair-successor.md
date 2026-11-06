# Fresh verification of the repair successor

Implementation `dfe62fc829c0dd1809802950d18a87ac7fcf7fa7` (D0), compared with `024aa838ade882fdcca46e63a4ae665569c16fd0`, passes all 25 fresh validation steps. Independent whole-project review accepts the actual setup, native outcomes, coverage, separate work-orders installation, compatibility observation and release directory/ZIP. This is new evidence at D0; the earlier accepted Q result remains a separate historical snapshot.

The run uses a new Git clone without local-object/hard-link reuse, separate HOME/tooling/stores/browser cache, pinned Node 24.22.1, pnpm 11.24.0 and actual Git 2.51.0. Root dependencies download 464 packages with zero reuse; work-orders downloads 127 with zero reuse. Independent realpath checks confirm 52 direct root packages and 11 direct target packages resolve within their own installations.

Unlike the earlier local run, this run explicitly enables `GITHUB_ACTIONS=true`, main/push metadata and a full-SHA `IMPACT_HEAD`. Identity `900000021`, attempt 1, is expressly synthetic local metadata. It does not authenticate GitHub execution or deployment. Compatibility output retains `local`, `executed-local` and `not-verified-by-collector`.

| Required gate | Actual outcome | Native invocation |
| --- | --- | --- |
| Full unit | 177 required identities, 677 observed outcomes pass | `8850b1f2-75e4-4fed-b143-6a6fb1cd5420` |
| Full Chromium | 34 required identities, 47 observed outcomes pass; two workers | `8b057dd6-a4cd-428e-8677-5f15f8bc4cd3` |
| Explicit multi-worker scenario | 24/24 pass | `4b2d08aa-bd21-4381-bddf-14583eea0619` |
| Shard 1/2 | 12/12 pass | `0a7dda62-d1cf-4db2-bc67-9a1b83b7381f` |
| Shard 2/2 | 12/12 pass | `ce063874-5d75-4f20-a49f-6afd1a0aaf1c` |

All original twelve completion commands, nine coverage groups and 30 current floor entries pass. All 24 original floor entries and the full original 232,196-byte authored-history prefix remain unchanged. All ten independent work-orders gates pass, including 2/2 unit and 4/4 browser outcomes, with all 37 core hashes matching. Roomboard's independently approved current fixture uses the identical core; no additional core upgrade is required by these test-only repairs.

Independent audit revalidates all 62 root and 11 target native-index entries, actual runtime on each record, bound discovery/results/events, full compatibility inventories and serialized portability-record hash. Nine deliberately failed negative-fixture records remain failed and are excluded from authoritative passing gates. Seven earlier CLI probes now have separate required identities; the count increase is finer identity granularity, not seven new product features.

The actual release ZIP is **22,965,355 bytes**, SHA-256 **`77e852dc3e5a64c1d6e1f6919deebc74bf6f22d3d30a4e5365bb8bdcf6df2233`**. Strict independent extraction matches the release directory's **719-file** inventory. All 16 embedded gate outcomes are successful. After the completed gate, a summary helper initially used an incorrect manifest filename; it was corrected to read `release.json`. This was bookkeeping after the successful 25-step controller, and did not change a test result, receipt or archive.

Raw controller state/log, native source references, faithfully extracted compatibility output and summary are under `output/readiness-milestones/fresh-attempt-6/`. Independent acceptance and executable audit are under `output/readiness-milestones/final-independent-review/`. Original local/candidate/first-main failures and intermediate static-binding/coverage shortfalls remain retained.

The documentation-only successor D `a8b201a6` recorded this accepted D0 result with byte-identical executable/test/manifest inputs. It received independent publication approval, passed its own full two-cell PR 2 and advanced main normally. Its actual main later failed a macOS impact heading query before axe; see the [current diagnosis and reviewed repair](2026-11-05-unit-fixture-policy.md). That failed event remains release-ineligible. A new repaired successor requires its own fresh/PR/main/API sequence and final independent rating. Live staging remains pending by user choice.
