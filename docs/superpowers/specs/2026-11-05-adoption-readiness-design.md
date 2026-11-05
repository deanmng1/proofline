# Proofline adoption-readiness repair

## Intent and authorization

The user authorized parallel agents to fix all seven findings from the independent adoption assessment at `d8fef7175f7b9cdf52903821764ec85782a6aa4a`, test fresh installs of both applications, and obtain a new independent review and rating. Work stays on the authorized local main checkout. No push, tag, publication, deployment, live provider, or credentials are required. The original portable design and enterprise verification design remain binding.

The before assessment is retained locally at `output/adoption-readiness/ASSESSMENT.md`. Its seven findings are A01 missing browser prerequisites in the older CI job, A02 cache-directory name coupling, A03 incomplete independent target installation, A04 unusable no-backend quickstart, A05 inconsistent setup/contributor instructions, A06 unavailable resume ledgers and contradictory handoff, and A07 unclear release/support identity.

## Approach

Repair the existing source distribution and guarded execution rather than introduce a package service or weaken guards. Three implementation streams own executable resolution, independent adaptation, and the reference demo. The controller owns shared metadata, CI, public documentation/status, evidence and commits. A fresh reviewer checks each implementation stream and the integrated result.

Alternatives: merely documenting a cache basename restriction preserves an avoidable portability bug; adding every executable below a cache weakens authority. Reintroducing mocks into the production entrypoint violates the existing production-negative contract. Shipping an npm package or performing a hosted release is unnecessary for an installable source preview. These are excluded.

## Required behavior

### A01 and A05: one executable setup/CI contract

- Retire the obsolete duplicate `ci.yml`; keep `.github/workflows/verify.yml` as the complete canonical workflow, with Chromium installed before browser-dependent full unit tests.
- Use the actually verified Node `24.22.1` and pnpm `11.24.0` setup. Pin `.nvmrc` to `24.22.1`; declare supported Node `>=24.22.1 <25`. Document Git `2.48+`, the actual repository URL, frozen installation, browser provisioning, and configuration-aware guarded single-test commands.
- Contributor documentation must describe the current workspace layout and commands. Eliminate machine-specific Homebrew/runtime instructions. Local tool paths in retained historical evidence are not setup instructions.
- Retiring a workflow does not change remote branch protection; identify the remaining workflow/check names for maintainers without claiming remote settings were changed.

### A02: browser companion discovery without basename assumptions

Resolve installed Chromium/headless-shell/FFmpeg companions relative to Playwright's actual executable/cache layout, including an arbitrary `PLAYWRIGHT_BROWSERS_PATH` directory and the hermetic package layout. Preserve exact executable identity, purpose and argv authority; no wildcard child allowance, external origins, missing-binary bypass or symlink escape may be introduced. Keep optional uninstalled browsers optional. A real guarded test and video capability must work using an arbitrary cache basename, and unreviewed executables must still fail.

### A03: independent work-orders installation

The work-orders manifest must declare direct core imports and its tooling (including `zod`), exact runtime/package-manager pins, install build approval and a reproducible lockfile. Add a documented preparation path that copies unchanged reusable core into an external repository **without** a host `node_modules` link. Preserve the existing offline reuse mode as a distinct compatibility path, and add explicit independent preparation/install validation. Package/browser download is setup; deterministic tests still deny undeclared egress.

The independently installed target must pass static validation, typecheck, exact discovery/selected execution, full unit/browser, coverage/ratchet, append-only governance and production-negative audit. Metadata must identify dependency mode truthfully. Source-copy instructions must include initial Git history, catalog/evidence setup and commands, rather than require private conversation context.

### A04: working isolated reference demo

Provide `pnpm demo` for a no-backend local CRM walkthrough, built from the existing capability-gated test artifact and deterministic adapters. Keep this reference-specific launcher under `apps/crm-web/`, outside copied portable core. Reuse loopback/capability boundaries and production/test entry separation. Bind only numeric loopback, allocate a fresh capability/session, print an actionable launch URL, handle shutdown, and retain denial of unapproved requests. Verify real sign-in, a visible protected CRM workflow and logout/revisit. Plain `pnpm dev` remains the production-shaped backend integration mode and must say that it requires a backend. Production audit must still reject all test adapters and markers.

### A06: clone-complete agent status

Check in `docs/PROJECT_STATUS.md` with the current milestone, active plan, task status and verification/review commit references. Make AGENTS/handoff point to tracked sources that exist in a clean clone. Mark old handoff/plans as historical evidence rather than active unfinished work. Ignored native logs and private implementation ledgers may supplement the record; they cannot be required to determine the next task.

### A07: honest preview identity and support

Use source-preview version `0.9.0-preview.1`, distinct from the original dashboard's 0.8.0. Update package/badge/changelog/security/support identity coherently. This is an **unpublished source preview**, not a claimed tag or release. Manifest schema remains version 1. State actual tested compatibility, best-effort preview support, reporting scope for harness boundaries, upgrade/regression requirements and release-artifact expiry/reverification procedure. Preserve MIT attribution and original template history. Do not promise enabled remote vulnerability reporting, hosted success, extra OS/browser coverage or a support SLA.

## Verification and acceptance

1. Meaningful failing regressions precede functional changes; retained RED/GREEN evidence and independent spec/quality approvals cover each stream.
2. A normal full-history CRM clone installs from the public registry with a new package store/HOME/browser cache, no dependency links and explicit Node/Pnpm pins. The documented demo and canonical tests work using an arbitrary cache name.
3. An external work-orders repository installs its own declared dependencies and browsers, without any host dependency link, and passes all ten adaptation gates with byte-identical copied core.
4. The full original Task 8 completion chain passes from cleared generated state at a committed implementation head, anchored to `d8fef7175f7b9cdf52903821764ec85782a6aa4a`; explicit multiworker/shards and actual local bundle create/directory/ZIP verification also pass. Fresh-install setup can precede this chain in the same disposable CRM clone.
5. Original coverage minima and authored JSONL bytes remain unchanged; all new sources are classified. Every tracked required status/document link exists in a fresh clone.
6. A fresh independent agent compares all seven findings with concrete evidence and rates the project again using the original rubric. Its rating is judgment, not a target score; remaining limits and unverified hosted/platform paths stay explicit.
7. Append final evidence and validate the final committed head. No push/deployment. Preserve preexisting `.codex/` and presentation server/assets.
