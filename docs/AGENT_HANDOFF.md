# Proofline agent handoff

## Read current status first

[PROJECT_STATUS.md](PROJECT_STATUS.md) is the clone-visible recovery map. It names the active tracked design and execution checklist; resume from that checklist's first unchecked item. Do not infer unfinished work from historical plans or require an ignored `.superpowers/` directory or prior chat.

The seven adoption findings are complete at verified implementation `b368d85`; the [review](reviews/2026-11-05-adoption-readiness.md) rates that unpublished preview 8.0/10, up from 6.0/10. The active increment is now the [production-readiness evidence design](superpowers/specs/2026-11-05-production-readiness-design.md) and [plan](superpowers/plans/2026-11-05-production-readiness.md), starting at `024aa83`. The user authorized parallel implementation of the three proposed readiness milestones, testing and fresh independent reassessment. Resume that tracked plan. Staging workflow preparation/testing is authorized; the user explicitly left live staging pending. No new completion or score is yet claimed.

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

Read the active plan's integrated final cohort checklist and [cohort report](verification/2026-11-05-runtime-boundary-cohort.md). The original evaluator closed all five findings at `8c7614f`. The [test-only selection repair](verification/2026-11-05-selection-import-repair.md) is independently approved at `67d8366`; all 37 core files remain unchanged. [Roomboard's corrected adapter and current-source bundle](pilots/roomboard-adoption.md) are independently approved at target `aeaf7a0`, with 17 unit outcomes, two browser workflows and 19 checks passing. Fresh attempt 4 rejected an unhandled coverage-worker RPC timeout; the [bounded test-only repair](verification/2026-11-05-impact-rpc-responsiveness.md) passes all 139 affected coverage tests and independent review. A new complete fresh root/work-orders gate, actual hosted proof and final rating remain required. Failed attempts and scoped results remain separate. No remote source change has occurred yet.
