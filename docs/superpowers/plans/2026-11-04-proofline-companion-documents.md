# Proofline Companion Documents Implementation Plan

> **For agentic workers:** Use the existing parallel research workers for independent source audits and technical authoring; the controller authors the PDF and integrates a fresh document review. Steps use checkbox syntax for tracking.

**Goal:** Deliver a clear newcomer presentation and a detailed repository-native technical guide, then open the presentation.

**Architecture:** Both documents describe the same verified implementation snapshot. Audited measurements drive vector charts; detailed Mermaid diagrams and source references remain in Markdown.

**Tech Stack:** Markdown, Mermaid, JSON, Python ReportLab, Poppler PDF rendering.

**Spec:** `docs/superpowers/specs/2026-11-04-proofline-companion-documents-design.md`

## Global constraints

- Eight landscape presentation pages with one primary takeaway per page.
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
