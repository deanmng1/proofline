# Proofline Companion Documents Implementation Plan

> **For agentic workers:** Use the existing parallel research workers for independent source audits and technical authoring; the controller authors the PDF and integrates a fresh document review. Steps use checkbox syntax for tracking.

**Goal:** Deliver a clear newcomer presentation and a detailed repository-native technical guide, then open the presentation.

**Architecture:** Both documents describe the same verified implementation snapshot. Audited measurements drive vector charts; detailed Mermaid diagrams and source references remain in Markdown.

**Tech Stack:** Markdown, Mermaid, JSON, self-contained HTML/CSS/JavaScript, Playwright Chromium print export, Poppler PDF rendering. The initial PDF used ReportLab; the revised browser deck replaces that authoring path.

**Spec:** `docs/superpowers/specs/2026-11-04-proofline-companion-documents-design.md`

## Global constraints

- Ten landscape presentation slides with one primary takeaway per slide, using the user-selected Warm Editorial visual treatment.
- Tested snapshot `4dc77a6ec005c710bd992b771a1c984b94b4e6a1`; no invented speedups.
- Keep portable harness distinct from the CRM reference implementation.
- Preserve all earlier execution-record bytes and the existing `.codex/` directory.
- No implementation changes and no push.

## Review focus

- A newcomer can define the harness and its benefits after reading the PDF.
- Every chart identifies its measurement scope and denominator.
- Optional browser smoke and unimplemented workflow operations remain explicit.
- Technical diagrams reflect current implementation rather than only the original design.
- PDF pages and repository links remain usable outside the author's machine.

### Task 1: Audit facts and author the technical companion

- [x] Inspect manifests, rule registry, official logs, coverage artifacts, and implementation sources.
- [x] Create `docs/showcase/measurements.json` with exact definitions and provenance.
- [x] Create `docs/showcase/TECHNICAL_GUIDE.md` with five editable technical diagrams.

### Task 2: Produce the visual overview

- [x] Create `docs/showcase/build_overview.py` using audited measurements.
- [x] Generate and retain `docs/showcase/proofline-overview.pdf`.
- [x] Render all eight pages to ignored output PNGs and inspect every page.

### Task 3: Review and deliver

- [x] Independently review facts, narrative clarity, chart definitions, links, and diagrams.
- [x] Repair material findings; check PDF text, page count, link targets, and `git diff --check`.
- [x] Append scoped execution evidence and run pinned record governance.
- [x] Make a small documentation commit and open the PDF in Codex.

### Task 4: Redesign the visual deck and add the recorded demo

- [x] Find and inspect online presentation skills, show three design previews, and incorporate the user's Warm Editorial and browser-plus-PDF selections.
- [x] Capture the actual guarded reference journey, retain screenshots/video/captions, and bind provenance to the supported runtime and implementation sources.
- [x] Author `docs/showcase/proofline-overview.html` with varied editorial compositions, embedded fonts, nine slides, native demo playback, and keyboard/touch controls.
- [x] Replace the PDF generator with Chromium print export and preserve the Python compatibility entrypoint.
- [x] Verify desktop/phone fitting, keyboard behavior, media playback, offline dependencies, all nine PDF pages, chart values, and source references.
- [x] Independently review the final deck, append scoped evidence, run lint and pinned record governance, commit locally, and open the browser presentation.

### Task 5: Show Proofline catching a regression and verifying the fix

- [x] Preserve a clean main checkout while producing baseline/red/green evidence in a disposable isolated repository copy.
- [x] Bind the case to the existing FIN-002 manifest identity and unchanged finance test. Reject environmental failures and unexpected outcomes.
- [x] Retain source mutation, raw output, test/source hashes, command, actual exit statuses, and a passing restored finance-file suite.
- [x] Add an interactive captured-run replay before the CRM workflow, with a static PDF before/after composition. Label the controlled regression and developer-applied fix clearly.
- [x] Verify playback states, unchanged existing video, desktop/phone layout, ten PDF pages, evidence links, independent review, lint and append-only record governance.
- [x] Commit the documentation locally and reopen the presentation at the regression demo. Do not push.
