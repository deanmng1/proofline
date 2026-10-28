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
`test-impact/coverage-baseline.json`: seven critical service, Test API, and
validator files may not regress on any metric. `pnpm coverage:check` normalizes
report paths to repository-relative names, fails for missing evidence, and
writes `artifacts/coverage/ratchet.json`. There is no global coverage target.
Record any reviewed baseline change with its reason and evidence.

Run `pnpm record:check` to reject malformed/empty JSONL lines, invalid fields,
absolute scope/artifact paths, duplicate event IDs, or `rules.md` drift. Only
one trailing newline is allowed; blank interior lines are invalid. The
machine-readable rule registry is authoritative; `pnpm rules:generate` writes
its deterministic human-readable view. CI validates but never edits the record.

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
