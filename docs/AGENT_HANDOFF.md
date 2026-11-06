# Proofline agent handoff

## Read current status first

[PROJECT_STATUS.md](PROJECT_STATUS.md) is the clone-visible recovery map. It names the active tracked design and execution checklist; resume from that checklist's first unchecked item. Do not infer unfinished work from historical plans or require an ignored `.superpowers/` directory or prior chat.

The seven adoption findings are complete at verified implementation `b368d85`; the [review](reviews/2026-11-05-adoption-readiness.md) rates that unpublished preview 8.0/10, up from 6.0/10. The active increment is now the [production-readiness evidence design](superpowers/specs/2026-11-05-production-readiness-design.md) and [plan](superpowers/plans/2026-11-05-production-readiness.md), starting at `024aa83`. The user authorized parallel implementation of the three proposed readiness milestones, testing and fresh independent reassessment. Resume that tracked plan. Staging workflow preparation/testing is authorized; the user explicitly left live staging pending. No new completion or score is yet claimed.

The last published main source is `a8b201a6` (D). The local fixture-policy repair has independent scoped approval and awaits a new committed fresh gate. Its actual full PR passed, but actual main run `42146835227` failed a macOS impact overview heading query before axe; the native hosted verifier rejected the run despite Linux's release-named archive. Resume the [reviewed unit-fixture repair](verification/2026-11-05-unit-fixture-policy.md), then a new fresh/PR/main/API sequence and final independent rating. Preserve the failed evidence and all original timing/security assertions.

## Product and boundaries

Proofline is portable regression-testing tooling for React/Vite applications. The insurance CRM is a reference proof, not product code to copy into the reusable core. Target rules, pages, adapters and tests belong to their application.

- Deterministic Vitest tests own business rules, services, API contracts, event delivery, idempotency, tenant/role boundaries and focused UI behavior.
- Playwright owns a small set of real workflows through visible navigation.
- Manifest-owned impact selection gives diagnostics; full unit/browser gates remain authoritative.
- Required native outcomes, coverage ratchets, manifests and authored evidence fail closed.
- Tests use deterministic fakes and never call live providers, models or agents.
- Test/demo entrypoints are capability-gated and numeric-loopback only. Production auditing rejects test adapters and markers.

## Durable authorities

1. [AGENTS.md](../AGENTS.md).
2. [Current status](PROJECT_STATUS.md), active design/plan linked there.
3. [Original portable design](superpowers/specs/2026-10-28-portable-hybrid-workflow-harness-design.md).
4. [Enterprise verification design](superpowers/specs/2026-11-04-enterprise-verification-design.md).
5. [Append-only execution record](../test-impact/execution-record.jsonl).
6. [Portable contract](PORTABLE_TEST_AUTOMATION.md) and [testing guide](TESTING.md).

Ignored native logs and working ledgers supplement these checked-in sources. They are not mandatory recovery inputs. Dated showcase evidence remains a snapshot of its named source commit, not a new completion claim.

## Completed historical milestones

| Milestone | Verified implementation | Closeout |
| --- | --- | --- |
| Original eight-task portable harness | `4dc77a6` | Full fresh-state gate recorded in authored history |
| Genuine required outcomes, preserved failure artifacts, verified release output, unrelated work-orders app | `4feb057` | Local 18-step gate; authored final evidence at `6324ffc` |
| Browser/PDF showcase refresh and second-app recording | `d8fef71` | Scoped playback/layout/evidence checks and independent review |

The original implementation plan and its early handoff statements are historical execution records. The original eight tasks are complete; they are not the active action queue. The later adoption audit identified additional external-user gaps rather than reversing those scoped acceptance results.

## Execution rules

Use the existing suitable checkout. Direct local work on main is authorized for this project; make small commits explaining why changes are needed. Do not push, tag, publish or deploy without explicit task authorization. Preserve preexisting local tooling and user files.

Write failing tests before behavior changes, retain RED/GREEN evidence and run the task's checks. Each implementation task needs independent spec-compliance and code-quality review. Preserve original coverage minima and append JSONL; never rewrite earlier records. The full original Task 8 gate must pass from cleared generated state at a committed implementation head before a completed portable-core increment is claimed.

Fresh-install checks must use separate external repositories, actual declared dependencies and browser binaries rather than host dependency links. Pin Node/pnpm in child PATH as well as the outer command. Distinguish real local testing under synthetic CI identity from a hosted workflow/API/deployment result.

## Preview identity

The package is unpublished source preview `0.9.0-preview.2`, manifest schema 1. It is distinct from the original dashboard 0.8.0 history/tag. [Support](../.github/SUPPORT.md) and [security reporting](../.github/SECURITY.md) state compatibility, scope and upgrade/release-evidence requirements. No remote publication is implied.

## Current runtime follow-up

Read the active plan's integrated final cohort checklist and [cohort report](verification/2026-11-05-runtime-boundary-cohort.md). All five runtime findings are closed; the 37 core files remain unchanged through candidate `63ae8d6`. The [25-step fresh local gate](verification/2026-11-05-fresh-production-readiness.md) at `10dde98` and [current Roomboard fixture](pilots/roomboard-adoption.md) are independently accepted.

C4 passed both actual PR cells, then its first-main migration failed on legacy history and two genuine timing failures. Independently reviewed repairs passed the new D0 `dfe62fc` fresh gate: 177 required/677 observed unit, 34 required/47 browser, workers/shards, both new installations, all floors and verified ZIP. D `a8b201a6` preserved those executable inputs, passed its own full PR and advanced main normally. Its actual main subsequently failed the macOS overview readiness query described above. Preserve each source's evidence and every failed run without promoting local or PR results to release authority.

The approved continuation requires the reviewed fixture-policy repair, a new committed full fresh gate, exact publication approval, its own PR against D/main with both complete cells, exact source/ref approval and normal main advancement. Actual successful main and strict API/native/compatibility/archive verification precede final weighted reassessment. Do not bypass history, coverage or native authority, deploy, or request staging credentials. Live staging stays pending by user choice.
