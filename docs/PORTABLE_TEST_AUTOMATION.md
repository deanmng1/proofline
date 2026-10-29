# Portable test-automation record

`test-impact/execution-record.jsonl` is the append-only project history for
the regression harness. Every line conforms to
[`execution-record.schema.json`](../test-impact/execution-record.schema.json)
and uses only repository-relative paths, shell commands, rule IDs, commits,
and artifact locations. It deliberately contains no Codex-, Cursor-, or
provider-specific runtime state.

## Recording protocol

Add a record whenever an agent or developer makes a meaningful decision,
writes or changes a plan, completes a review, changes implementation, or runs
a verification command. Record failures too: the event's `status` is
`failed`, the actual `exitCode` is retained, and the follow-up repair gets its
own event. Do not rewrite previous records; append a correction event that
links to the earlier event ID in its summary or evidence.

Each record should contain the smallest useful evidence:

- `scope`: repository-relative files or packages affected;
- `command` and `exitCode` for checks that ran;
- `evidence`: rule IDs, commits, reports, or artifact paths;
- `decisions`: the ruling, why it was chosen, and the cost if it proves
  wrong.

Use `artifacts/impact/manifest.json` and `artifacts/impact/selection.json` as
the run-specific evidence for impacted-test decisions. They are intentionally
ignored build artifacts; the JSONL record retains the command and outcome
needed to reproduce them.

Use `artifacts/coverage/<project>/coverage-summary.json` for measured line,
branch, function, and statement coverage. The approved scoped policy is in
`test-impact/coverage-baseline.json`: seven manifest groups covering critical
service, Test API, validator, and governance sources may not regress on any
metric. `pnpm coverage:check -- --base <base> --head <head>` verifies a unique,
full-history merge base; compares the merge-base manifest and baseline; and
rejects lowered thresholds, deleted sources, incompatible measurement
metadata, unclassified sources, or incomplete reports. Every report source is
either governed by a source glob or named by a reasoned exclusion. The command
writes requested/resolved revisions, complete group authority, measurements,
resolved producer command/argv, adapter and implementation identity, provider
package, installed version, and errors to `artifacts/coverage/ratchet.json`,
including on failure. Each group declares either an Nx target or a structured
manifest command plus a producer adapter and package-based version resolver.
Vitest and compatible non-Vitest Istanbul-summary producers have separate
adapter validation. There is
no global coverage target. `pnpm coverage` normalizes the absolute paths emitted
by Vitest into repository-relative report keys before the summaries become
governance evidence; the checker rejects absolute, escaping, backslash, or
duplicate-normalized evidence.

Run `pnpm record:check -- --base <base> --head <head>` to prove that the current
JSONL bytes are the exact merge-base prefix plus complete, schema-valid new
rows. It rejects any historical rewrite, CRLF conversion, malformed/duplicate
row, invalid scope, or missing single trailing LF. Each changed governed path
must overlap a newly appended row's repository-relative scope; old records
cannot satisfy a new change. `test-impact/rules.md` remains a separately
verified deterministic artifact. Missing, unreadable, and invalid proposed
records still produce `artifacts/record/check.json` with revision and error
evidence. CI validates but never edits the record.

## Future Codex/Cursor adapter boundary

A future skill or plugin should have four small adapters around this portable
record:

1. **Repository adapter** reads the project map, rules, feature ownership,
   and changed files.
2. **Evidence adapter** runs the configured lint, typecheck, Vitest,
   Playwright, and impacted-test commands and writes command outcomes.
3. **Authoring adapter** proposes rule tests first, then contract/UI/browser
   tests only when the behavior crosses those boundaries.
4. **IDE adapter** maps the same record into Codex, Cursor, or CI UI without
   changing its schema or the underlying commands.

The portable core must remain Node/shell/JSON based. An IDE integration may
add rich views, prompts, or navigation, but it should never be the only place
where decisions, test ownership, or verification evidence exists.

Agents author and review tests and ownership rules before merge. Normal CI
uses no agent or model tokens: it runs deterministic discovery, validation,
selected execution, full Vitest/Chromium gates, and coverage/record checks.
Future Cursor and Codex adapters consume the same checked-in JSON and JSONL
artifacts and invoke these same commands without requiring this conversation.

## Guardrails for an automated test author

- Read existing rules and the execution record before proposing tests.
- Keep provider calls behind deterministic adapters; never place credentials
  in fixtures or records.
- Add an acceptance rule ID before a new business behavior.
- Use fresh Test API state per test and isolate each browser context.
- Update `test-impact/features.json` and `rules.json` with every test-owner,
  exact-title, line, or tag change; regenerate `rules.md`.
- Fail closed when ownership, tags, Git history, or discovery is uncertain.
- Record the review, its fixes, and final verification before describing work
  as complete.
