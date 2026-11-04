# Proofline companion documents design

## Intent and selected approach

The user selected two companion documents from the previously presented
documentation-native and presentation-polished alternatives. The visual document
must introduce Proofline to someone with no prior knowledge, communicate its
usefulness and highlights, avoid information overload, include useful infographics
and measured charts, and open for a walkthrough when complete. The technical
document serves readers who choose to investigate the implementation.

Separate deliverables preserve both reading experiences. A single dense report
would impede the introduction; a presentation alone would lack technical depth.
The user selected an interactive browser presentation plus a PDF copy for the
revised presentation, and repository-native Markdown with Mermaid remains the
technical guide. These are format choices, not new product work.

## Presentation

Create nine slides on a fixed 1920x1080 canvas, one takeaway per slide, with a
matching PDF. The user selected the Warm Editorial visual preview: paper
`#F5EEE3`, ink `#2F2721`, terracotta `#A6422A`, Instrument Serif headlines, and
Manrope body text. Use large typography, generous whitespace, varied editorial
compositions, editable diagrams/charts, and brief prose. Explain unfamiliar terms
when first used. Readers should leave
able to say what the harness is, what it checks, how it fits a development workflow,
what the evidence proves, and what adoption requires.

1. What Proofline is and the recurring regression problem it addresses.
2. The reusable cycle: describe behavior, author checks, run each change, retain evidence.
3. How application, portable manifest/runners, rule tests, and browser journeys fit.
4. A recorded real CRM user journey, playable in the browser with native controls
   and captions. The PDF shows a clearly identified static frame.
5. Evidence from that demo: visible finance state and persisted invariant counts.
6. Practical capabilities: correctness, retries, tenant/role boundaries, isolated tests,
   and production separation.
7. Coverage infographic using explicitly classified governed sources; no universal
   product-quality score or invented completeness claim.
8. Observed browser execution measurements and a compact verification summary.
9. What transfers to another React/Vite application, what must be adapted, and
   where to read more. Include browser/distribution limitations briefly.

Keep commands, source inventories, binding internals, guard mechanics, and lengthy
methodology in the companion guide. Footnotes may identify measurement scope and
the tested revision without becoming a second technical narrative.

## Technical guide

Create `docs/showcase/TECHNICAL_GUIDE.md`, approximately 1,800-2,600 words, with
editable Mermaid diagrams, concise comparison tables, relative repository source
links, the canonical gate chain, and a source/evidence index. Cover portable versus
reference boundaries; manifest structure and exact ownership; hybrid test layers;
scenario setup, isolation and cleanup; egress and production-negative controls;
impact fallback; merge-base coverage and append-only record governance; browser
matrix; replay/retry behavior; adaptation steps and limits.

Use five technical diagrams: architecture boundaries, selection pipeline, scenario
lifecycle/security, test ownership, and local/CI execution. Add a companion PDF
link at the start and keep all numeric definitions traceable.

## Measurement integrity

Use reference implementation snapshot `4dc77a6ec005c710bd992b771a1c984b94b4e6a1`
and impact base `31b63c305eb37ab11c117a42445a5b0c9b1695e0`. New documentation commits
must not be described as the head that passed the original full gate.

Store audited data, definitions, and source paths in `docs/showcase/measurements.json`.
Distinguish rules, binding IDs, discovered execution identities, workflow rows,
tests, workspaces, coverage targets, and governed groups. Different suite timings
are separate workloads, not a speedup comparison; runner durations exclude builds.
Coverage percentages must retain their source denominator and exclusions.

Pass 1 is in committed JSONL. Pass 2 validated the commit containing that event;
its local log and ignored progress ledger intentionally did not mutate that commit.
Reference the local evidence as such. Never claim the optional Firefox/WebKit
smoke ran locally when browser binaries were absent.

## Production and review

The source generator and measurements live beside the guide. The generated PDF is
retained in the project, with any QA page images kept under ignored output paths.
The browser deck uses inline CSS/JavaScript and embedded fonts, with relative demo
media assets. It supports keyboard, touch, reduced motion, and optional inline
text editing. Chromium print export preserves selectable PDF text. The existing
Python build entrypoint delegates to the Node exporter for compatibility.

Render every presentation page and inspect for clipping, overlap, unreadable labels,
and information density. Independently review both documents for factual accuracy
and clarity. Verify Mermaid syntax, local source links, PDF text/page count,
measurement values, record governance, and whitespace. Documentation-only work
does not change harness behavior or require rerunning the completed full gate.
Append new evidence without rewriting any earlier JSONL record. Do not push.

## Demo integrity

Capture the existing visible golden workflow through the real scenario adapter,
canonical guarded runner, deterministic fakes, and local test build. Never replace
live capture with a fabricated result. Record the source revision, implementation
hashes, actual runtime, capture command, persisted assertions, and asset hashes.
Pacing added for comprehension is presentation timing, not a performance result.
Keep the original harness and application code unchanged.

## External design guidance

Use the inspected Frontend Slides skill from the upstream repository for fixed
stage layout, motion, visual discovery, and browser presentation structure. Keep
the selected Warm Editorial preview as the visual authority and retain MIT and
font license notices. Do not deploy or publish the presentation.
