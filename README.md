# Proofline

A portable regression-testing harness for React/Vite applications. Proofline runs deterministic Vitest and Playwright checks, verifies that required tests actually pass, preserves failure evidence, and checks the exact build before release.

[![License: MIT](https://img.shields.io/badge/license-MIT-2563eb)](LICENSE)
[![Source preview](https://img.shields.io/badge/preview-0.9.0--preview.1-2563eb)](CHANGELOG.md)

**Distribution:** unpublished source preview `0.9.0-preview.1`, manifest schema 1. The historical dashboard `v0.8.0` tag predates Proofline. Use the source commit shown by `git rev-parse HEAD`; do not treat that old tag as a harness release. See [project status](docs/PROJECT_STATUS.md) and [preview support](.github/SUPPORT.md).

## What it provides

- Business-rule, service, API and UI tests in Vitest, plus genuine browser workflows in Playwright.
- Exact ownership and test bindings, conservative change-based selection, and mandatory full gates.
- Native outcome reconciliation: missing, skipped or expected-failure results cannot satisfy required checks.
- Separate invocation logs, native reports, traces, screenshots and video, including failed runs.
- Deny-by-default test egress, isolated scenarios, and production builds audited to exclude test adapters.
- Per-file coverage ratchets, append-only execution history and source-bound verified release artifacts.

The insurance CRM is a reference implementation. The unrelated [work-orders example](examples/work-orders/README.md) demonstrates adaptation; its pages and rules are independent. Normal CI execution never calls an agent or model. Adaptation is checked-in source/configuration, not an npm package or hosted service.

## Install from source

| Prerequisite | Supported preview setup |
| --- | --- |
| Node.js | `24.22.1` selected by `.nvmrc`; supported range `>=24.22.1 <25` |
| pnpm | Exactly `11.24.0` (`packageManager` in package.json) |
| Git | `2.48+`, full history for revision-sensitive commands |
| Browser | Matching Playwright Chromium installation |

Install Node with your normal version manager, then install the pinned package manager if needed: `npm install --global pnpm@11.24.0`. Confirm `node --version`, `pnpm --version` and `git --version`; all child commands must resolve the same selected Node.

```sh
git clone https://github.com/deanmng1/proofline.git
cd proofline
node tools/proofline/doctor.mjs --stage source
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
node tools/proofline/doctor.mjs --stage installed
pnpm harness:validate
```

On Linux CI, install browser system dependencies with `pnpm exec playwright install --with-deps chromium`. Both the full unit gate and browser gate need Chromium: a harness unit regression deliberately executes a real browser identity. A custom `PLAYWRIGHT_BROWSERS_PATH` is supported; install and run using the same value.

The read-only doctor checks prerequisites and prints concrete remediation. Source mode works without installed dependencies; installed mode also checks package resolution and the exact installed browser companions. Use `--json` for structured output. It performs no installation or repair, and a ready preflight does not establish passed tests or browser operating-system-library readiness.

## Try the CRM without a backend

```sh
pnpm demo
```

Open the **fresh numeric-loopback URL printed by the command**, including its one-time launch capability. Click **Continue as Avery Stone**, then use visible navigation to explore Customers, Quotes and Finance. Logout and reopening a protected route must require authentication again. Stop the demo with Ctrl+C.

This command builds a separate capability-gated demo artifact with deterministic local adapters. The capability URL is a temporary local credential; do not share it or expose the server publicly. The demo requires no provider account or backend. Test adapters remain absent from the production build.

`pnpm dev` is the Vite development mode for integration with a real backend; it does not automatically start mocks. Set `VITE_API_BASE_URL` in `.env.local` for that mode. `pnpm build` produces `dist/crm-web`, and `pnpm preview` serves those production bytes. An unconfigured production deployment is not a no-backend demo. Authentication and authorization in a real deployment belong to its backend.

The reference exercises access-bearer rotation and exposes a refresh-capability marker. An independent refresh-credential protocol remains outside this harness delivery; a real deployment supplies its own backend authentication and authorization.

## Run checks

```sh
pnpm test                    # complete unit aggregate, with declared builds
pnpm e2e                     # complete Chromium matrix, with declared builds
pnpm test:impacted -- --dry-run --base <trusted-base> --head HEAD
pnpm test:impacted -- --base <trusted-base> --head HEAD
pnpm coverage
pnpm coverage:check -- --base <trusted-base> --head HEAD
pnpm record:check -- --base <trusted-base> --head HEAD
pnpm proofline:check-production
```

For one app test, preserve its config and guarded runner:

```sh
node tools/proofline/canonical-runner.mjs vitest run \
  --config apps/crm-web/vite.config.ts apps/crm-web/src/test/app-router.test.tsx
```

Missing or ambiguous ownership/revision metadata broadens selection to the registered complete suite. Diagnostic selection does not replace full CI gates. [Testing](docs/TESTING.md) documents the complete fresh-state command.

## Adapt another application

Start with [the adaptation contract](docs/PORTABLE_TEST_AUTOMATION.md) and [independently installed work-orders recipe](examples/work-orders/README.md). Supply your routes, roles, tenant boundaries, business rules, auth/API/provider adapters, tests and manifest. Keep the portable core unchanged.

```sh
pnpm proofline:validate-portability -- --independent-install
```

This explicitly provisions a disposable external repository with its own package store, dependency tree and browser cache, then runs all ten target gates. Downloads are setup; test execution still denies undeclared network access. The default command without that flag is the distinct offline dependency-reuse check.

## Verification and release boundaries

The single complete workflow is [Verify Proofline regression harness](.github/workflows/verify.yml), job `verify`. Chromium installation precedes browser-dependent unit execution. The obsolete duplicate `CI` workflow has been retired. Repository maintainers should update any remote required-check configuration still naming its old jobs; source changes do not update remote branch protection.

Release packaging requires complete current-run gates and audited production output. Deployment verifies trusted source/run/attempt, archive digest, inventory and native evidence before deploying the same prebuilt bytes. [The release contract](docs/PORTABLE_TEST_AUTOMATION.md#release-verification) explains the 14-day artifact window and recovery. Local verification does not establish an actual hosted run or deployment.

The recorded compatibility is the stated Node/React/Vite/Vitest/Playwright stack on Darwin arm64 with Chromium. Other OSes, versions, Firefox/WebKit beyond optional smoke, live providers and production database durability need their own validation. The guard is an execution boundary, not a hostile-code OS sandbox.

## Guides and contributing

- [13-slide browser presentation](docs/showcase/proofline-overview.html) and [PDF](docs/showcase/proofline-overview.pdf): an introduction, a caught regression and recordings of both apps. Their dated measurements are captured snapshots.
- [Technical companion](docs/showcase/TECHNICAL_GUIDE.md): diagrams, contracts and measurement sources.
- [Current project status](docs/PROJECT_STATUS.md), [contributor setup](CONTRIBUTING.md), [support](.github/SUPPORT.md), and [security reporting](.github/SECURITY.md).

MIT licensed; see [LICENSE](LICENSE). The reference UI retains the original admin dashboard template's attribution and historical changelog.
