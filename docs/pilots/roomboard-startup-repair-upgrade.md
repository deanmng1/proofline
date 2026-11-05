# Roomboard startup-boundary maintenance upgrade

**All 19 source-bound checks passed at `bc487b371dfd5dabe52daee05a6a9553f0877268`; independent review is pending.** This is a separate controller-assisted maintenance upgrade, not a new blind or human trial. Earlier `9102/180` and `e0/d3b` reports, results, source inventories and dated artifact inventories remain byte-identical. All earlier failure evidence and Git history remain intact.

## Source and scope

Actual base: `e0c9fbd754e9a0665ba439c3974770f5673cae4d`. Committed upgrade head: `bc487b371dfd5dabe52daee05a6a9553f0877268`. Immutable supplied core: `6c8fcd1eb02bcb638ac13589218f861de8dcf95a`, replacing `d3b80ced47449ed0fa910de80faa2c3fd0351b26`. Author/committer: **Synthetic Roomboard Adoption Agent <synthetic-roomboard-adopter@example.invalid>**. Subject: “Adopt strict startup option boundary before public Roomboard fixture”. The controller supplied a local immutable source snapshot; no remote tag, release or publication is claimed.

All 36 copied core files match the supplied SHA-256 inventory. Only `tools/proofline/guard-policy.mjs` differs from the prior core. Exactly three tracked paths changed: that core file, `proofline-core-hashes.json`, and an appended authored JSONL upgrade event. App source/tests, package/lock, manifest/commands, lifecycle/workflows, rule JSON/catalog, coverage floors and licenses are unchanged. Catalog parity with the current generic generator was verified; regeneration was unnecessary. No host root test-color fix or any other module was copied. No local core patch was made.

The controller reported a subsequent whole-project review finding: quoted NODE_OPTIONS could evade the earlier raw-string preload/inspector denylist. The supplied independently reviewed repair uses a finite plain ASCII-space grammar, rejects foreign preloads/loaders/inspectors and quoted/escaped/control/unknown syntax, and percent-encodes apostrophes in the exact internally supplied guard URL. The controller's direct/five-inherited/path/nested-launch regressions are **separate upstream evidence**. This target's local gate run below verifies its actual configured startup compatibility and egress tests; it does not relabel those upstream regressions as target-authored evidence.

## New verification

Session `d739e3bc-816b-4706-a87e-0e62894f9abe`, base `e0c9fbd754e9a0665ba439c3974770f5673cae4d`, head `bc487b371dfd5dabe52daee05a6a9553f0877268`. Working directory `/private/var/folders/53/tczzd1xs309dz5gqx3h41lnm0000gn/T/proofline-roomboard-adopter-k8xehgkh/roomboard`. The same original genuinely fresh trial setup HOME/npm cache/pnpm store/matching Chromium cache was reused. No new dependency install, browser download, network setup, host dependency link, provider call or remote write occurred. Node `v24.22.1`, pnpm `11.24.0`, Git 2.51.0, Darwin arm64; executable `/Users/dio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. Child PATH continues through `setup/env.sh`. New preflights and integrity output retain installed direct dependency versions/contained realpaths and matching browser readiness.

| Check | Exact argv | Exit | Log |
| --- | --- | --- | --- |
| doctor-source | `["node","tools/proofline/doctor.mjs","--stage","source","--json","--base","e0c9fbd754e9a0665ba439c3974770f5673cae4d","--head","bc487b371dfd5dabe52daee05a6a9553f0877268"]` | 0 | `evidence-startup-repair-upgrade/final-doctor-source.log` |
| doctor-installed | `["node","tools/proofline/doctor.mjs","--stage","installed","--independent","--json","--base","e0c9fbd754e9a0665ba439c3974770f5673cae4d","--head","bc487b371dfd5dabe52daee05a6a9553f0877268"]` | 0 | `evidence-startup-repair-upgrade/final-doctor-installed.log` |
| lint | `["node","tools/roomboard/lint.mjs"]` | 0 | `evidence-startup-repair-upgrade/final-lint.log` |
| typecheck | `["pnpm","typecheck"]` | 0 | `evidence-startup-repair-upgrade/final-typecheck.log` |
| manifest | `["pnpm","harness:validate"]` | 0 | `evidence-startup-repair-upgrade/final-manifest.log` |
| fallback-execute | `["node","tools/impact/src/main.ts","--base","e0c9fbd754e9a0665ba439c3974770f5673cae4d","--head","bc487b371dfd5dabe52daee05a6a9553f0877268"]` | 0 | `evidence-startup-repair-upgrade/final-fallback-execute.log` |
| unit | `["node","tools/proofline/canonical-runner.mjs","unit"]` | 0 | `evidence-startup-repair-upgrade/final-unit.log` |
| browser | `["node","tools/proofline/canonical-runner.mjs","browser"]` | 0 | `evidence-startup-repair-upgrade/final-browser.log` |
| browserWorkers | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--workers=2"]` | 0 | `evidence-startup-repair-upgrade/final-browserWorkers.log` |
| browserShard1 | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--shard=1/2"]` | 0 | `evidence-startup-repair-upgrade/final-browserShard1.log` |
| browserShard2 | `["node","tools/proofline/canonical-runner.mjs","playwright","test","--config","playwright.config.mjs","--shard=2/2"]` | 0 | `evidence-startup-repair-upgrade/final-browserShard2.log` |
| coverage | `["node","tools/proofline/canonical-runner.mjs","vitest","run","--coverage","--coverage.provider=v8","--coverage.reportsDirectory=coverage","--coverage.reporter=json-summary","--coverage.include=src/{model.mjs,main.jsx,test-mode.mjs}"]` | 0 | `evidence-startup-repair-upgrade/final-coverage.log` |
| coverage-normalize | `["node","tools/impact/src/coverage-policy.ts","--normalize-reports"]` | 0 | `evidence-startup-repair-upgrade/final-coverage-normalize.log` |
| coverageCheck | `["node","tools/impact/src/coverage-policy.ts","--base","e0c9fbd754e9a0665ba439c3974770f5673cae4d","--head","bc487b371dfd5dabe52daee05a6a9553f0877268"]` | 0 | `evidence-startup-repair-upgrade/final-coverageCheck.log` |
| recordCheck | `["node","tools/impact/src/record-check.ts","--base","e0c9fbd754e9a0665ba439c3974770f5673cae4d","--head","bc487b371dfd5dabe52daee05a6a9553f0877268"]` | 0 | `evidence-startup-repair-upgrade/final-recordCheck.log` |
| buildProduction | `["pnpm","build"]` | 0 | `evidence-startup-repair-upgrade/final-buildProduction.log` |
| checkProduction | `["node","tools/proofline/check-production.mjs"]` | 0 | `evidence-startup-repair-upgrade/final-checkProduction.log` |
| diffCheck | `["git","diff","--check"]` | 0 | `evidence-startup-repair-upgrade/final-diffCheck.log` |
| gitClean | `["git","status","--porcelain"]` | 0 | `evidence-startup-repair-upgrade/final-gitClean.log` |

