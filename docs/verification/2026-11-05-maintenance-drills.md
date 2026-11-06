# Task 6 maintenance deliverables and measured local drills

Owned deliverables are implemented; controller integration/review/commits and the full committed fresh gate remain separate. No primary-checkout core, package, manifest, baseline, authored JSONL, remote setting, tag, release or deployment was changed by this worker.

## Documentation

- Added `docs/UPGRADING.md`, `docs/RELEASE_RECOVERY.md`, `docs/releases/0.9.0-preview.2.md` and `.github/CODEOWNERS` (`* @deanmng1`). Updated `.github/SUPPORT.md`/`SECURITY.md` with actual maintainer/issue routes, disabled-private-reporting fallback, no SLA and honest unprotected-main observations.
- Candidate is unpublished `0.9.0-preview.2`, schema 1. Notes separate candidate declarations from actual execution, label the agent pilot, and leave live staging explicitly pending. No switch, deployment, hosted cell or support history is invented.
- Upgrade/recovery instructions preserve immutable core/source identity, own target history, ratchets and original authored evidence; all-jobs newer-attempt recovery never promotes dispatch/PR/local evidence or unchecked rebuilds. Schema/provider migrations require separate review.
- Verification: `git diff --check -- <owned paths>` exit 0; local Markdown link-target existence check passed. These documentation checks are not behavioral test evidence.

## Evidence and runtime

Primary generated report: `output/readiness-milestones/maintenance/drill-results.json`. Exact scripts, per-command argv/cwd/exit/elapsed seconds/log SHA-256, original/mutated module texts, native reports and phase snapshots are adjacent. `native-summary.json` indexes 24 retained mutation/scenario native invocations; `scenario-results.json` records the three accepted scenario runs. Existing failures are retained.

Immutable core sources:

- Old: `024aa838ade882fdcca46e63a4ae665569c16fd0`.
- New: `d262c0c617193a1aa9988af26d2dde21ac512ba1`.

Disposable root: `/var/folders/53/tczzd1xs309dz5gqx3h41lnm0000gn/T/proofline-maintenance-jldipweh` (real paths may start `/private/var`). Selected toolchain is sourced by absolute path from repository `output/adoption-remediation/toolchain-env.sh`; actual runtime was Node v24.22.1, pnpm 11.24.0, Git 2.51.0, Darwin arm64. Native accepted records report the actual selected Node executable. Chromium cache is the actual adoption fresh-state arbitrary-name cache. There were no install/download commands in these drills. Dependency reuse is explicit; none is fresh installation, hosted compatibility or provider/deployment proof. CI=1 selects stricter local runner behavior and is not a hosted identity. Tests use deterministic guarded fixtures and never call an agent/model/live provider.

## Harmless argv mutation

`run-drills.py` clones immutable new source externally and replaces only the final `assertSafeNodeArgv` export with its old-source implementation, preserving the rest of the reviewed file. Original module SHA-256 `5beabd57986f7e833eb846dcd9f2ee1306d28eb7c0c3b83c173c72b8b9a477ba`; mutant `17e5f49ccc6949adcd35eacf3490f760aedfd0652dfbf5452cbe61d2b6d45323`.

Both commands use `node tools/proofline/canonical-runner.mjs vitest run`:

1. `tools/proofline/src/egress-guard.test.ts -t rejects_direct_operand_hidden_preloads_before_sentinel_execution`: GREEN 1/1, mutant RED 1 failed (including local `sentinelRan: true`), original restored GREEN 1/1.
2. `tools/proofline/src/canonical-runner-egress.test.ts -t canonical_unit_runner_rejects_operand_hidden_preloads_before_all_child_dispatches`: GREEN 1/1, mutant RED 1 failed, restored GREEN 1/1. Cases exercise inherited spawn/spawnSync/execFile/execFileSync/fork dispatch.

Only a harmless local file-writing preload sentinel is used. The older parser actually admits cases; this is not a syntax/import failure. Original bytes are restored in the disposable copy. Native sourceCommit stays the immutable parent d262; the explicit mutant hash/mode identifies the dirty experimental bytes and must not be interpreted as an unmodified-source certification.

## Native outcome mutation

In another external immutable-new-source copy, replace the expectedStatus/retry rejection predicates in reconciliation and aggregate verification with `false`, leaving status/repeats/project rules intact. Original module SHA-256 `6e66db04d9cb2d7e68a29f910a00e27217b64a96ddb05755c5cefa05eda99243`; mutant `ff8f42c66bd6b41488c71d93dab4d497043f168538dff35d27039d4aa9853812`.

Command: `node tools/proofline/canonical-runner.mjs vitest run tools/proofline/src/required-execution.test.ts -t 'rejects substituted or ambiguous native outcome|native Vitest events reject actual expected failure and successful retry|accepts passing browser applicability and rejects expected-failure and retry substitutions'`.

GREEN 6/6 → mutant RED 4 failed, 2 passed → restored GREEN 6/6 (18 intentionally filtered out). Both expectedStatus and retry table fixtures fail when relaxed, the browser negative fixture wrongly accepts a substitution, and the actual native expected-failure child wrongly returns success. The actual-native fixture aborts on that first mutant assertion, so do not claim its subsequent retry child executed under the mutant. Actual retry is exercised in the restored/genuine run and the mutant table fixture detects retry acceptance. Original bytes are restored.

