# Start with pinned Proofline source

Proofline is source-native tooling for React/Vite applications. Public source is available; npm packages, tags and GitHub Releases are not the distribution contract. Select a reviewed **full commit SHA** from your trusted local checkout. The current preview identity is `0.9.0-preview.2`, manifest schema1. Installation receipts identify bytes and source; they do not establish passing tests.

Use Node **24.22.1**, pnpm **11.24.0** and Git **2.48+** on PATH, including child processes. The demonstrated compatibility tuples are Linux x64/Ubuntu24.04 and Darwin arm64/macOS15 with Chromium and the repository's pinned dependency versions. Other tuples require their own verification. The runtime guard is not an OS sandbox.

## A runnable starter

From a full-history trusted Proofline checkout, choose an absolute destination outside it. Its parent must exist; the destination must be absent or empty. Use physical paths without symlink components.

```sh
PROOFLINE_SOURCE=$(git rev-parse HEAD)
PROOFLINE_TARGET=/absolute/path/to/new-work-desk
node tools/proofline/doctor.mjs --stage source
node tools/proofline/onboarding.mjs --source "$PROOFLINE_SOURCE" --destination "$PROOFLINE_TARGET" --mode starter
# Read the plan, then explicitly create it:
node tools/proofline/onboarding.mjs --source "$PROOFLINE_SOURCE" --destination "$PROOFLINE_TARGET" --mode starter --apply
```

Planning is read-only. Apply copies the canonical reusable core byte-for-byte and separately pinned work-orders templates. It generates deterministic initial rule/command documentation and an adaptation record that says tests have not run. The bootstrap record's epoch timestamp is a sentinel, not measured verification time. No dependencies, Git repository, remote, browser or target command is installed or executed. There is no host `node_modules` link.

Install explicitly using a new store and browser cache. These commands download dependencies/browser binaries; the tests themselves contact no live providers or models. Linux may need Playwright's documented operating-system browser prerequisites.

```sh
cd "$PROOFLINE_TARGET"
PROOFLINE_SETUP=$(mktemp -d)
export PLAYWRIGHT_BROWSERS_PATH="$PROOFLINE_SETUP/browsers"
node --version
pnpm --version
pnpm install --frozen-lockfile --store-dir "$PROOFLINE_SETUP/store" --registry https://registry.npmjs.org
pnpm exec playwright install chromium
# Own history is explicit; use your configured local Git identity.
git init
git add .
git commit -m "Declare work-desk adaptation"
node tools/proofline/doctor.mjs --stage installed --independent
```

The starter owns organization/role boundaries, replay of command identities, two unit rule outcomes and four required browser outcomes. Canonical runners reconcile the actual full test identities; skipped or missing required outcomes fail. Run the following setup and ten gates in order, stopping on any unexpected failure.

```sh
# Prepare both artifacts and an actual coverage baseline.
node checks/build.mjs
node checks/build.mjs test
node tools/proofline/canonical-runner.mjs vitest run --config client/vitest.config.mjs --coverage --coverage.provider=v8 --coverage.reportsDirectory=artifacts/coverage/work-orders --coverage.reporter=json-summary --coverage.include='client/**/*.{mjs,jsx,ts,tsx}' --coverage.exclude='client/**/*.test.ts' --coverage.exclude='client/**/*.d.ts' --coverage.exclude=client/app.jsx --coverage.exclude=client/main.jsx --coverage.exclude=client/test-entry.jsx --coverage.exclude='client/*config.mjs'
node tools/impact/src/coverage-policy.ts --normalize-reports
git add .
git commit --allow-empty -m "Measure initial work-desk baseline"
export IMPACT_BASE=$(git rev-parse HEAD)
```

Prove a real failing regression before trusting the adaptation: in `client/orders.mjs`, temporarily replace `if (actor.role !== "dispatcher")` with `if (false)`. Run `node tools/proofline/canonical-runner.mjs unit`; **expect failure** in `denies_observers_and_foreign_organizations_without_mutation`. Restore that exact line and rerun; expect two passing unit outcomes. Preserve both logs. Do not commit the broken rule or count its failing run as a green gate.

For an initial selection demonstration, make a behavior-preserving edit to `client/orders.mjs`, replacing `order.state !== "requested"` with `order.state === "completed"`. Append a real JSONL implementation event with a unique ID, current timestamp and `scope: ["client/orders.mjs"]` to `test-impact/execution-record.jsonl`; retain the original line. Commit the edit and event. This sample's two states make that edit equivalent; it is not a general migration recipe.

