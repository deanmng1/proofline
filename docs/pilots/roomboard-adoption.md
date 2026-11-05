# Roomboard agent-adoption trial

Roomboard is a separately authored React/Vite room-reservation app with Rooms and Reservations screens, replay-safe reserve/cancel rules and in-memory state. It has no product authentication, roles, tenants, live provider or database contract. The unchanged unharnessed baseline remains in `examples/roomboard`, with its [frozen inventory](roomboard-baseline.md).

This was an **agent trial**, not a human user or outside organization adopting Proofline. The first blind trial at core `d262c0c` stopped on a real absent-tenancy schema constraint; its [blocked report](roomboard-agent-trial-1.md) is retained. An explicit, separately reviewed schema repair led to an [assisted retry](roomboard-assisted-trial.md) at target `9102d0d` / core `1804725`. The retry reported Doctor's package-export limitation and generic financial catalog prose; both were subsequently repaired upstream, with retained regressions and independent reviews.

A separate [compatible upgrade](roomboard-final-core-upgrade.md) then passed all 19 configured checks at target `e0c9fbd754e9a0665ba439c3974770f5673cae4d`, using all 36 byte-identical core files from `d3b80ced47449ed0fa910de80faa2c3fd0351b26`. Actual unit outcomes are 11/11; Chromium workflows are 2/2, including visible reserve/conflict/navigation/cancel/rebook and isolated capability startup. Explicit two workers and both one-test shards pass. Exact selection, full fallback, per-file coverage, ratchets, append-only records, preflights and production-negative auditing also pass. Target app, lock, metadata and coverage floors were unchanged by that upgrade.

Independent reviews approved both the frozen assisted retry and separate upgrade for spec compliance and code quality, with no material findings. They reconciled actual native reports/events/discovery, source/core/artifact hashes and history rather than accepting a summary. Setup downloaded 175 packages with zero reuse into its own installation and fetched matching browser binaries; later trial/upgrade runs reused that same installation. Reviewer replays used explicitly disclosed dependency reuse. These results do not establish Linux/hosted compatibility, live deployment, human onboarding or a support history.

## Reproduce the adapted fixture

The [source bundle](roomboard-adapted.bundle) retains the app's own complete Git history, including the unharnessed baseline, blocked adaptation, measured bootstrap and reviewed upgrade. [Bundle provenance](roomboard-adapted.json) records its SHA-256, exact head and core source; the [source inventory](roomboard-adapted-source-inventory.json) records the 69 tracked files. Clone it into a new external directory so governance compares the application's own history rather than the enclosing Proofline repository.

From the Proofline checkout, choose an unused destination and select Node 24.22.1 / pnpm 11.24.0 first:

```bash
git clone docs/pilots/roomboard-adapted.bundle /tmp/proofline-roomboard
cd /tmp/proofline-roomboard
pnpm install --frozen-lockfile --store-dir /tmp/proofline-roomboard-store
pnpm exec playwright install chromium
export IMPACT_BASE=9102d0d14701777a97cfa15bff20f5fd5b37db61
export IMPACT_HEAD="$(git rev-parse HEAD)"
node tools/proofline/doctor.mjs --stage source --base "$IMPACT_BASE" --head "$IMPACT_HEAD"
node tools/proofline/doctor.mjs --stage installed --independent --base "$IMPACT_BASE" --head "$IMPACT_HEAD"
pnpm lint
pnpm typecheck
pnpm harness:validate
pnpm test:impacted -- --dry-run --base "$IMPACT_BASE" --head "$IMPACT_HEAD"
pnpm test:impacted -- --base "$IMPACT_BASE" --head "$IMPACT_HEAD"
pnpm test
pnpm e2e
node tools/proofline/canonical-runner.mjs playwright test --config playwright.config.mjs --workers=2
node tools/proofline/canonical-runner.mjs playwright test --config playwright.config.mjs --shard=1/2
node tools/proofline/canonical-runner.mjs playwright test --config playwright.config.mjs --shard=2/2
pnpm coverage
node tools/impact/src/coverage-policy.ts --normalize-reports
pnpm coverage:check -- --base "$IMPACT_BASE" --head "$IMPACT_HEAD"
pnpm record:check -- --base "$IMPACT_BASE" --head "$IMPACT_HEAD"
pnpm build
pnpm proofline:check-production
git diff --check
```

Installation and browser downloads are explicit setup. Tests use guarded deterministic local fixtures and never invoke an agent, model or live provider. This fixture has target-specific evidence; it is not certified by substituting its counts or paths into the fixed work-orders v1 result contract. The reports' “published snapshot” wording means a locally supplied immutable public-interface snapshot; no remote publication occurred during the trial.

Prior reports and native run directories remain immutable. Shared generated build/coverage/convenience-index files are dated snapshots and may change on later runs; their old inventories identify their original observation, not a claim that every generated path remains unchanged forever.
