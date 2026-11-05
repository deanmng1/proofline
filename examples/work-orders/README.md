# Work orders portability example

A separate React/Vite work desk proves Proofline adaptation. Dispatchers complete requests within their organization; observers have read access and no completion authority. Organizations north and south own different requests. The UI authenticates through a cookie-session API adapter, uses `/desk/requests` and `/desk/completed`, and has no CRM imports or product fixtures.

The test-only entrypoint checks its launcher capability. Each browser test owns fresh runtime state and contexts; workers serve separate stateless test artifacts on allocated numeric loopback ports. Production imports only the application and production transport. Providers and database durability are outside this example.

## Install and verify independently

Start in a full-history Proofline checkout after its documented frozen dependency installation. Use Node **24.22.1** (supported range `>=24.22.1 <25`), pnpm **11.24.0** and Git **2.48+**. The target pins React 19.2.8, Vite 6.4.3, Vitest/coverage-v8 3.2.7 and Playwright 1.62.1; its direct imports include `zod`. `pnpm-workspace.yaml` approves only esbuild's required install build, and `pnpm-lock.yaml` is the frozen dependency contract.

```sh
pnpm proofline:validate-portability -- --independent-install
# Equivalent native CLI:
node tools/proofline/validate-portability.mjs --independent-install
```

This explicit setup command:

1. Copies this example and the unchanged reusable `tools/impact` and `tools/proofline` core into a new OS temporary repository outside the checkout. Generated files, existing dependency directories and dependency links are excluded. It records every copied core file's SHA-256.
2. Creates a new HOME, npm cache, pnpm store and arbitrary-name browser cache in a separate OS temporary directory. It downloads pinned pnpm 11.24.0 from `https://registry.npmjs.org`, performs the target's own `pnpm install --frozen-lockfile` against that public registry, and provisions Chromium, headless shell and FFmpeg with the target's Playwright. There is no host `node_modules` link. Linux installations may also require Playwright's documented operating-system browser prerequisites.
3. Initializes local Git history, renders `test-impact/rules.md` from the target's rule registry, generates the manifest's canonical command table at `docs/PORTABLE_TEST_AUTOMATION.md`, and starts `test-impact/execution-record.jsonl` with the adaptation event and a trailing newline. The bootstrap helper uses a synthetic local fixture author; it does not depend on your Git author settings or create a remote.
4. Builds both artifacts, measures initial coverage, normalizes its measurement catalog and commits the adaptation baseline. It commits a behavior-equivalent completion-guard edit to prove exact selection, runs the selected identities, then appends an evidence event and commits the verified head. The ten gates are static manifest validation, application typecheck, discovery, selected execution, full unit, full browser, coverage, coverage ratchet, append-only record governance and production-negative audit.
5. Reconciles genuine native outcomes and source/session provenance, checks that the copied core stayed byte-identical, and retains the target, setup directories, logs, report and hashed native artifacts. It prints the target and report paths; `artifacts/portability/latest.json` identifies this invocation. `dependencyMode: "independent"` and separate `installation` entries distinguish public setup from deterministic verification.

Registry/browser downloads happen only during explicit setup. The canonical tests retain deny-by-default egress and contact no live providers or models. The command changes only its disposable target and generated evidence, and does not push, publish or deploy.

## Prepare a source repository for your own adaptation

To copy and initialize the source without installing packages or running tests:

```sh
node tools/proofline/validate-portability.mjs --prepare-only --dependency-mode independent
```

The JSON response includes `target`, `bootstrap`, `dependencyMode`, the copied file inventory and hashes. Move into the printed target directory. Its initial Git commit, rule catalog, canonical command table and first JSONL event already exist; rerunning initialization against an existing Git/evidence history is rejected. Preserve that history and append future evidence records. The equivalent programmatic entrypoints, imported from the Proofline checkout's `tools/proofline/validate-portability.mjs`, are `prepareTarget({ dependencyMode: "independent" })` followed once by `initializeTarget(prepared.target)`.

Install and provision from that target using the exact pinned package manager:

```sh
# In the printed target directory; Node 24.22.1 and pnpm 11.24.0 must be on PATH.
pnpm --version
pnpm install --frozen-lockfile --registry https://registry.npmjs.org
pnpm exec playwright install chromium
node tools/impact/src/main.ts --validate-harness
node checks/static-check.mjs
node tools/proofline/canonical-runner.mjs unit
node tools/proofline/canonical-runner.mjs browser
```

These commands use this target's installed dependencies. pnpm's internal links inside its own `node_modules/.pnpm` are expected. For the full isolated setup plus all ten gates and retained proof, run the first command from the Proofline checkout; a prepared source directory by itself is not a completed portability result.

When adapting a different application, retain the unchanged reusable core and replace this target's routes, API/auth seams, rules, exact bindings, lifecycle/workflow matrices, production exclusions and coverage source groups. Generate the canonical command table and rule catalog before committing the initial adaptation. Establish measured coverage and a committed base, then use real `IMPACT_BASE`/`IMPACT_HEAD` revisions for impact, coverage and record checks; missing history or classification fails closed. Do not copy the CRM product or infer a successful migration from these example-only rules.

## Offline compatibility mode

```sh
# From the Proofline checkout; dependencies and Chromium must already be installed.
pnpm proofline:validate-portability
```

With no flags the existing compatibility path stays offline: it prepares another external target and explicitly links the checkout's `node_modules`. Its result says `dependencyMode: "reuse"`, has no installation entries and proves only reuse of that dependency tree. It does not establish an independent installation. The preparation API likewise defaults to `dependencyMode: "reuse"` and rejects missing source dependencies or unknown modes.

Chromium on the recorded local runtime is the executed compatibility claim. Other browsers, operating systems, architectures and dependency combinations require their own verification; the presence of configuration alone is not evidence of support.
