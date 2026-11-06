# Roomboard baseline before harness adoption

This is a separately authored reference application for a future independent **agent** adaptation trial. It is not evidence of a human adopting Proofline or an organization using it in production. No adoption outcome has been claimed yet.

## Frozen source

- Standalone Roomboard-only Git baseline: `91ded2ab018324357e7457486b2bc6292fb8c386`.
- Thirteen source files and their SHA-256 values are recorded in [the baseline inventory](roomboard-baseline.json).
- The same source is introduced under [examples/roomboard](../../examples/roomboard/README.md) in the host history before any adaptation. Its initial host commit can be recovered with `git log --reverse --format=%H -- examples/roomboard/src/model.mjs`. Later adapted files must not replace this baseline evidence.
- The baseline has ordinary React/Vite source, its own frozen lockfile, runtime pin, MIT license and six domain tests. It contains no Proofline manifest, adapters, rule registry, lifecycle/workflow metadata, guarded runner configuration or test entrypoint. A standalone Git bundle of this baseline is retained with local implementation evidence.

## Actual application contract

Rooms and Reservations are separate navigable screens. A user chooses a seeded room and morning/afternoon slot, supplies a contact name and creates a reservation. A conflicting active reservation is rejected. On Reservations, cancellation changes its visible status and makes the slot available to reserve again.

The pure model preserves stable command receipts: an identical command replays its accepted response, while a different payload under the same identifier is rejected. Cancel is harmless after cancellation. State is in memory per page instance and resets on reload. There is no authentication, role, tenant, live provider or database contract to invent in the trial.

## Baseline verification

Node 24.22.1 and pnpm 11.24.0 were used with a new HOME, package store and actual frozen public-registry installation in an external Roomboard-only directory. Ordinary `pnpm test` passed all six tests; typecheck and production build passed. A separate bare-Playwright baseline smoke completed reserve, conflict, visible navigation, cancellation and rebooking with no external requests or page errors. This smoke is an application acceptance check, not a Proofline native gate.

The initial missing-model RED and subsequent GREEN are retained. The first lock-generation attempt accidentally used pnpm 11.25 because of a relative environment-helper path; the lock was regenerated using explicit 11.24 before the independent frozen install and freeze. No 11.25 run is credited as selected-runtime verification.

Local logs, exact setup steps, UI screenshot and freeze record are under `output/readiness-milestones/roomboard-baseline-*`; these supplement the tracked source/inventory and are not recovery prerequisites.

## Trial isolation

The pilot starts with a fresh agent and this app's standalone baseline history, public onboarding/portable/support instructions and an immutable reusable-core reference. It receives no preauthored adaptation or the host's historical repair context. Every question, intervention, failure and final native command/result is recorded separately. A later independent reviewer must check the resulting adaptation before it becomes a repeatable example.
