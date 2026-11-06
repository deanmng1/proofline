# Proofline production-readiness evidence

## Intent and authorization

The user approved the three proposed milestones: hosted CI/release proof, a declared compatibility matrix and independent adopter pilot, and reliability/security hardening with release maintenance. Implement and test everything possible now with parallel agents, independent task reviews and a new independent rating. The starting source is `024aa838ade882fdcca46e63a4ae665569c16fd0`; its independent rating is 8.0/10. The original portable and enterprise designs remain binding.

The selected approach extends the existing repository-native harness and evidence. It preserves current deterministic tests and exact release authority. Alternatives rejected: replacing the harness with a service, counting synthetic runs as hosted proof, widening work-orders v1 to accept arbitrary applications, or building features solely to improve a score. The user selected execution by explicitly asking to proceed with these milestones; routine implementation choices are recorded here rather than reopening that decision.

Direct local main work is authorized. The active hosted PR/push milestone authorizes publishing reviewed source to the existing `deanmng1/proofline` repository for those checks after local verification. Use a `codex/` candidate branch and PR first, preserve history, never force push, and advance main only after the required checks and independent source review pass. Do not change remote protection/security settings or publish tags/releases without a separate concrete decision. No production deployment is authorized. A preview deployment requires an identified preview project and securely configured credentials. Missing external prerequisites remain explicit incomplete evidence, not a passing local substitute.

## Existing observations

- Remote main is `f4f10c727edd2622182b93131f1eb7c31553f411`, 75 ancestors behind local main. Its old canonical verify runs failed; the older duplicate CI passed. The local replacement has never been run there.
- Main has no protection and private vulnerability reporting is disabled. The repository has no Actions deployment secrets. Connected GitHub and authenticated CLI access work. Docker's local daemon is unavailable.
- The current actual compatibility evidence is Darwin arm64/Chromium on Node 24.22.1, pnpm 11.24.0, React 19.2.8, Vite 6.4.3, Vitest/V8 3.2.7 and Playwright 1.62.1. Git minimum is 2.48.
- Security recon reproduced an option-operand gap in Node child argv validation on Node 24.22.1. Relative production module aliases and post-download release identity substitution require RED fixture confirmation before repair.

## 1. Boundary hardening

`assertSafeNodeArgv` must distinguish option operands from the script boundary. Caller preloads, loaders, inspector and `--run` forms remain forbidden everywhere Node treats them as options, including after `--conditions value`. Review a finite supported option grammar; unknown ambiguous forms fail closed. Preserve ordinary script arguments and `--` boundaries. Prove direct and inherited spawn/execFile/fork rejection before a harmless local preload sentinel executes. No test contacts a remote origin.

Production module identity must canonicalize or reject relative dot-segment aliases, reject escape/malformed identities and duplicates after normalization, and retain legitimate Vite virtual/query identities. A forbidden module alias must be rejected with marker-free chunk content. Both real production builds must remain accepted. These changes do not turn the guard into an OS sandbox or a general security scanner.

## 2. Hosted release evidence and recovery

Factor a bounded GitHub transport with fixed API origin, safe repository/routes, finite request/page/body limits, correct artifact redirect handling and sanitized failures. Defaults are 30 seconds per request including body, 100 pages of 100 records, 8 MiB per JSON body and 256 MiB per archive; tests can lower bounds. Artifact redirects are explicit HTTPS-only reviewed GitHub Actions storage hosts, never arbitrary origins, and strip authorization on storage requests. Offline fetch fixtures exercise pagination, malformed/HTTP/timeout/size failures, and credential-safe diagnostics. Tests never contact GitHub or Vercel.

Add exact-commit resolution alongside existing tag resolution. Both use the same successful, unambiguous push/main `.github/workflows/verify.yml` run and attempt-named unexpired artifact. Dispatch/PR/fork artifacts remain ineligible. After download, pin refreshed run ID, artifact ID, attempt, digest and authority to the original selection; tag mode must also reject tag movement. Preserve digest-before-extraction and existing archive/native/portability checks.

A read-only hosted-proof CLI writes a versioned sanitized observation receipt only after complete verification. It records source/verifier provenance, actual API identifiers, run/attempt/artifact, archive and release digests, inventory and gate summaries. Injected/offline transport receipts are labeled fixture evidence; a caller flag cannot promote them to hosted evidence. The receipt is supplementary, never replacement release authority. Write it outside the inventoried artifact, preserve failures and refuse overwrite.

