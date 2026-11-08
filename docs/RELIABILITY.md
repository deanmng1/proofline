# Verification reliability observations

Proofline's collector reports a finite sample of canonical verification runs. It is supplementary tracking: required PR/push tests, native outcomes, coverage ratchets and release eligibility remain the authority. A retry pass never changes an earlier failed attempt. Existing PR and main failures remain failures in their original records.

## Collect a current snapshot

Use Node 24.22.1 and a read-only GitHub token with Actions read and repository contents read access. Put the token in `GH_TOKEN` (or `GITHUB_TOKEN`), never a command argument or source file. Run outside tests:

```sh
node tools/proofline/reliability.mjs \
  --repository deanmng1/proofline \
  --workflow .github/workflows/verify.yml \
  --since 2026-11-01T00:00:00Z \
  --until 2026-11-06T00:00:00Z \
  --output /absolute/existing-parent/observation-2026-11-06T000000Z
```

Choose an actual UTC window and a new output directory whose parent already exists. Use the parent's physical path; symlink ancestors are rejected. The command creates the directory exclusively and writes `observation.json`, `summary.json` and `summary.md` exclusively. Existing output is never replaced. An interrupted collection/write may leave an incomplete directory; preserve it as a failed operation and use a new directory for the next collection. There is no automatic retry or deletion.

All repository, workflow, window and output inputs are explicit. The API host is fixed to `api.github.com`; only the reviewed GET routes are available, with no redirects, code/artifact downloads, provider/model calls or run mutations. API/body/credential errors fail the command with sanitized diagnostics. Tests inject fully offline API responses; running the regression never contacts GitHub.

## Read the sample honestly

The collector resolves the repository's actual default branch and canonical workflow ID/path through GitHub. It samples only push and manual (`workflow_dispatch`) runs for that branch. **PRs, forks, other branches and other workflows are outside the sample.** Excluding PRs does not recategorize their failures or claim that they passed.

The requested interval selects inclusive **run creation timestamps**, not completion timestamps or elapsed successful operation. The observation records a fixed collection cutoff. All attempts from 1 through each listed `run_attempt` are requested through attempt-specific metadata and jobs APIs. The run is reread after collection; a changed attempt, source or state fails collection instead of mixing a moving history.

Run-list/run and attempt endpoints can expose different stable `updated_at` values. The collector preserves the attempt value and compares the list with the final run view for advancement; it does not treat cross-endpoint timestamp inequality alone as a race. Attempt identity, source, status and conclusion must still match the selected run. Non-null job timestamps cannot precede run creation or a known attempt start, and step timestamps must stay within known job intervals. Contradictory intervals fail collection and imported-summary validation; null times remain unknown.

Each observed run/attempt retains its source SHA, event/ref, conclusion and timestamps; jobs retain their IDs, platform, status, duration and current canonical gate outcomes. Completion is the last observed job completion, labeled `last-observed-job`; absent completion/duration remains null. This is an aggregate GitHub observation, not native proof that all expected tests ran. Missing cells/steps, pending work and unavailable attempts remain explicit unknowns. Failed required gates are named when GitHub's step data supplies that evidence; no failure is classified as infrastructure without separate evidence.

The prior sole-job contract named exactly `verify` is retained with `platform: null`, after identical job IDs are deduplicated. Its original job/step facts and workflow outcome remain recorded; both current platforms and every current gate are unknown, even when a historical step has a familiar label. Summaries count these unclassified legacy jobs only when present. Mixed legacy/current jobs, multiple distinct legacy jobs and other unsupported names still fail closed. This narrow historical contract changes neither the observation window nor identity, timestamp or authority checks.

The summary shows run/attempt counts, first-attempt and retry denominators, each terminal conclusion separately, unknown counts and per-platform/gate outcomes. A skipped, neutral, cancelled or timed-out result is not added to the success count. An unavailable first attempt stays in the total denominator as unknown. A zero-run window says `unknown-no-runs`; a small or empty sample establishes no SLA or future reliability. Per-test flake rates are unknown from these aggregates.

`summarizeReliability` can combine immutable observations of the same repository/workflow/default branch. Identical observations are idempotent and counted as duplicates; snapshots remain timestamped. Pending-to-completed evolution is allowed. Already observed terminal facts cannot silently regress or change, and conflicting terminal run/job/gate observations fail closed. The latest compatible known facts supply the summary; the original snapshots remain present. Distinct retry attempts remain distinct even when the source SHA is identical.

A later jobs-unavailable snapshot with unchanged run state retains earlier observed jobs and gate facts in the trend, including partially completed pending work; the unavailable snapshot remains separate. If the run state changes while its jobs are unavailable, the merge fails rather than inventing a combined outcome or losing known failures. Keep both observations for inspection and collect a new immutable snapshot when history is available again.

## Bounds and missing history

The window must be ordered, end no later than the observation and span at most 90 days. Fixed maximums are 10 pages per collection, 999 listed runs, 10 attempts per run, 200 jobs per attempt, 200 steps per job and 3,000 API requests. Injected callers may lower these bounds. Each page has 100 items; totals and page lengths must reconcile. A filtered GitHub search at or above its 1,000-result ceiling is rejected. Use smaller windows when limits are reached; never report a truncated page as healthy history. See GitHub's [workflow run API](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow) and [attempt-specific jobs API](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt).

Native requests default to 15 seconds and 2 MiB per JSON response, with absolute maxima 30 seconds and 8 MiB. Authentication, rate limits, schema errors, oversized/incomplete bodies and network failures fail collection. Only explicit 404/410 responses for attempt-scoped metadata/jobs become named unavailable history. No other API error is converted to an empty sample.

## Scheduled observations and retention

[The reliability workflow](../.github/workflows/reliability.yml) runs daily, manually and after eligible completed canonical push runs. It checks out trusted default-branch code with persisted credentials disabled and only `contents: read` / `actions: read`. Completion authorization checks the fetched canonical workflow ID/path, same repository, push event and actual default branch. Same-name workflows, PRs, forks and poisoned refs are skipped. The event head is data; triggering code and artifacts are never executed or downloaded. The workflow installs no application dependencies and runs no full test suite.

Each successful collector invocation uploads `proofline-reliability-<collector-run-id>-<collector-attempt>` with a 90-day retention period. The directory and artifact names are unique; the workflow neither pushes an evidence branch nor reruns verification. Collection failures remain failed workflow jobs and are surfaced in the job summary; they cannot change the original verification outcome or authorize a release.

Artifacts expire and repositories can lose API history. For reviewed milestones, a maintainer should copy the exact immutable JSON/Markdown files into a new dated source-controlled evidence directory, record their SHA-256 hashes, collector source commit, command, collection time and actual API provenance, then review/commit through the normal required checks. Never overwrite prior snapshots or append invented elapsed history. Offline fixture snapshots must remain labeled `injected-offline`; only a native transport snapshot is labeled `github-api`. Retain separate operational failure evidence as well as successes.

Source-controlled verbatim JSON payloads may use the .json.txt extension with an explicit native-filename mapping so source formatters cannot rewrite evidence whitespace. Preserve exact bytes and the SHA-256 inventory; the native collector still writes its documented .json files.
