# Real browser demo

[Play the recording](workflow.mp4) · [Original Playwright recording](workflow.webm) · [Captions](workflow.vtt)

This is a screen recording of the existing insurance CRM reference application running as a local **test build**. The portable Proofline harness supplies isolated state and deterministic API/provider adapters. The application and its workflow were not changed for the recording.

The six frames show a single continuous journey:

| Frame | What the viewer sees |
| --- | --- |
| [01 — Sign in](01-login.png) | An unauthenticated customer deep link reaches the login screen. |
| [02 — Intake](02-intake.png) | Taylor Flagship and the property at 12 Cypress Way have been created. |
| [03 — Quote](03-quote.png) | A $100 Risk Secure quote is ready to bind. |
| [04 — Policy](04-bound-policy.png) | The policy is bound and its $12.50 commission has accrued. |
| [05 — Finance](05-finance-ledger.png) | A $10 deposit appears beside the commission and immutable audit history. |
| [06 — Access denied](06-denied-route.png) | After logout, revisiting the protected policy route returns to login. |

Frame 05 is the most useful still for a demo slide. The recording is silent and deliberately paced; the optional WebVTT captions explain each completed step. The original WebM contains unedited Playwright frames. The MP4 is a local H.264 transcode of the same recording, without added or simulated application content.

## What was actually verified

The temporary capture test follows [the existing golden workflow](../../../apps/crm-e2e/src/proofline/golden-workflow.spec.ts), using the existing navigation/workflow helpers and `createScenario` / `startWorkerScenarioServer`. Navigation between CRM screens uses the visible links and bound-policy link. Direct navigation is limited to the initial deep link and the final protected-route guard check.

The test retains all original persisted-state assertions: one customer, property, quote, policy, policy timeline entry, finance ledger, finance entry, and commission entry; no pending messages. It additionally verifies the $10 deposit, no unexpected requests, no authenticated context after logout, final `/login` URL, and absence of policy text. The final inspection is in [inspection.json](inspection.json); the actual runner output ends in **1 passed** in [capture.log](capture.log).

Browser and server execution ran through `tools/proofline/canonical-runner.mjs playwright`, preserving the current egress preloads and declared child capabilities. The local server uses the manifest test entrypoint and launch capability. Fonts/provider requests permitted by the existing fixture are fulfilled locally by deterministic fakes; tests do not connect to live providers.

## Reproduce

From the repository root, with Node 22 or newer on PATH, dependencies, and the Playwright Chromium binary already installed:

```sh
node docs/showcase/demo/capture_demo.mjs
ffmpeg -y -hide_banner -loglevel error -i docs/showcase/demo/workflow.webm -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -an docs/showcase/demo/workflow.mp4
```

The retained final capture used bundled **Node v24.22.1** with its directory first on PATH:

```sh
PATH=/Users/dio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/opt/homebrew/bin:$PATH /Users/dio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node docs/showcase/demo/capture_demo.mjs
```

The capture script runs `pnpm build:test`, then the exact guarded command:

```sh
node tools/proofline/canonical-runner.mjs playwright test --config output/demo-capture/playwright.config.ts
```

It copies [the retained capture source](capture-workflow.ts.txt) to ignored `output/demo-capture/` and generates a temporary config importing the current repository config. It does not alter production application code, the harness, or the original test fixtures. The only browser-context option additions are the recording size and viewport. Recording uses the base Playwright test fixture, so the normal scenario fixture cannot delete a successful video.

[Provenance](provenance.json) records repository HEAD for context and binds the actual implementation and test build with source hashes. Ongoing documentation edits do not require a clean HEAD for this capture. It also records runtime, artifact hashes, recording duration, and dimensions. This is a focused Chromium demonstration, not a new full completion gate, cross-browser result, production-provider integration test, or exhaustive claim about all harness behavior.

An initial capture-only selector mismatch failed before the first stage; its diagnostic log remains in ignored `output/demo-capture/attempt-1-selector-failure.log`. Subsequent temporary captures passed under the shell's Node 20, then all retained frames, inspection, capture log, and recording were replaced by the final passing Node 24 run. Earlier run records stay in ignored `output/demo-capture/`; the delivered assets and provenance describe only the final Node 24 capture.