## Existing-target compatible upgrade

The rehearsal copies the existing independent work-orders target `/private/var/folders/53/tczzd1xs309dz5gqx3h41lnm0000gn/T/proofline-work-orders-Jx0LV0`, including its own Git history, excluding generated output and reusing its independently installed dependency tree. The original target is untouched. This is a dev upgrade rehearsal, not another independent installation or work-orders v1 portability certification. It does not use version-string replacement as upgrade proof.

The copied target at `upgrade-work-orders` installs exact dynamic non-test immutable core inventories: 31 old-source files then 36 new-source files, with every hash retained. Its old target head is `d57d30991e5b4a168c5da5a1a7ad9cad5a569c2e`; upgraded target head is `8af2faafe1f24c31fadf57a7819d11c22cc40ba6`. Old checks use the target's own original known-change base `b1c103d5c2b0db10b101e512c82a0aa3b96cb22f`; new checks use the actual old/new target heads. Upgrade events append only in the disposable target; the original target JSONL prefix is byte-preserved.

Both source phases passed static manifest, typecheck, real discovery/selection, canonical full target unit/browser, coverage, coverage ratchet, record governance and production-negative audit, plus explicit production/test builds and coverage normalization. Exact manifest-derived argv, revisions and cwd are retained by `recheck-upgrade.py`. This serialized authoritative recheck's 26 checks plus two checkouts all exited 0, totaling 33.888 seconds of measured command time. Native/coverage snapshots are in `upgrade-recheck-old-artifacts` and `upgrade-recheck-new-artifacts`.

Both core inventories remained unchanged after their gates. Final manifest remains version 1. Target package/lockfile/manifest/app domain source/coverage baseline match the original bytes. Original target history and source remain untouched. No schema/provider migration or coverage-floor weakening occurred.

Evidence-driver limitations: an initial supplemental scenario setup writer overlapped the first summary journal; raw command logs and artifact snapshots were retained, and the complete old/new gate chain was rerun serially to provide the authoritative journal. After that chain had passed and saved gate/core results, its driver exited 1 on a summary-only `KeyError: 'schemaVersion'` (actual field is `version`). `recheck-upgrade.executed.py` and `recheck-driver-failure.log` preserve this. The corrected driver is retained, and the separate actual `python3 output/readiness-milestones/maintenance/finalize-report.py` completed exit 0, reading the actual version, checking target-owned bytes/prefix/core outcomes and writing summaries without changing source or rerunning tests. The driver failure is not presented as an all-green driver invocation.

## Repeated genuine scenario isolation

Three independent external copies, distinct native artifact directories, sequential invocations of:

`node tools/proofline/canonical-runner.mjs playwright test --config apps/crm-e2e/playwright.config.ts apps/crm-e2e/src/fixtures/scenario-contract.spec.ts --project chromium --workers=2`

| Copy | Accepted invocation | Genuine passes | Wall seconds |
| --- | --- | --- | --- |
| scenario-1 | `f67efedb-23d6-48d7-ac12-5303d9f2ac88` | 24/24 | 4.569 |
| scenario-2 | `532fe90d-4767-46b5-b22e-a94f90f2630d` | 24/24 | 4.854 |
| scenario-3 | `b55afe92-a1e4-4f1b-88b2-ad9e1c8f42e8` | 24/24 | 4.672 |

Each native record binds exact d262 source, distinct session/invocation, Chromium/two workers, actual v24.22.1/darwin/arm64 runtime, and all 24 outcomes passed with expectedStatus passed and retry 0. These are real tests exercising existing authority/egress/lifecycle/isolation fixtures. Three zero-failure runs are a finite sample, not a universal flake-rate or performance guarantee.

Setup failures remain: the initial bare focused invocations failed 24/24 in each copy because the test artifact was not built. Root-only dependency reuse then missed workspace dependencies; package-local symlinks allowed typecheck but made Vite module sources escape the copied repository and correctly fail closed. Final successful setup uses contained APFS-cloned existing root dependency files, physical package-local directories with internal pnpm/workspace symlinks, and explicit `pnpm nx run crm-web:build-test --output-style=static` in each copy. These copies remain reuse evidence; no guard/auditor was disabled. Every prior failing invocation/native report/build log is retained, including `reused-symlink-build-source-escape.log`.

## Handoff

Independent spec/quality review is controller-owned. The controller must integrate public shared metadata/version/status, append authored evidence, commit and run the serialized fresh-state full gate. No hosted result, live staging, new score or project completion is claimed by this worker.

## Independent task review

Independent spec-compliance and code-quality review approved these scoped deliverables with no unresolved material findings. The reviewer rehashed1734evidence files, checked old31/new36 inventories against both source and target commits, preserved target history and authored prefix, reconciled26gate log hashes and actual old/new unit/browser native reports, and independently reconciled all three24-test scenario reports. This approval covers the named local rehearsal and maintenance documents, not a new full gate, hosted cell, deployment or human support history.
