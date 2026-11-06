# Roomboard agent-adoption trial

Roomboard is a separately authored React/Vite room-reservation app with Rooms and Reservations screens, replay-safe reserve/cancel rules and in-memory state. It has no product authentication, roles, tenants, live provider or database contract. The unchanged unharnessed baseline remains in `examples/roomboard`, with its [frozen inventory](roomboard-baseline.md).

This was an **agent trial**, not a human user or outside organization adopting Proofline. The first blind trial at core `d262c0c` stopped on a real absent-tenancy schema constraint; its [blocked report](roomboard-agent-trial-1.md) is retained. An explicit, separately reviewed schema repair led to an [assisted retry](roomboard-assisted-trial.md) at target `9102d0d` / core `1804725`. The retry reported Doctor's package-export limitation and generic financial catalog prose; both were subsequently repaired upstream, with retained regressions and independent reviews.

A historical [compatible upgrade](roomboard-final-core-upgrade.md) used 36 core files; a separate [startup repair upgrade](roomboard-startup-repair-upgrade.md) retained that history. The latest [runtime cohort upgrade](roomboard-runtime-cohort-upgrade.md) copies all **37** core files from `8c7614f16e69cb578ef880be961bdd33118e729f`, including the browser initializer installed before the first page in main and bootstrap contexts. These core bytes also match root source `67d8366`; its later change only adjusts test imports and their line references.

Independent review found a partial-setup cleanup leak in the first cohort target. The separately retained [cleanup repair](roomboard-adapter-cleanup-fix.md) closes that finding at current target **`aeaf7a04e99f8e313dde1de6f10d39c6ca201722`**. The six-case cleanup regression suite recorded five failures and one pass before repair, then six passes afterward. The corrected target passes all **19** configured checks: unit **17/17**, Chromium **2/2**, explicit two workers and both one-test shards, coverage/ratchets, append-only records, preflights and production-negative auditing. The browser workflows cover visible reserve/conflict/navigation/cancel/rebook and isolated capability startup. This adapter/configuration change correctly uses full fallback; the earlier exact-selection proof remains a historical result. App source, package/lock and existing coverage floors remain unchanged.

Independent reviews approved the assisted retry, subsequent core upgrades and corrected adapter for spec compliance and code quality. The original setup-failure probe now observes one context close and zero listening servers; an independent 12-case allocation/setup/cleanup matrix also passes. Review reconciled actual native reports/events/discovery, all 71 source and 2,789 artifact hashes, source/core authority and historical prefixes. Setup downloaded 175 packages with zero reuse into its own installation and fetched matching browser binaries; later trial/upgrade runs reused that same installation. Reviewer replays disclose dependency reuse. These results do not establish Linux/hosted compatibility for Roomboard, live deployment, human onboarding or a support history. Frozen author reports retain their original pre-review status; this overview records the subsequent independent verdicts.

## Reproduce the adapted fixture

The [source bundle](roomboard-adapted.bundle) retains the app's own complete Git history, including the unharnessed baseline, blocked adaptation, measured bootstrap, core upgrades and cleanup repair. [Bundle provenance](roomboard-adapted.json) records its SHA-256, exact head and core source; the [source inventory](roomboard-adapted-source-inventory.json) records the 71 tracked files. Clone it into a new external directory so governance compares the application's own history rather than the enclosing Proofline repository.

From the Proofline checkout, choose an unused destination and select Node 24.22.1 / pnpm 11.24.0 first:

```bash
git clone docs/pilots/roomboard-adapted.bundle /tmp/proofline-roomboard
cd /tmp/proofline-roomboard
pnpm install --frozen-lockfile --store-dir /tmp/proofline-roomboard-store
pnpm exec playwright install chromium
export IMPACT_BASE=ee6b8518d72d1ea37e30f2abb594e06fbc9134cd
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
