# Proofline agent instructions

Proofline is a portable regression-testing harness for React/Vite applications. The insurance CRM is a reference implementation used to prove the harness; do not turn the portable core into CRM-specific product code.

## Binding project sources

Read these before changing the portable harness:

1. `docs/AGENT_HANDOFF.md`
2. `docs/superpowers/specs/2026-10-28-portable-hybrid-workflow-harness-design.md`
3. `docs/superpowers/plans/2026-10-28-portable-hybrid-workflow-harness.md`
4. `test-impact/execution-record.jsonl`

The design is the authority. The implementation plan is the reviewed execution sequence. Resume from the first incomplete task recorded in `.superpowers/sdd/2026-10-28-portable-hybrid-workflow-harness/progress.md`.

## Working rules

- Use deterministic Vitest tests for business rules, services, API contracts, event delivery, idempotency, tenant and role boundaries, and UI behavior.
- Use Playwright for a small set of genuine multi-screen workflows through visible navigation.
- CI test execution must never call an LLM or agent.
- Test selection, coverage ratchets, manifests, and evidence must fail closed when metadata is missing or ambiguous.
- Never contact live providers from tests. Test-only adapters must remain absent from production artifacts.
- Write or adjust a failing test before implementation when changing behavior, retain red/green evidence, and run the task's verification command.
- Review every implementation task for both spec compliance and code quality. Plans and designs receive at most three gap-review iterations before implementation.
- Append to `test-impact/execution-record.jsonl`; never rewrite earlier records.
- Make small commits whose subject explains the reason for the change. The user has authorized direct-to-`main` work for this repository.
- Do not push unless the active task explicitly authorizes it. A completed local implementation still requires the full verification gate in the plan.

## Completion standard

The project is complete only when every acceptance criterion in the design is implemented, every task in the plan is independently reviewed, and the full Task 8 completion gate passes from a fresh working state.
