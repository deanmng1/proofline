# Proofline execution, release, and portability hardening

## Authorized scope

The user approved four priorities after the enterprise comparison: required-test verification, preservation of failure artifacts, release verification, and validation on a second app. Implement them with parallel agents, deterministic tests, independent task and whole-change reviews, and the existing fresh-state full completion gate. Work directly on main; no push or deployment. The original portable design remains binding.

## Approach

Extend the repository-native manifest, guarded runners, and evidence rather than introduce a hosted testing service. Execution verification and artifact isolation share runner state and form one implementation stream with separate acceptance checks. Release tooling and a standalone second application are independent streams. The controller owns shared manifest/catalog/coverage/documentation/JSONL integration and serializes commits. This follows the user's explicit parallel execution request while keeping shared files under one owner.

Alternatives considered: banning skip syntax statically misses conditional runtime decisions; trusting exit codes reproduces the audited gap; replacing the existing core with a new hosted platform changes the product and loses the established guards. Machine-readable runtime reconciliation is the selected approach. Release deployment consumes verified artifacts rather than rebuilding a tag. A standalone unrelated example establishes portability more convincingly than another CRM screen.

## 1. Required execution evidence

Every guarded executing Vitest or Playwright invocation retains a native machine-readable report and a verification result. Discovery/list operations do not count as executing tests. Canonical full unit execution must reconcile all manifest-bound required unit identities across its targets; canonical browser execution reconciles all applicable required browser identities. Focused execution reconciles exact selected identities; subset/shard commands reconcile their declared/discovered applicability without requiring unrelated tests. Applicability is determined before execution and cannot be inferred solely from the tests that happened to report results.

A required test must execute with the expected file/title and applicable project exactly once, reach a genuine passing outcome, and have expected status passed. Missing reports, malformed/ambiguous identities, runtime skip/fixme/todo, expected-failure substitutions, duplicate identity, zero selected tests, wrong project, or unexpected retry/flaky outcomes cannot satisfy a required binding. The known empty test-kit target may stay empty only when it has no required identities; it cannot authorize omission elsewhere. Failed commands preserve evidence and return nonzero.

Verification tests include the reproduced bound Playwright runtime skip (baseline passes, skip causes verification failure), expected failure, missing/ambiguous/malformed results, wrong project, omitted target, and valid full/subset/shard results. Vitest and Playwright use native outcomes; no synthetic success summaries. Vitest JSON alone does not expose enough expected-failure/retry/project metadata: install a native-event reporter sidecar that records these fields, and reconcile it with the native JSON rather than inferring them. Test real Vitest expected-failure and retry fixtures as well as Playwright runtime skip.

## 2. Failure artifact preservation and shared evidence contract

Allocate a unique invocation directory below `artifacts/proofline/runs/` before every executing command. Keep native report, verification JSON, stdout/stderr, and browser HTML report, trace, screenshots and video under that invocation. Do not clean an earlier invocation when a later command starts. An append-only generated `artifacts/proofline/execution-index.jsonl` may point to invocation records; it is separate from the authored execution record.

The verification JSON has a version, invocation ID, runner, source commit, exact argv/cwd, exit code, outcome, expected identities, observed identities/outcomes, and errors. Implementers may refine field spelling, but must publish the exported interface before release integration. Records must be attributable to the current source commit and execution session. Include CI run ID/attempt (when set), a unique gate execution ID/key, scope (full/selected/subset), project/worker/shard metadata and aggregate-to-child invocation references. Canonical unit produces an aggregate verification of all required unit bindings across its explicit targets; canonical browser/full/subset gates retain their exact applicability. The release producer consumes successful complete gate summaries from the current CI run/attempt, not an arbitrary union of old same-SHA invocation files. CI starts with a fresh execution root; independent required gates have explicit keys and unique execution IDs. Report/output options that would redirect required evidence or collide with another invocation must fail closed or be safely controlled by the runner. CI uploads the entire execution root under always(), including failed invocations.

Acceptance includes two real consecutive browser commands: induce a failure retaining trace/screenshot/video/report, then run a successful command and verify earlier bytes and links still exist unchanged. Unique directories also apply to parallel invocations and shard commands. Legacy consumers can use the index; do not claim historical test-health analytics is implemented.

