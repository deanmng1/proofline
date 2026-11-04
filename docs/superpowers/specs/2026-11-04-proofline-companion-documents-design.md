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
The author chooses PDF for the presentation and repository-native Markdown with
Mermaid for the technical guide. These are format choices, not new product work.

## Presentation

Create an eight-page landscape PDF, one takeaway per page. Use large typography,
generous whitespace, a consistent blue/teal/amber visual language, vector diagrams,
and brief prose. Explain unfamiliar terms when first used. Readers should leave
able to say what the harness is, what it checks, how it fits a development workflow,
what the evidence proves, and what adoption requires.

1. What Proofline is and the recurring regression problem it addresses.
2. The reusable cycle: describe behavior, author checks, run each change, retain evidence.
3. How application, portable manifest/runners, rule tests, and browser journeys fit.
4. One user-visible CRM journey as the reference proof, with clear navigation steps.
5. Practical capabilities: correctness, retries, tenant/role boundaries, isolated tests,
   and production separation.
6. Coverage infographic using explicitly classified governed sources; no universal
   product-quality score or invented completeness claim.
7. Observed browser execution measurements and a compact verification summary.
8. What transfers to another React/Vite application, what must be adapted, and
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
Render every presentation page and inspect for clipping, overlap, unreadable labels,
and information density. Independently review both documents for factual accuracy
and clarity. Verify Mermaid syntax, local source links, PDF text/page count,
measurement values, record governance, and whitespace. Documentation-only work
does not change harness behavior or require rerunning the completed full gate.
Append new evidence without rewriting any earlier JSONL record. Do not push.
