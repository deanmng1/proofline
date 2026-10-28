# Vitest coverage baseline design

## Intent

Make the regression harness show exactly which production paths its unit,
contract, and UI tests execute, without replacing the behavior-focused test
strategy with a percentage game. The first release is a visible baseline;
there are no coverage thresholds or merge-blocking percentages yet.

## Goals

- Generate line, function, branch, and statement coverage for the CRM web
  app, domain rules, and Test API contract packages.
- Write stable text, HTML, LCOV, and JSON-summary reports below
  `artifacts/coverage/<project>/`.
- Run coverage in CI as separate evidence after the full Vitest safety gate,
  and upload it with the existing diagnostics.
- Keep the implementation compatible with Node 22+ and the current Vitest
  runner.

## Non-goals

- Do not add Jest; Vitest is already the test runner.
- Do not set global percentage thresholds in this baseline release.
- Do not merge per-project LCOV files into a synthetic global score.
- Do not collect browser E2E coverage in pull-request CI. Playwright's V8
  coverage is Chromium-specific and measures bundled browser code; it can be
  evaluated later as a scheduled diagnostic.

## Chosen approach

Install `@vitest/coverage-v8` at the matching Vitest 3.2 version and give `crm-web`, `domain`, and
`api-contracts` a `coverage` Nx target. Each target runs the same tests as its
normal `test` target with V8 coverage enabled and a project-specific output
directory. Coverage targets are non-cached so an explicit coverage command
always emits fresh reports. The root `pnpm coverage` script runs those targets
serially, making the text report readable while keeping HTML, LCOV, and JSON
summary artifacts separate and attributable.

Coverage explicitly includes every production source file in the three
projects, including files that no test imports, so unimported code is visible
as uncovered. Tests, mock fixtures, type declaration files, and application
bootstrap wiring are excluded. The report answers “what did these tests
execute?”; rules, browser journeys, and the impact selector remain the
authority for risk-based test choice.

## Alternatives considered

1. **Add Jest and Istanbul.** Rejected: it duplicates Vitest configuration,
   creates a second test runner, and gives no benefit for the Node/Chromium
   environment.
2. **One root Vitest command and one merged report.** Deferred: the CRM app
   needs its Vite/jsdom setup while packages deliberately use lean Node test
   invocations. A shared config and report merger add failure modes before a
   baseline tells us whether a global metric is useful.
3. **Playwright V8 coverage in every PR.** Deferred: it is Chromium-only,
   requires browser-to-Istanbul conversion, and can double-count bundles. The
   existing Playwright journeys remain the browser-regression gate.

## CI and visibility

CI retains the existing `pnpm test` full-Vitest safety gate for all five
projects, then runs `pnpm coverage` as a separate evidence step for the three
production-bearing projects. Coverage writes `artifacts/coverage/**`; CI
uploads a separate coverage artifact on every run, including failing runs, and
retains the existing conditional diagnostic bundle. A developer can open each
project's `index.html` locally or consume its LCOV and JSON summary in a later
coverage service.

## Review trail

### Iteration 1 — runner boundaries

Finding: only `crm-web` has a Vite/Vitest configuration; domain and API tests
run directly from the workspace. Resolution: use per-project coverage targets
instead of forcing a premature shared Vitest workspace configuration.

### Iteration 2 — report integrity

Finding: imported-file-only reporting would hide untested production files.
Resolution: configure explicit production-source include globs and exclude
tests, mocks, declarations, and bootstrap files; enable all included files;
retain separate project reports rather than inventing an inaccurate merged
denominator.

### Iteration 3 — enforcement and E2E scope

Finding: an initial threshold would make an arbitrary number a release gate,
and conditional diagnostic upload would hide successful baseline reports.
Resolution: capture and upload a baseline artifact on every CI run; defer
thresholds and optional browser coverage until the reports are reviewed.
Coverage is an explicit reporting operation, not a cacheable test shortcut,
so each target disables Nx caching and declares its report directory as an
output for predictable local and CI behavior.

## Acceptance checks

- `pnpm coverage` exits successfully and produces four report formats for
  each covered project.
- Uncovered, included production files appear in the report.
- `pnpm test` and `pnpm e2e` retain their existing behavior.
- CI retains the full Vitest safety gate, runs coverage as separate evidence,
  and uploads `artifacts/coverage/` with diagnostics.
