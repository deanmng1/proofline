# A deposit must not earn commission

This is a replay of actual captured runs with a **controlled injected regression in an isolated local clone**. The repository's source was already correct. The demonstrated fix restores its original condition; this capture does not claim a newly discovered production defect or automated AI repair.

The existing manifest-bound test checks FIN-002: deposits and claim payments never create commission. It records a $25 deposit and a $4 claim payment and expects no commission entries. It then settles $1.01 in premium and expects 10 cents in commission. Broadening the premium-payment branch to include deposits makes the unchanged test fail: the native assertion shows an unexpected commission accrual of **250 cents ($2.50)** where it expects an empty array ($0).

The injected condition also routes the deposit through the premium ledger-entry branch. The regression is deliberately one changed condition in the isolated service, with the exact patch retained in [mutation.patch](mutation.patch).

| Captured phase | Selected tests | Passed | Failed | Skipped | Exit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Correct baseline | 1 | 1 | 0 | 23 | 0 |
| Injected regression | 1 | 0 | 1 | 23 | 1 |
| Original condition restored | 1 | 1 | 0 | 23 | 0 |
| Restored full finance test file | 24 | 24 | 0 | 0 | 0 |

Each focused phase uses the **same exact command and test bytes**, through the unchanged guarded Proofline canonical runner. The red run is a business assertion failure at `finance-service.test.ts:249:42`, with exactly one selected test. It is not an import, environment, or runner failure. The restored file suite passes all 24 tests. Static manifest validation also passes with an empty error list.

- Source commit: `90987ce90891babfb7fc2f610ae52ba9f8200f32`.
- Rule and binding: `FIN-002` / `binding-9bb406121555e978c4ee`.
- Test: `Finance service > cash_first_accrues_only_settled_premium`.
- Unchanged test SHA-256: `d8e16e95d4f1fd8ffb17c3d21388f0d5cb220d9a1f901407cd1e439c6e7ba1ff`.
- Runtime: Node `v24.22.1`, Vitest `3.2.7`.

[results.json](results.json) contains commands, exit codes, counts, durations, source/test/runner/manifest hashes, the raw failure assertion message, actual observed commission, and presentation excerpts. Every run's `stdout` and `stderr` values are **file paths relative to this directory**. Its `consoleExcerpt` is literal selected native-output lines, explicitly marked as a noncontiguous excerpt. `presentation` provides compact regression/fixed excerpts and condition snippets for embedding.

The per-phase `.report.json.txt`, `.stdout.txt`, `.stderr.txt`, and `.command.txt` files are raw captured evidence. Native JSON reports use the `.json.txt` suffix to preserve their original bytes through repository formatting. [binding.json](binding.json) freezes the manifest binding and rule metadata. Source and test snapshots are retained as `.ts.txt` files, and [harness-validation.report.json.txt](harness-validation.report.json.txt) retains the static validator result. [evidence-sha256.json](evidence-sha256.json) hashes every retained file in this directory except itself. The evidence is ordinary deterministic test output: no live provider or model is used.

## Reproduce locally

From the repository root, with its existing dependencies installed:

```sh
python3 docs/showcase/bug-demo/reproduce.py \
  --work-dir output/bug-demo/reproduction-2 \
  --evidence-dir output/bug-demo/reproduction-2/evidence
```

Choose a fresh directory for each run. The script refuses to overwrite an existing clone. It requires the pinned input hashes, makes a local clone with no network fetch, checks out the pinned commit, reuses installed external dependencies, and copies pnpm's package-local link graph so workspace dependencies resolve to the clone. It disables Vitest caching. All mutation and restoration happen below `output/bug-demo`; the source checkout's pinned file hashes are verified unchanged after capture.

The source is restored in a `finally` block after the injected run, even when that run fails unexpectedly. Missing reports, a non-green baseline, an ambiguous test selection, an unexpected red failure, changed tests, or failing restored runs stop the capture. The script's successful exit means this demonstration passed; it does not claim the project's full acceptance or CI completion gate.
