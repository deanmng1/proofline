# Proofline preview support

## Identify the source

The current source identity is **Proofline 0.9.0-preview.2**, manifest schema 1. This is an unpublished source preview, not an announced tag or hosted release. The historical dashboard 0.8.0 changelog/tag predates the harness. Use a full-history checkout and include `git rev-parse HEAD` when reporting a problem. [Tracked project status](../docs/PROJECT_STATUS.md) identifies completed and active work.

The preview is repository-native source and configuration, not an installable npm package. The [root setup](../README.md#install-from-source) and [independent target recipe](../examples/work-orders/README.md) define what must be installed or copied. Ignored native artifacts supplement the checked-in authored outcomes; they are not prerequisites for finding the current plan.

## Compatibility and help

The selected runtime is Node 24.22.1, pnpm 11.24.0 and Git 2.48+. Node support is `>=24.22.1 <25`. Current executed compatibility is documented for the recorded React/Vite/Vitest/Playwright versions on Darwin arm64 with Chromium. Linux CI configuration is maintained, but a local result is not a hosted-run attestation. Windows, other architectures/versions and additional browsers are unverified until explicitly exercised.

The maintainer is [@deanmng1](https://github.com/deanmng1). Support for this preview is best-effort, with no response or maintenance SLA. File ordinary reproducible issues through [deanmng1/proofline Issues](https://github.com/deanmng1/proofline/issues) with the source commit, OS/architecture, `node --version`, `pnpm --version`, `git --version`, browser installation/cache setting, exact command, expected/actual behavior and a sanitized invocation ID/log excerpt. Do not post credentials, one-time launch URLs, real customer data or private artifacts. Follow the [security policy](SECURITY.md) for potential boundary bypasses.

At readiness reconnaissance, main had no branch protection and GitHub private vulnerability reporting was disabled. These observations do not enable remote controls; repository settings may change independently of this source. CODEOWNERS requests review where GitHub applies it, but does not enforce protected-branch approval.

## Upgrade and release verification

Follow the [source upgrade playbook](../docs/UPGRADING.md), [release recovery runbook](../docs/RELEASE_RECOVERY.md) and [unpublished candidate notes](../docs/releases/0.9.0-preview.2.md). Keep the lockfile and runtime/package-manager pins together. After upgrading core or runner dependencies, repeat the two clean independent installs, exact test discovery, browser-cache and guard regressions, production audit and complete verification chain. Never carry old success summaries across revisions or silently lower coverage thresholds. Version/schema and coverage-provider migrations require their own reviewed compatibility work.

The verification workflow retains release and evidence artifacts for **14 days**. Published-release deployment requires an unambiguous successful same-repository push/main run for the exact source commit, the correct run attempt and an unexpired hash-verified artifact. It does not rebuild application source. If evidence expires or is unavailable, deployment must stop. Within GitHub's rerun window, rerun **all jobs** of the existing trusted push/main run for that exact commit and let every gate complete under the new attempt identity. GitHub preserves the original commit/ref on rerun and increments the attempt. If the old run cannot be rerun, create a new reviewed commit and complete its normal verification/release process. Do not reuse old summaries, change dates/digests or deploy an unchecked rebuild. A workflow_dispatch run alone does not satisfy the current push/main release policy. See [GitHub workflow reruns](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs) and [run-attempt identity](https://docs.github.com/en/actions/reference/workflows-and-actions/variables).

Tagging, publishing, changing remote branch protection and deploying remain explicit maintainer actions. No hosted GitHub or Vercel success is implied by this source preview or its local ZIP smoke tests.
