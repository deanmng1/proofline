# Presentation design and playback

The user selected the Warm Editorial preview: paper, ink, terracotta, Instrument
Serif headlines, and Manrope body text. The updated 13-slide presentation pairs
that visual system with actual recorded product footage and the retained harness
measurements. The detailed technical guide remains the implementation companion.

## Presentation skills inspected online

- [Frontend Slides by Zara Zhang](https://github.com/zarazhangrui/frontend-slides):
  used for fixed-stage browser presentation structure, visual style discovery,
  motion, accessible navigation, and print adaptation. Its mandatory viewport CSS
  is included in the HTML. The [MIT notice](licenses/frontend-slides-MIT.txt) is
  retained. This task used a local copy of the skill without changing global
  Codex configuration or deploying the presentation.
- [Anthropic's PPTX skill](https://github.com/anthropics/skills/tree/main/skills/pptx):
  inspected as an alternative for PowerPoint authoring and slide quality checks.
  Its code and scripts were not copied into this project.

## Offline fonts and media

Instrument Serif and Manrope font data are embedded in the HTML, sourced from
Fontsource packages version 5.3.0. Their notices are retained in
[Instrument Serif OFL](licenses/Instrument-Serif-OFL.txt) and
[Manrope OFL](licenses/Manrope-OFL.txt). No remote font request is needed to view
the deck. The videos, captions, and screenshots are relative files in `demo/` and
`second-app-demo/`; keep both directories with the HTML when sharing the folder.

The recording demonstrates the real reference application's test build using
isolated deterministic adapters. [Capture provenance](demo/provenance.json)
records the actual runner, runtime, assertions, implementation hashes, and asset
hashes. Pacing and pauses serve the walkthrough; they are not benchmark timings.

Slide 4 retains a user-paced replay of [actual baseline, failing, and fixed test
runs](bug-demo/results.json), using FIN-002 and an unchanged existing test. The
regression is deliberately introduced in an isolated copy, then corrected by
restoring the source condition. The viewer replays captured evidence. It does
not execute tests or apply a fix. The PDF shows the failing and passing outcomes
together. IBM Plex Mono is embedded for readable code/output excerpts, with its
[OFL notice](licenses/IBM-Plex-Mono-OFL.txt) retained.

## Current evidence and second-app recording

Slides 8–9 explain required runtime outcomes, preserved invocation artifacts, verified release output and portability. Slide 10 plays a 25-second actual guarded work-orders test: sign in, complete a request, navigate to Completed, sign out and revisit. The unchanged minimal target UI is shown as recorded; [capture provenance](second-app-demo/provenance.json) records native outcomes, media hashes and the 31 unchanged core files. The browser poster shows Requests; the PDF shows the resulting Completed screen.

Slide 12 reports the fresh verification at implementation `4feb057`: 536 unit tests, 43 Chromium tests, eight coverage groups and ten second-app gates. [Measurements](measurements.json) preserve the earlier snapshot under `historicalSnapshots`; [distributed primary evidence](verification/README.md) retains source bytes and hashes for the current figures. Synthetic local CI identity is explicitly distinguished from a hosted workflow or deployment. The overlapping multiworker/shard runs are not added to unique browser-test counts.

## Reading and rebuilding

Open `proofline-overview.html` in a browser. Arrow keys and Space navigate, and
both recording slides use normal video controls. The PDF is a static companion whose
recording slides show static frames rather than interactive playback.

With project dependencies and local Playwright Chromium installed, run:

```sh
node docs/showcase/build_overview.mjs
```

The existing `python3 docs/showcase/build_overview.py` command delegates to that
exporter. The exporter verifies retained snapshot/capture hashes and native outcomes, then produces the PDF and private QA slide images under
`output/pdf/proofline-refresh/`. The HTML remains the editable presentation source.
