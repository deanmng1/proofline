# Presentation design and playback

The user selected the Warm Editorial preview: paper, ink, terracotta, Instrument
Serif headlines, and Manrope body text. The revised nine-slide presentation pairs
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
the deck. The video, captions, and screenshots are relative files in `demo/` and
must travel with the HTML when sharing the folder.

The recording demonstrates the real reference application's test build using
isolated deterministic adapters. [Capture provenance](demo/provenance.json)
records the actual runner, runtime, assertions, implementation hashes, and asset
hashes. Pacing and pauses serve the walkthrough; they are not benchmark timings.

## Reading and rebuilding

Open `proofline-overview.html` in a browser. Arrow keys and Space navigate, and
the demo slide uses normal video controls. The PDF is a static companion whose
demo slide shows the poster frame rather than interactive playback.

With project dependencies and local Playwright Chromium installed, run:

```sh
node docs/showcase/build_overview.mjs
```

The existing `python3 docs/showcase/build_overview.py` command delegates to that
exporter. The exporter produces the PDF and private QA slide images under
`output/pdf/proofline-refresh/`. The HTML remains the editable presentation source.