```sh
git add client/orders.mjs test-impact/execution-record.jsonl
git commit -m "Exercise work-order change selection"
export IMPACT_HEAD=$(git rev-parse HEAD)
node tools/proofline/doctor.mjs --stage installed --independent --base "$IMPACT_BASE" --head "$IMPACT_HEAD"
node tools/impact/src/main.ts --validate-harness       # 1: exact bindings/metadata
node checks/static-check.mjs                         # 2: target static/type checks
node tools/impact/src/main.ts --dry-run                # 3: inspect selected identities
node tools/impact/src/main.ts                          # 4: selected diagnostic execution
node tools/proofline/canonical-runner.mjs unit          # 5: all required unit outcomes
node tools/proofline/canonical-runner.mjs browser       # 6: all required browser outcomes
node tools/proofline/canonical-runner.mjs vitest run --config client/vitest.config.mjs --coverage --coverage.provider=v8 --coverage.reportsDirectory=artifacts/coverage/work-orders --coverage.reporter=json-summary --coverage.include='client/**/*.{mjs,jsx,ts,tsx}' --coverage.exclude='client/**/*.test.ts' --coverage.exclude='client/**/*.d.ts' --coverage.exclude=client/app.jsx --coverage.exclude=client/main.jsx --coverage.exclude=client/test-entry.jsx --coverage.exclude='client/*config.mjs' # 7: full measured coverage
node tools/impact/src/coverage-policy.ts --normalize-reports
node tools/impact/src/coverage-policy.ts                # 8: compatible coverage ratchet
node tools/impact/src/record-check.ts                   # 9: append-only evidence governance
node tools/proofline/check-production.mjs               # 10: no test-only production modules
git diff --check
```

The selected pass is diagnostic; full unit/browser, coverage, record and production gates remain authoritative. Keep the target's native reports/logs and exact base/head. The source repository's [full completion gate](superpowers/plans/2026-10-28-portable-hybrid-workflow-harness.md) remains necessary to claim a portable-core change complete. A starter receipt or this recipe alone is not release eligibility. The controller's independent starter validation is separate from an unassisted human pilot.

## Adapt an existing application

Use `--mode core` to plan and explicitly apply only reusable tooling into an existing repository. Existing application, package/config files, manifests, Git history and evidence are preserved. Any existing core-path collision, even identical bytes without a trusted prior receipt, aborts before installation.

```sh
node tools/proofline/onboarding.mjs --source "$PROOFLINE_SOURCE" --destination /absolute/existing-app --mode core
node tools/proofline/onboarding.mjs --source "$PROOFLINE_SOURCE" --destination /absolute/existing-app --mode core --apply
```

This does not create an adaptation. Your engineers must discover routes, roles/tenants, API/provider seams, deterministic fakes, target tests, ownership, required outcomes, lifecycle/workflow matrices, production exclusions, canonical commands and measured coverage. Use the work-orders application as a pattern, not CRM product code. Declare dependencies and build approvals in your own package/lock files; generate your own rule/command catalogs and append-only evidence. Consult the [portable contract](PORTABLE_TEST_AUTOMATION.md) and [testing guide](TESTING.md).

## Upgrade and interruptions

Run the operator from the trusted source checkout, selecting the new full commit. It must also have the prior receipt's Git objects locally; it never fetches. Source core bytes and starter templates must match their pinned commit. Operator CLIs are source tools and are excluded from the copied core.

```sh
node tools/proofline/onboarding.mjs --source "$PROOFLINE_SOURCE" --destination /absolute/existing-app --mode core --upgrade
node tools/proofline/onboarding.mjs --source "$PROOFLINE_SOURCE" --destination /absolute/existing-app --mode core --upgrade --apply
```

Read added/changed/removed/conflicting paths first. Receipts are untrusted: their complete inventory must equal the recomputed prior trusted commit. Edited/missing core, unknown collisions and ambiguous metadata abort. Removed files are reported but apply refuses; removal needs a separately reviewed migration. Upgrades touch unchanged previously installed core only. A subsequent core receipt records the new core inventory; starter application files remain target-owned.

A sibling `.<destination-name>.proofline-staging` directory retains a journal, staged bytes and backups; `.proofline-installing.json` marks incomplete promotion. Preserve both. Further apply refuses while either remains. If all expected installed bytes are intact, explicitly finish receipt promotion/cleanup with the same source/mode/upgrade options plus `--apply --recover`. This verifies trusted inventory and every installed byte first. If staging stopped before bytes were fully promoted, a file was edited, or metadata is inconsistent, recovery refuses and preserves evidence/backups for manual review; do not delete or overwrite user files to force success. A valid completed receipt after interruption is recognized and cleanup can finish safely.

Record first-use timing and assistance in the [human worksheet](pilots/human-onboarding-worksheet.md). Human/external-organization onboarding evidence remains pending until a real participant completes it.