A pure recovery assessor demonstrates expired/missing evidence rejection, a complete newer attempt of the original trusted run, stale-attempt rejection and dispatch rejection. It recommends safe action and never automatically reruns or edits metadata. A read-only audit workflow may use exact-commit input but may not produce release-eligible build artifacts.

Prepare a manual preview workflow consuming the same immutable artifact with pinned `vercel deploy --prebuilt` and no source rebuild or `--prod`. Stable production deployment remains separately bound to trusted release tags; prereleases must not automatically deploy production. Missing project credentials fail before provider invocation. Local workflow contracts establish preparation only. A real preview success needs provider/source identity and deployed artifact checks; HTTP 200 alone is insufficient.

The user explicitly selected **prepare and test the workflow; leave live staging pending**. Do not invoke a live preview deployment or request credentials in this increment.

## 3. Compatibility, preflight and upgrade usability

Declare exact candidate cells `linux-x64-chromium` on `ubuntu-24.04` and `darwin-arm64-chromium` on `macos-15`, using the current pinned tuple and both CRM/work-orders. GitHub documents these runner architectures. Configuration is not evidence of execution. Windows and other browsers/versions remain outside the verified support claim.

Use strict declaration parsing and source/run/session-bound collection from existing native full unit/browser/scenario and independent work-orders validators. Record actual platform/architecture/runtime, dependency tuple, core hash inventory and immutable references. A missing cell stays not-observed; smoke, stale source, reused dependencies or summary-only success cannot satisfy complete independent compatibility. Reports must separate locally executed and actually hosted observations.

New invocation records add `metadata.runtime = {nodeVersion, platform, arch, execPath}` from the actual producing process, never caller-supplied overrides. Compatibility requires matching runtime on the authoritative gates, every bound unit child and independent-target native records; the collector's own platform alone is insufficient. Existing v1 portability/release evidence without runtime remains backward compatible. The work-orders metadata verifier permits only this strict optional addition alongside its exact existing fields and rejects malformed/unknown metadata. A requested hosted mode/environment is observational and cannot authenticate a hosted claim; actual GitHub API/job/artifact provenance is audited separately.

Add a built-in-only read-only `doctor` with source and installed stages, text/JSON output and actionable checks. Source mode works without node_modules and performs no network/install/build/browser launch or Git mutation. Check selected Node/child resolution, exact pnpm, Git minimum/full history, coherent package/lock/manifest pins and supplied revisions. Installed mode checks direct dependency containment and exact installed Chromium/headless-shell/FFmpeg using the existing reviewed registry resolver. Browser files are a prerequisite check, not proof of OS-library readiness or passed tests. No automatic fix mode, environment dump or credentials in output.

Integrate the macOS cell into canonical verification without letting a separate matrix or manual dispatch replace existing release gates. The workflow's overall successful conclusion must include every required compatibility job. Retain per-cell artifacts under unique names. Candidate status changes to executed only from genuine results.

## 4. Independent agent adoption pilot

Separately author and freeze a small React/Vite Roomboard application before adaptation. It has `/rooms` and `/reservations`, fixed room/slot choices, reserve/cancel/conflict and stable-command replay semantics, and no auth, tenants, provider or database claims. The frozen baseline contains ordinary app source/dependencies/tests and no Proofline manifest, adapters, ownership, lifecycle or test entrypoint. Its source commit, inventory/hash and acceptance examples are recorded.

A fresh pilot agent receives only that external frozen repository, public onboarding/portable/support documentation and an immutable core source reference. It inventories and authors adaptation rather than receiving prewritten target metadata or work-orders result assumptions. Record every question/intervention and blocker. Preserve unchanged core hashes and existing target history; do not use work-orders bootstrap/counts to certify this target.

Prove real independent installation with no host dependency links; target-owned deterministic rules and visible cross-screen reserve/cancel workflow; real exact selection after a known change and canonical-full fallback for unmapped metadata; guarded native outcomes, isolated workers, coverage/append-only governance and production-negative artifacts. An independent task review checks the resulting adaptation and evidence. Retain the frozen baseline and adapted target. Label this an independent **agent** adoption trial, never human-user validation or an external organization adopting Proofline.

## 5. Maintenance and measured evidence

Provide source-versioned upgrade, recovery, security-reporting and support playbooks with actual owner/contact routes, best-effort expectations and candidate release notes. Do not invent an SLA, enabled reporting switch, published release or maintenance history. Execute a compatible harness upgrade/reverification rehearsal using old/new immutable source; schema/provider migrations still require separate review.

