# Proofline project handoff

## Current objective

Complete the approved portable hybrid regression harness so an agent can adapt it to another React/Vite application, author deterministic automated tests up front, and leave a CI pipeline that repeatedly runs those tests without model or token cost.

The portable default is hybrid:

- Vitest owns domain rules, services, API contracts, event delivery, idempotency, tenant and role boundaries, and focused UI behavior.
- Playwright owns a small set of real browser workflows covering authentication, protected routes, visible navigation, cross-screen state, recovery, and guard behavior.
- Manifest-owned impact selection provides fast diagnostics and fails closed on uncertainty.
- Canonical full unit and browser suites remain the correctness authority in CI.
- Coverage ratchets and an append-only JSONL execution record prevent silent weakening.
- Optional state-machine generation is parked for target applications whose lifecycle complexity justifies it.

## Current hardening increment

The original eight-task portable harness implementation completed its fresh-state gate at `4dc77a6`. The user subsequently authorized four additional priorities: required-test execution verification, preserved invocation failure artifacts, verified release artifacts and standalone second-app validation. The active design is [enterprise verification](superpowers/specs/2026-11-04-enterprise-verification-design.md), with its [execution plan](superpowers/plans/2026-11-04-enterprise-verification.md) and recovery ledger at `.superpowers/sdd/2026-11-04-enterprise-verification/progress.md`. The original design remains binding. This increment starts at `cfe5f11`; no push or deployment is authorized.

## Durable source of truth

- Design: `docs/superpowers/specs/2026-10-28-portable-hybrid-workflow-harness-design.md`
- Implementation plan: `docs/superpowers/plans/2026-10-28-portable-hybrid-workflow-harness.md`
- Execution evidence: `test-impact/execution-record.jsonl`
- Active recovery ledger: `.superpowers/sdd/2026-10-28-portable-hybrid-workflow-harness/progress.md`
- Original shared conversation: `https://chatgpt.com/s/cx_6ae2878b2bc081919a2bc892df74148c`

## Repository state at handoff

- Repository: `https://github.com/deanmng1/proofline`
- Local checkout: `/Users/dio/Documents/Codex/2026-10-27/new-chat/insurance-crm-testbed`
- Branch: `main`
- Approved-plan commit: `f4f10c7 docs: approve portable hybrid harness design`
- The design and implementation plan completed their requested review iterations and were approved.
- The implementation ledger lists eight sequential tasks; none is complete yet.
- A clean pre-Task-1 `pnpm test` baseline passed all 10 Nx test targets.
- Task 1's generated brief already exists in the SDD workspace.

## Why this project exists

The insurance CRM is a testbed for the future workflow: receive business rules, implement behavior, author durable regression tests, map nearby code changes to relevant tests, and run those tests in CI without an agent. The CRM itself and its tests are not intended to be copied into a target application. The reusable value is the manifest, validators, adapters, impact-selection logic, coverage/evidence governance, adaptation protocol, and browser-workflow pattern.

## Acceptance outcome

Completion means all design acceptance criteria are machine-verifiable, including a navigated unauthenticated-to-finance golden journey, role and tenant denial, recoverable command behavior, capability-gated test entrypoints, production-negative builds, deny-by-default egress tests, durable checkpoint/replay tests, exact ownership/test bindings, monotonic coverage, append-only evidence, canonical full fallback, and the full Task 8 verification command passing.

## Execution rules carried from the conversation

- Work directly on `main` with small, reasoned commits; the user does not want epics or issues for this two-person project.
- Review implementation tasks independently and iterate on Critical/Important findings before advancing.
- Record meaningful design, implementation, failure, repair, review, and verification evidence.
- Continue until the acceptance criteria are genuinely complete rather than stopping at a partial scaffold.
- Cloud execution is desirable because it survives laptop shutdown, but a local Codex subagent inherits the local host. This handoff exists so the same goal can resume safely in a published Codex Cloud environment later.
