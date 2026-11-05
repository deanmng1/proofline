# Contributing to Proofline

Proofline is a portable harness; the insurance CRM is its reference application. Keep product-specific behavior in the target app and adapters. [Project status](docs/PROJECT_STATUS.md) identifies the active tracked plan and verified milestones; no local chat or ignored recovery file is required.

## Set up a checkout

Use Node `24.22.1` (`.nvmrc`), pnpm `11.24.0` and Git `2.48+`. The supported Node range is `>=24.22.1 <25`; other combinations need their own verification. If pnpm is absent, install it with `npm install --global pnpm@11.24.0` using the selected Node.

```sh
git clone https://github.com/deanmng1/proofline.git
cd proofline
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm harness:validate
pnpm demo
```

Use the fresh capability URL printed by `pnpm demo`. It supplies an isolated no-backend CRM. `pnpm dev` instead requires a compatible backend configured with `VITE_API_BASE_URL`. Production builds never include the demo/test adapters.

On Linux CI use `pnpm exec playwright install --with-deps chromium`. Chromium is also needed by a real-browser harness regression in the unit suite. If you configure `PLAYWRIGHT_BROWSERS_PATH`, use the same value for browser installation and execution.

## Tests and ownership

```sh
node tools/proofline/canonical-runner.mjs vitest run \
  --config apps/crm-web/vite.config.ts apps/crm-web/src/test/app-router.test.tsx
pnpm test
pnpm e2e
```

Vitest owns rules, services, APIs, events, retries, permissions and focused UI behavior. Playwright owns a small genuine multi-screen workflow matrix through visible controls. Browser specs delegate transport, storage and scenario setup to fixtures. Never contact live providers from tests or add an LLM/agent to test execution.

Before changing behavior, add a failing regression and retain RED/GREEN evidence. Update exact ownership/rule bindings, generated rules and measured coverage metadata as required. Do not lower existing coverage minima or rewrite prior authored JSONL bytes. Append a fresh scoped event to `test-impact/execution-record.jsonl`. See [testing](docs/TESTING.md), [adaptation](docs/PORTABLE_TEST_AUTOMATION.md) and [AGENTS](AGENTS.md).

## Full verification and pull requests

Use trusted base/head revisions and run the complete [fresh-state gate](docs/TESTING.md#completion-gate). Full unit/browser checks remain mandatory after impact diagnostics. Independently review both spec compliance and code quality. The single complete CI workflow is `.github/workflows/verify.yml`; its `verify` job installs Chromium before tests. Do not revive the obsolete duplicate workflow without matching prerequisites.

When changing `.github/workflows`, also run semantic validation with [actionlint 1.7.12](https://github.com/rhysd/actionlint/releases/tag/v1.7.12), verified against its published checksum: `actionlint .github/workflows/*.yml`. Shell syntax checking does not validate GitHub expression contexts. Keep runner-only values in runner steps and require the actual full PR matrix before remote main advances; a workflow rejected before jobs start is a failed check.

Use a focused branch/PR for shared contributions and a commit subject explaining the reason for the change. This repository's current agent work has explicit direct-to-main local authorization; that does not authorize pushing or publishing. Husky runs Biome through lint-staged. Preserve binary/raw evidence bytes; retained native JSON commonly uses `.json.txt` to avoid formatter rewriting.

## Source preview and upgrades

`0.9.0-preview.2` identifies the unpublished Proofline source preview; the old dashboard `v0.8.0` tag is historical. Record an immutable source commit with every issue and verification result. No command in this guide tags, pushes, deploys or claims a published release.

Before changing runner/dependency versions, review package APIs and capability paths, regenerate compatible reports, preserve ratchets/history, repeat fresh independent installs of the CRM and work-orders targets, and run the complete gates. A coverage-provider/history migration requires a separately reviewed change. [Support and release policy](.github/SUPPORT.md) describes compatibility, artifact expiry and preview support. [Security reporting](.github/SECURITY.md) covers potential harness-boundary failures.

Contributions remain under the [MIT License](LICENSE); preserve the original template attribution.