Run narrowly targeted harmless mutation proofs in disposable copies: reverting the argv fix must make its new sentinel regression fail; relaxing expected-status/retry acceptance must make existing native negative fixtures fail. Never mutate the primary source or let a mutation contact live providers. Repeat the genuine scenario isolation suite in independent runs and collect actual source-bound runtimes/results. A finite zero-failure sample is not a universal flake-rate guarantee. Existing failure artifacts remain immutable.

## Acceptance and evidence boundary

1. Each behavior change has retained RED/GREEN evidence and independent spec/quality approval. New source has exact ownership/bindings and measured coverage; all 24 existing baseline entries and the full authored-record byte prefix remain unchanged.
2. Both fresh installations, the original twelve-command Task 8 gate, explicit worker/shards, independent portability and real local release directory/ZIP verification pass at a committed implementation head with base `024aa838ade882fdcca46e63a4ae665569c16fd0`.
3. Actual hosted PR/main checks, compatibility cells and API artifact verification are exercised where authorized and available; each result is attributable to its exact real source/run/attempt. No synthetic identity becomes hosted evidence. Live staging remains separately pending if configuration is unavailable.
4. The third-target pilot and maintenance/reliability drills retain provenance and failures, and do not impersonate real human experience.
5. A new independent reviewer, separate from implementers and task reviewers, checks integrated code and actual results using the same weighted rubric. Its score is judgment, not a target. Human onboarding, support history, missing platform/hosted/deployment proof and external settings remain honestly reported.
6. Update tracked current status/plan/handoff, append evidence, commit small local changes, validate the committed closeout and preserve preexisting `.codex/`, presentation assets/server and all prior evidence.

## Pilot-discovered portability clarification

The first blind Roomboard trial at core `d262c0c` stopped because the v1 golden matrix only accepted tenant switching or authenticated contexts. Roomboard has neither. Preserve that blocked report and the immutable baseline. Add the explicit `tenantIsolationMode: "not-applicable"` alternative with a required nonblank `tenantIsolationReason`; reject omitted/null/unknown modes, missing reasons, and a reason on either existing tenant mode. This is an additive v1 target declaration, not tenant-isolation evidence. The CRM's original tenant scenarios and acceptance requirements remain binding. Retry the trial only from a new immutable core and label the retry assisted; do not rewrite the blind trial as successful.

Canonical compatibility runs use one required matrix job containing both complete declared cells, with fail-fast disabled and distinct observation artifacts. Only the Linux cell may upload the existing exact release name. GitHub's overall workflow conclusion includes both cells; the existing API verifier rejects the artifact unless that whole workflow succeeds. No matrix observation substitutes for the sixteen authoritative gates.

## First hosted adoption baseline

Read-only publication preflight established that remote main f4f10c7 predates the first harness manifest. Default historical record comparison correctly rejects it. Follow the independently reviewed [bootstrap operations sequence](../../verification/2026-11-05-hosted-bootstrap.md): full candidate PR against pinned reviewed024aa83 foundation, normal main fast-forward only after both cells and source review, preserve the first main missing-manifest failure, then a separate reviewed/full-matrix PR for the observation successor before its main advance. A later actual hosted defect may add a causally justified, separately tested/reviewed repair to that successor; it must be named accurately and receive the same complete PR/main checks. Only the successor's complete successful actual push/main run and exact-source API/native artifact audit establish release eligibility. Do not change resolver bases, weaken missing-metadata failure, force push, merge an unchecked head, or promote foundation/PR/failed artifacts. Actual first-PR/main results are recorded in [the bootstrap observation](../../verification/2026-11-05-hosted-bootstrap-observation.md); the successful eligible successor and API/native audit remain required.

## Final ordinary-API boundary cohort

The independent evaluator completed a finite source cohort at6c8fcd1 and found R1–R5: independent Node executors, mutable invocation inputs, effective request/constructor authority, ordinary raw transports/resolvers and browser worker transports. These enforce the original guard-before-enabled-plane/fail-closed contract. See docs/verification/2026-11-05-runtime-boundary-cohort.md. Require stable validated/dispatch snapshots, private exact one-use native child approval, declared numeric Socket/TLS authority, explicit unsupported UDP/HTTP2/DNS/Worker/asynchronous-loader behavior and shared pre-page browser Worker/SharedWorker denial. Synchronous registerHooks/local MessageChannel remain guarded. Guarded optional Nx plugins run in process/daemon-off; do not permit unproved Unix sockets or weaken test isolation. Preserve old floors/history and all prior failures. Task approvals and scoped positive/negative evidence precede one committed freeze; the evaluator closes all five groups together, then the entire new fresh gate and current-core third-target upgrade must pass before hosted publication. This finite boundary excludes private native/OS hostile-code isolation and deliberate guard-global replacement.