A new canonical-full fallback was actually executed for the core/record metadata change and real temporary unmapped source; the source probe was removed before clean primary gates. Target generated build/coverage outputs were rebuilt while prior unique run directories stayed preserved. Clean full unit aggregate passes 11/11 identities; full Chromium passes 2/2 visible workflows; two workers and both one-identity shards pass. The runner's before-dispatch egress regression and browser origin/WebSocket/service-worker policies remain active. Coverage normalization, immutable merge-base compatibility and monotonic floors, append-only record governance, production build/module/Vite negative audit, syntax/type checks and clean diff/Git state all pass.

`final-command-results.jsonl` retains exact argv, working directory, timestamps, source/session, exit and log paths. `final-integrity.json` verifies every execution-index digest and 15 passing new-session native records with complete unit aggregate and full-browser authority. All native discovery, task events, reports, stdout/stderr, traces, screenshots and video remain under `roomboard/artifacts/proofline`.

Coverage scope/floors and measurements are unchanged: model 100% lines/functions/statements, 97.29% branches; main 98.07% lines/statements, 66.66% functions, 87.17% branches; test-mode 100% lines/functions/statements, 83.33% branches. These remain three-file unit coverage, not whole-core/browser coverage. Historical exact narrow selection remains explicitly the `170e9e7`→`af8afaa` controlled source proof; no new narrow-selection claim is made for this core upgrade.

## Historical preservation and limits

The prior reports/results/inventories are not rewritten. Shared generated impact/ratchet/record/coverage paths can be overwritten by later runs and execution-index.jsonl gains an appended suffix. Old artifact inventories are dated snapshots, **not claims that every historical path still matches the current worktree**. `historical-native-preservation.json` gives exact changed generated paths and independently verifies immutable old run files plus index-prefix preservation:

- `ADOPTION_RETRY_ARTIFACT_INVENTORY.json`: all 905 original run-directory files unchanged; original 10608-byte index prefix hash matches. 5 shared generated paths differ, listed in the preservation audit.
- `ADOPTION_FINAL_CORE_UPGRADE_ARTIFACT_INVENTORY.json`: all 1252 original run-directory files unchanged; original 13923-byte index prefix hash matches. 5 shared generated paths differ, listed in the preservation audit.

The authored e0 record is a byte-exact prefix of the new record; all older prefixes therefore remain preserved. Old copied retry/upgrade ratchet, record and selection evidence remains available in its separate external evidence directories. Core old/new hashes and assistance provenance are retained in `core-transition.json`; preserved report file hashes are in `preserved-prior-report-files.json`.

No new gate failure, unresolved question or approval request occurred. Prior missing-bootstrap/test-entry/schema/Doctor failures remain retained. No auth, roles, tenancy, provider, backend or database contract was invented. No human, hosted CI, Linux, deployment or provider verification is claimed. Start `2026-11-05T21:06:00.134249+00:00`; evidence finished `2026-11-05T21:07:29.064675+00:00`. This target is frozen for the controller's final independent review.

New machine result: `ADOPTION_STARTUP_REPAIR_UPGRADE_RESULT.json`; new tracked source inventory: `ADOPTION_STARTUP_REPAIR_UPGRADE_SOURCE_INVENTORY.json`; new complete native dated snapshot: `ADOPTION_STARTUP_REPAIR_UPGRADE_ARTIFACT_INVENTORY.json`. Earlier completed report/result/inventory files remain unchanged.
