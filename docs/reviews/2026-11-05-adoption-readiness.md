# Independent Proofline adoption-readiness reassessment

Reviewed on 2026-11-05. Implementation range: `d8fef7175f7b9cdf52903821764ec85782a6aa4a..b368d854fb4e3ffb8f0b4e7f65b3851ad7e48b0b`.

**Verdict: all seven original adoption findings are closed for the reviewed, unpublished source preview. Adoption readiness is 8.0/10, up from 6.0/10.** The source is suitable for a scoped external-adopter pilot on the verified stack. Broad platform support and hosted release/deployment operation remain unverified. No unresolved material finding remains in this review; this is not a guarantee that the software has no bugs.

**Whole-change spec compliance: APPROVED. Code/configuration quality: APPROVED.** This reviewer did not implement the repairs or conduct the earlier task reviews. The review covers the integrated source diff, original/enterprise/adoption authorities, tracked plan/status, public setup and support, regression evidence, and the actual fresh results. Earlier approvals were treated as scoped evidence, not proof of adoption readiness. Final administrative closeout and committed-head governance remain the controller's responsibility; this rating identifies the verified implementation above.

## Original rubric, applied again

These are judgment scores, not probabilities of correctness. The original weights are unchanged. The weighted result is 8.025, rounded to **8.0/10**.

| Dimension | Weight | Before | After | Basis |
| --- | ---: | ---: | ---: | --- |
| Correctness and reliability | 30% | 8.5 | 8.5 | Strong fail-closed native outcomes, boundary tests, coverage and evidence governance remain intact. Fresh gates caught two integration mistakes before completion. Passing them establishes tested behavior, not exhaustive correctness. |
| Portability | 20% | 5.5 | 8.0 | Both apps now install their actual dependencies independently; arbitrary browser-cache names work, and 31 copied core files remain identical. Executed compatibility is still one OS/architecture and pinned stack. |
| Onboarding and distribution | 15% | 3.5 | 8.0 | Working no-backend CLI demo, reproducible source/bootstrap recipe, complete prerequisites and a verified focused command. Distribution is still an unpublished source snapshot. |
| CI and release readiness | 15% | 5.5 | 7.5 | Duplicate broken CI retired; complete local gates and actual directory/ZIP verification pass. Hosted GitHub and Vercel behavior have not been demonstrated. |
| Documentation and developer experience | 10% | 5.0 | 8.5 | Public setup, contributor commands, tracked recovery and explicit scope now agree. Source-only adaptation remains a technical integration task. |
| Support and maintenance | 10% | 5.0 | 7.0 | Coherent preview identity, compatibility/security scope, upgrades and expiring-artifact recovery. Best-effort support has no SLA or demonstrated release history. |

## Seven-finding closure

| Finding | Status | Repair and closure evidence |
| --- | --- | --- |
| A01 — active CI omitted browser prerequisite | Closed | Obsolete `ci.yml` removed. Canonical `verify.yml` installs Chromium before browser-dependent full unit execution and performs independent target installation. Fresh full unit/browser gates pass. Remote required-check settings are correctly left as a maintainer action. |
| A02 — cache basename coupling | Closed | The installed Playwright package's registry supplies exact named browser/video executables. Regular-file and realpath checks retain containment; no wildcard executable or origin allowance was added. Focused arbitrary/hermetic and negative regressions, retained independent real video probes, and the new arbitrary-cache full run support closure. This reviewer also independently resolved exactly the installed Chromium, headless-shell and FFmpeg capabilities. |
| A03 — target depended on host installation | Closed | Work-orders owns pinned dependencies including zod, its lockfile and esbuild approval. Explicit independent preparation omits host dependency links; setup and retained provenance are distinguished from offline reuse. Fresh public install and all ten target gates pass; this reviewer verified all 31 core hashes and all 11 direct package realpaths. |
| A04 — no-backend quickstart could not sign in | Closed | `pnpm demo` builds a separate reference-owned, capability-gated artifact. This reviewer ran that actual command in the fresh checkout and completed visible login/customer/property/quote/bind/finance/logout/protected-revisit steps. Missing/wrong/replayed capability, cookie/worker, local-request and shutdown checks pass. Production audit passes. |
| A05 — inconsistent setup/contributor commands | Closed | Actual repository, Node/pnpm pins, Git minimum, Chromium provisioning and guarded app configuration agree. Fresh setup passes; the exact documented app-router command independently passes all eight tests. |
| A06 — unavailable/contradictory recovery state | Closed | Tracked PROJECT_STATUS and active plan/handoff replace required ignored ledgers. Historical completion is clearly separated from current work. All 58 reviewed local Markdown targets resolve, and required status is clone-visible. Its pending closeout checkboxes accurately describe the review checkpoint. |
| A07 — ambiguous version/support baseline | Closed | Package, badge, changelog, support and security identify unpublished `0.9.0-preview.1`, source commit and schema 1 separately from dashboard 0.8.0 history. Upgrade, best-effort support, reporting scope and 14-day artifact recovery are explicit; no publication, SLA, enabled private-reporting setting or hosted success is claimed. |

## Actual fresh execution

The final controller created a new full-history local-source clone using `git clone --no-local --no-hardlinks`, with a new HOME, package-manager installation, npm cache, package store and arbitrary-name browser cache. Dependencies and browsers were downloaded publicly; this does not represent a GitHub-hosted workflow or a newly published remote source revision.

