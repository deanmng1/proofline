# Roomboard independent adoption report — BLOCKED

This is an **agent adoption trial**, not human-user evidence and not a completed Proofline certification. No deployment, remote Git write, provider call, extra agent, or host build mutation was performed.

Frozen Roomboard: `91ded2ab018324357e7457486b2bc6292fb8c386`. Local incomplete adaptation commit: `06ab1e7d803bc73556428930f2ac2b18b02b2272`, author **Synthetic Roomboard Adoption Agent <synthetic-roomboard-adopter@example.invalid>**. Original Git history and LICENSE remain intact; no remotes exist. Proofline reference: `d262c0c617193a1aa9988af26d2dde21ac512ba1`. All 36 supplied reusable core files copied unchanged; `roomboard/proofline-core-hashes.json` and `evidence/core-hash-check.json` retain per-file SHA-256. `LICENSE.proofline` preserves the core license.

## Reproducible upstream blocker

`tools/impact/src/harness-manifest.ts` exports `goldenWorkflowMatrixSchema` with required `tenantIsolationMode: z.enum(["visible-switch", "authenticated-contexts"])`. Roomboard explicitly has neither product authentication nor tenants. The supplied public adaptation guide says to describe only capabilities the application has and document absent contracts instead of fabricating security coverage. A planned reserve/conflict/cancel/rebook row with (1) omitted tenantIsolationMode, (2) null, and (3) "none" is rejected in every case. `evidence/golden-schema-blocker.json` retains exact inputs and native Zod issues. Reproduce from roomboard after sourcing `../setup/env.sh`: import this schema using Node 24 and call `safeParse` on those recorded inputs. No core byte was patched and neither tenant enum was falsely declared.

Dependent manifest certification, governed bootstrap/controlled-change commits, exact selection/fallback and full gates stopped. The correct next action is an upstream schema/public recipe decision for applications without tenancy, followed by resumed target adaptation and independent review. No permission or clarification was requested; the controller received the concrete blocker.

## Inventory and work retained

Initial inventory read README, all application source, existing six tests, package/lock/workspace/Vite config and standalone Git identity before new tests. Routes are `/rooms` and `/reservations`; state is immutable in-memory reservations/receipts/sequence, lost on reload. Existing rules validate identifiers/room/slot/contact, reject active conflicts, replay accepted commands and reject changed payloads, release slots on cancellation, and keep cancellation harmless. There is no auth, roles, tenant, provider, database or backend API. `evidence/source-inventory.json` and `roomboard/docs/adoption-design.md` record ownership, lifecycle and visible workflow before new tests.

The target contains copied core, target-owned bootstrap validator/test entry, absent-contract metadata, focused UI test, and browser scenario drafts. The intended browser actions are all visible: reserve, conflict, navigate Reservations, cancel, navigate Rooms, rebook, navigate Reservations; inspection follows outcomes. These browser drafts are **unverified**. Post-compilation inspection found the draft Vite HTML transform runs too late to select the test entry (`evidence/pending-test-artifact-inspection.json`); successful compilation alone does not prove the boundary. This target integration issue remains explicitly incomplete after the upstream blocker. No product source behavior was changed.

## Independent setup and native results

Fresh sibling `setup/home`, `setup/npm-cache`, `setup/pnpm-store`, `setup/browsers`; no host node_modules link. Runtime `v24.22.1`, execPath `/Users/dio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`, Darwin arm64; Git 2.51.0; actual installed pnpm 11.24.0. Every test/install child PATH sourced `setup/env.sh`, which prepends the requested Node directory and fresh pnpm bin. `evidence/runtime-dependencies.json` records all direct dependency versions and realpaths inside this target. Registry and Chromium downloads were setup-only. Matching Chromium/headless-shell v1234 and FFmpeg paths are in `evidence/browser-registry.json`; cache is retained. Existing exact pins/license were preserved; added direct test dependencies are pinned and committed with regenerated then frozen-installed lock.

Commands (working directory `roomboard`; source `../setup/env.sh` first except initial setup provisioning):

| Exact command | Actual result / retained evidence |
| --- | --- |
| `npm install --prefix ../setup pnpm@11.24.0 --no-audit --no-fund` | exit 0; `evidence/setup-pnpm.log` |
| `../setup/node_modules/.bin/pnpm install --lockfile-only --store-dir ../setup/pnpm-store` | exit 0; `evidence/lock-update.log` |
| `../setup/node_modules/.bin/pnpm install --frozen-lockfile --store-dir ../setup/pnpm-store` | exit 0; `evidence/install.log` |
| `pnpm exec playwright install chromium` | exit 0; `evidence/browser-install.log` |
| `pnpm exec vitest run src/boundary.test.mjs` (before implementation) | exit 1, missing test-mode module; `evidence/red-missing-boundary.log` |
| `pnpm exec vitest run src/model.test.mjs` | exit 0, original 6 tests; `evidence/original-six-tests.log` |
| `pnpm exec vitest run src/boundary.test.mjs --testNamePattern 'requires a valid server bootstrap'` | exit 0, 1 passed / 1 filtered; `evidence/green-bootstrap-only.log`; no full-suite claim |
| `pnpm exec vitest run src/ui.test.jsx` | exit 0, 1 test; `evidence/ui-native.log` |
| `pnpm typecheck` | exit 0; `evidence/typecheck.log` |
| `pnpm build` | exit 0 compilation only; `evidence/production-build.log`; native `roomboard/dist/production` |
| `pnpm exec vite build --mode proofline` | exit 0 compilation; wrong-entry limitation above; `evidence/test-build.log`; native `roomboard/dist/test` |
| `git diff --check` | exit 0; `evidence/diff-check.log` |

These ordinary/targeted Vitest checks are not canonical reconciled Proofline evidence. Full native unit/browser/coverage/ratchet/record/production gates were not run or claimed. Schema and runtime/hash/browser probes use native Node inline scripts; their full JSON outputs are retained. All authored JSONL events are new in `roomboard/test-impact/execution-record.jsonl`; no earlier record existed or was rewritten.

## Questions, interventions, failures and limits

No user questions or approvals. One upstream blocker was sent to the controller. Initial pnpm bin symlink pointed to nonexecutable pnpm.cjs, yielding permission denied and PATH fallback 11.25.0 during probes only; corrected to the fresh package `.bin/pnpm` before dependency operations. An initial dependency metadata probe failed because user-event does not export package.json; corrected by inspecting installed package realpaths, not by modifying dependencies. Details are retained in `evidence/metadata-probe-failure.txt`. The meaningful red missing-module failure, direct schema failures, and post-build wrong-entry discovery remain retained. No core modifications, work-orders prepare/initialize helpers, fixed v1 portability-result certification, hidden host plans, or prewritten adaptation were used.

Elapsed active trial approximately 6 minutes (14:23–14:29 local), approximately 20 tool batches: inventory/public-doc reading; fresh setup; pre-test design; red/bootstrap/UI/browser drafts; schema reproduction; limited independent checks; report/commit. Source doctor ordering and complete configured gates were not reached before blocker. Independent review is pending controller commissioning. `ADOPTION_RESULT.json` is a target-specific result, not Proofline's fixed work-orders v1 contract. Artifact inventories include full native build bytes and logs; installed dependencies/browser caches remain in place for reproduction.
