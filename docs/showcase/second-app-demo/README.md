# Standalone work-orders recording

[Play the 25-second WebM](work-orders-demo.webm) · [Captions](work-orders-demo.vtt) · [Provenance and hashes](provenance.json)

This is the actual unrelated React/Vite target prepared by the successful standalone portability validation, at target commit `4b6f932eb8c9374efbeb767bffa4ada91b2528b2`. The recording imports its own `checks/browser/scenario.mjs` fixture and exercises its unchanged native HTML UI. No CRM page, product fixture, injected interface, or presentation styling is substituted for the application.

The browser follows a protected Requests link, signs in as `dispatch-north`, completes **Replace lobby lamp**, clicks the visible **Completed** link, signs out, and revisits the protected Completed route. Assertions prove one north completion, an unchanged south request, one mutation, an HttpOnly session during authentication, a revoked session after logout, and zero unexpected requests. The role-denial and other egress workflows remain in the separately retained four-test portability result; this video is one local workflow.

The canonical guarded capture passed **1 Chromium test in 25.6 seconds** (test body 24.8 seconds), with no skips, unexpected results, retries, or verification errors. The silent VP8 WebM is **960 × 540, 16:9, 25.000 seconds**, with five matching PNGs:

| Image | Visible stage |
| --- | --- |
| [01-sign-in.png](01-sign-in.png) | Protected route requires a desk identity; `dispatch-north` entered |
| [02-requests.png](02-requests.png) | North dispatcher and the north request |
| [03-request-completed.png](03-request-completed.png) | Lamp removed from Requested work after completion |
| [04-completed.png](04-completed.png) | Completed navigation displays the lamp |
| [05-signed-out.png](05-signed-out.png) | Protected route returns to sign in after logout |

The capture used Node `24.22.1`, Playwright `1.62.1`, React `19.2.8`, Vite `6.4.3`, and Vitest `3.2.7` on Darwin arm64 with Chromium. It verified all 31 copied reusable core files against the host and retained portability inventory before and after capture. Target source and served test-build hashes, 86 prior native evidence files, and `artifacts/portability/latest.json` stayed unchanged. The capture added its own isolated native invocation. No hosted CI, provider call, push, or deployment occurred.

`provenance.json` retains the host implementation commit (`4feb057`), contextual documentation HEAD (`6324ffc`), target commit, exact structured argv and working directory, native outcome, runtime versions, before/after core hashes, source/build hashes, media hashes, and stage timing. `native-report.json.txt`, `verification.json.txt`, `discovery.json.txt`, and the logs are byte-for-byte copies of this capture's native evidence. `inspection.json` records asserted target state without session credentials.

To reproduce from this checkout, use the installed offline dependencies and Node 24:

```sh
PATH=/Users/dio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/opt/homebrew/bin:$PATH \
  node docs/showcase/second-app-demo/capture_demo.mjs
```

The launcher reads the successful target from `artifacts/portability/latest.json`, creates an ephemeral capture spec/config inside that OS temporary repository, invokes its unchanged canonical guarded runner, retains native evidence, and removes only that ephemeral capture directory. It fails if the prepared target/build or expected hashes are missing. The retained `capture-workflow.ts.txt` and `capture-config.mjs.txt` are the exact capture sources. This does not rerun the full host suites or portability gate.

Use ordinary video controls with captions and no autoplay:

```html
<video controls preload="metadata" poster="second-app-demo/02-requests.png" aria-label="Standalone work-orders workflow">
  <source src="second-app-demo/work-orders-demo.webm" type="video/webm">
  <track src="second-app-demo/work-orders-demo.vtt" kind="captions" srclang="en" label="English" default>
  <a href="second-app-demo/work-orders-demo.webm">Download the recorded workflow</a>
</video>
```

Visual verification inspected all five screenshots and video frames at 2, 16, and 23 seconds; a complete offline FFmpeg decode returned exit 0. The app is intentionally a small, unstyled portability target. The presentation may frame these images, while the recorded UI stays faithful to the target.