Actual runtime: **Node 24.22.1, pnpm 11.24.0, Git 2.51.0, Darwin arm64, React 19.2.8, Vite 6.4.3, Vitest 3.2.7 and Playwright 1.62.1 with Chromium**. Root installation downloaded **464 packages, zero reused**. The separately provisioned work-orders installation downloaded **127 packages, zero reused**. Neither dependency directory links to the host checkout. Independent inspection found all 50 root third-party direct packages inside the fresh dependency tree and the two workspace packages inside that fresh checkout.

At implementation head `b368d85`, with impact base `d8fef71`, **all 22 controller steps exited zero**:

| Verification | Observed result |
| --- | --- |
| Original twelve-command Task 8 chain from cleared generated state | Passed: lint, typecheck, manifest, impact preview/execution, full unit/browser, coverage/ratchet, authored record, production audit and whitespace. |
| Full native unit aggregate | 554 observed passing tests; all 80 required bindings satisfied. |
| Full native Chromium gate | 44 observed passing tests; all 31 required bindings satisfied. |
| Explicit scenario isolation | 24 tests with two workers; both shards passed 12 tests each. |
| Coverage ratchet | Nine groups passed; all 23 historical baseline entries unchanged. New demo floor remains 52% lines/statements and 50% branches/functions; measured isolated report is 52.77%, 57.14% and 75% respectively. |
| Independent work-orders | All ten gates passed: static, typecheck, discovery, selected, unit, browser, coverage, ratchet, record and production. Exact selection was two unit/four browser identities. |
| Actual release directory and ZIP | Passed under explicitly synthetic local run `900000005`, attempt 1. Reviewer independently validated/extracted the ZIP and rehashed all 719 inventory files. |

ZIP SHA-256: `35c43142895713fa2985a02331c1ca2f325b12d9d52d8fc151fe59744e176a66` (22,675,464 bytes). This is local artifact verification, not trusted hosted API retrieval or deployment.

The reviewer independently checked retained target/native provenance, package containment, core hashes, bundle authority/inventory and ZIP extraction. The full-run index was preserved before focused probes. Its 62 invocations include nine intentional nested negative fixtures rejecting expected-failure, retry and runtime-skip substitutions; those failures are retained evidence and do not satisfy required gates.

The reviewer additionally exercised the documented prepare-only command in a separate external repository: clean bootstrap commit, no node_modules, catalog/command table/JSONL present, 31 matching core hashes, and rejected reinitialization without record mutation. The fresh CLI demo retained a real trace/video and a visually inspected bound-policy/finance screenshot. Its requests stayed local, with no route fulfillment or auth/storage injection. The documented focused app-router command passed separately under its own review session.

## Failures and repairs retained

Two integration failures were found before the final pass:

1. Attempt 1 at `b53bb72` stopped in impact's full unit gate because the README rewrite omitted an existing authentication-scope disclosure. `cc7fdfc` restored access-bearer rotation, the refresh-capability marker and the excluded independent refresh-credential protocol. This reviewer approved the exact repair and inspected its 14/14 guarded policy result.
2. Attempt 2 at `cc7fdfc` stopped at coverageCheck. The new demo baseline lacked a report field; strict follow-up also required explicit producer flags and a scripts-only report. `b368d85` adds a separate guarded producer/report while preserving the existing app command, all old entries and every numerical floor. The actual normalized nine-group ratchet passed before the complete fresh rerun. A supplemental Nx-only probe initially omitted the standard normalization step; its failure is retained, and the unchanged root coverage wrapper already performs that step.

Neither failed attempt was relabeled successful or counted as full completion. The reviewer’s first manual CLI browser probe also timed out at a disabled quote button after omitting the committed workflow helper's dependent-select readiness polling. The retry used visible-control polling, passed on unchanged product code and retained both probe artifacts. This supports the corrected probe, not a claim that all possible UI timing behavior is bug-free.

## Limits and evidence

Confidence is **high** in the seven closures and observed installation/execution results, and **moderate** in wider external adoption. Linux hosted Actions, Windows, other architectures/dependency combinations, broader Firefox/WebKit support, remote branch protection, private-reporting availability, GitHub artifact API retrieval and Vercel deployment remain untested here. The pinned private Playwright registry API requires review on upgrades. Repository-native source distribution and best-effort preview support are deliberate limits.

The guard is an execution boundary, not a hostile-code OS sandbox. The demo proves application-auth removal and denied revisit, not a production backend's credential revocation. Live providers, production database durability and broader security/accessibility certification were not audited. No push, tag, publication or deployment was performed for this review.

Durable source authorities are the [adoption design](../superpowers/specs/2026-11-05-adoption-readiness-design.md), [tracked plan](../superpowers/plans/2026-11-05-adoption-readiness.md), [current status](../PROJECT_STATUS.md) and [append-only record](../../test-impact/execution-record.jsonl). The original 216,814-byte record prefix remains unchanged.

Local supplemental evidence is under `output/adoption-remediation/final-review/`: `static-audit.json`, `final-evidence-audit.json`, `fresh-root-dependencies.json`, `prepare-only-verification.json`, the two scoped repair reviews, `fresh-demo-cli.json`/trace/video/screenshot, retained `fresh-demo-probe-attempt-1/`, and `documented-single-test.json`/log. The controller's `fresh-state.json`/`fresh-validation.log` and immutable attempt archives retain full native results. These ignored logs supplement the tracked outcome; they are not required to recover the active plan from a clean clone.