## 3. Portable execution and second application

Add optional version-1 manifest metadata, required by canonical unit/browser and production-audit execution in the updated reference manifests:

- `execution.unitBuildCommands`: manifest command keys executed before canonical unit tests.
- `execution.unitTargets`: structured `{ argv, cwd }` targets containing Vitest arguments beginning with `run`.
- `execution.browserBuildCommands`: manifest command keys executed before canonical browser tests.
- `execution.browserArgs`: Playwright arguments beginning with `test`, with an explicit target-owned config.
- `production.directory`: repository-relative production artifact directory.
- `production.forbiddenModules`: target-owned forbidden source-module paths.

Keep schema version 1 additive for existing validator fixtures, but missing execution metadata fails canonical execution; do not silently default to CRM paths or Nx. Validate path/cwd containment, command references and supported runner forms. Canonical full required-identity reconciliation detects omitted unit targets. Existing ownership/workspace discovery and coverage ratchets remain authoritative. Do not weaken any egress plane or broaden generic package-manager child authority.

Create `examples/work-orders` with its own small React/Vite app, `/desk/requests` and `/desk/completed` navigation, dispatcher/observer permissions, organization isolation, and request-to-completed lifecycle. It must own auth/API adapters, rules, lifecycle/golden matrices, configs, unit/browser tests, production/test entrypoints, coverage and evidence. No CRM source, fixtures, rules, or routes may be imported.

A deterministic portability command creates a fresh disposable Git repository, copies reusable core files byte-for-byte plus target files, reuses installed third-party dependencies offline, and adapts only manifest/config/target adapters. It runs static validation, exact discovery and diagnostic selection on a real source change, canonical full unit/browser, coverage/ratchet, append-only record checks, and production-negative checks. Demonstrate a real multi-screen visible workflow plus observer/organization denial. Retain results and a compatibility record for the runtime/dependency versions actually executed. Do not claim untested versions, OSes, browsers, live providers, or database durability. The example may have its own tiny target-owned build helper; reuse shared production-audit primitives.

## 4. Verified release artifact

The mandatory verification workflow publishes a deployable artifact only after every required gate succeeds. Its bundle contains the audited production output in Vercel Build Output format, a strict SHA256 file inventory, source commit, repository, exact workflow/run ID/attempt, explicit gate outcomes, and hashes of execution verification evidence. Include the scenario multi-worker and both shard gates explicitly even when impact selection is narrow. The production bundle is audited immediately before packaging. Packaging rejects dirty tracked source, unsafe paths, symlinks, missing or substituted files and missing required execution evidence.

On a published release, deployment resolves the tag to its immutable commit and uses verifier tooling from the trusted default branch. Require an unambiguous successful same-repository push/main run of `.github/workflows/verify.yml` for that commit and its corresponding non-expired artifact/run attempt. Verify the downloaded archive's digest against trusted API metadata before extraction, reject traversal/symlinks/extra or missing inventory members, and verify embedded commit/run/gates/execution evidence and every file hash. Missing, stale, failed, wrong-SHA/workflow/repository/attempt, or tampered evidence fails closed. Use pinned deployment tooling and `vercel deploy --prebuilt --prod`; do not rebuild application source in deployment.

Tests use offline API/archive fixtures and do not access Vercel, GitHub, real providers, secrets, or deployment credentials. CI wiring is reviewed and locally validated; a successful real deployment is not part of this task. Production security scanning, data privacy, mutation testing, extra browsers, load testing, and hosted analytics remain separate follow-ups.

## Completion criteria

All four priorities have red/green evidence, meaningful negative cases, focused verification, independent spec-compliance and code-quality approval. Shared ownership/catalog/coverage/evidence are updated without lowering any existing baseline or rewriting committed JSONL. The second app passes its isolated adaptation command. The original Task 8 full chain passes from cleared generated outputs at a committed implementation head with base `cfe5f11630eac902210bce1999b7a34f9847d8fc`. Append final evidence and validate the resulting committed head. No push/deployment occurs.
