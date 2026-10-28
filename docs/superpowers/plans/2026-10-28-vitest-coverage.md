# Vitest Coverage Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inspectable, per-project Vitest V8 coverage reports and CI artifacts without introducing coverage thresholds.

**Architecture:** The three production-bearing projects each own a coverage
Nx target that executes their existing Vitest suite with V8 coverage enabled.
Every target produces separate text, HTML, LCOV, and JSON-summary artifacts in
`artifacts/coverage/<project>`, and the root command runs those targets
serially. CI retains its full Vitest gate, then runs coverage as a separate
evidence step and uploads the coverage artifacts.

**Tech Stack:** Vitest 3.2, `@vitest/coverage-v8`, Nx 24, GitHub Actions,
Biome.

**Spec:** `docs/superpowers/specs/2026-10-28-vitest-coverage-design.md`

## Global Constraints

- Use `@vitest/coverage-v8` with a 3.2-compatible version; do not introduce
  Jest, Istanbul, or a coverage merger.
- Cover only `crm-web`, `domain`, and `api-contracts` in this baseline.
- Include all production files, including unimported files, so untested code
  is visible; exclude tests, mocks, declarations, and bootstrap wiring.
- Write reports only under ignored `artifacts/coverage/`.
- Set each coverage target to `cache: false` and declare its report directory
  as an output so explicit coverage runs are fresh and artifacts are visible.
- Do not add percentage thresholds or change the Playwright gate.
- Append material decisions and verification evidence to
  `test-impact/execution-record.jsonl`.

## Review Focus

- An unimported source file must appear as uncovered; test this by inspecting
  the JSON summary for an included project.
- A test or mock source must not affect the denominator; test the report
  directories and include/exclude globs.
- The coverage command must execute all three production-bearing Vitest
  projects in scope; test the root command and the resulting three report
  directories.
- CI must retain a full five-project unit-test safety gate rather than
  executing only impacted tests; inspect the workflow commands and confirm a
  separate coverage artifact uploads on every run.
- A later threshold change must not be implied by this baseline; assert there
  is no `thresholds` configuration.

---

### Task 1: Add the V8 provider and per-project coverage targets

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/crm-web/vite.config.ts`
- Modify: `apps/crm-web/project.json`
- Modify: `packages/domain/project.json`
- Modify: `packages/api-contracts/project.json`

**Interfaces:**
- Produces: `nx run <project>:coverage` for `crm-web`, `domain`, and
  `api-contracts`.
- Produces: `artifacts/coverage/<project>/{index.html,lcov.info,coverage-summary.json}`.

- [ ] **Step 1: Run the missing coverage target to verify the red state**

Run: `pnpm nx run domain:coverage`

Expected: FAIL because the real coverage target does not exist. This tests the
user-facing interface, not the source text of a configuration file.

- [ ] **Step 3: Add `@vitest/coverage-v8` and coverage configuration**

Add the version-matched provider as a development dependency. Configure the CRM Vite test
block with `coverage.provider = "v8"`, its source include/exclude policy, and
its report directory. Ensure all matching source files are included, even if
they were never imported. Add coverage targets for each project that use V8
and the same report formats, with Node-package include/exclude policies
supplied as CLI configuration. Mark every coverage target non-cached and
declare only its project-specific report directory as an output.

- [ ] **Step 3: Run every coverage target to verify the green state**

Run: `pnpm nx run domain:coverage`, `pnpm nx run api-contracts:coverage`, and
`pnpm nx run crm-web:coverage`.

Expected: every target PASS and writes its HTML, LCOV, and JSON-summary
reports below its project-specific artifacts directory.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml apps/crm-web/vite.config.ts apps/crm-web/project.json packages/domain/project.json packages/api-contracts/project.json
git commit -m "feat: add Vitest coverage targets"
```

### Task 2: Add the unified command, CI evidence, and operator documentation

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/verify.yml`
- Modify: `docs/TESTING.md`
- Modify: `docs/PORTABLE_TEST_AUTOMATION.md`
- Modify: `test-impact/execution-record.jsonl`

**Interfaces:**
- Consumes: the coverage targets from Task 1.
- Produces: `pnpm coverage`, CI coverage artifacts, and documented local
  report locations.

- [ ] **Step 1: Run the missing root command to verify the red state**

Run: `pnpm coverage`

Expected: FAIL because the root coverage command does not exist.

- [ ] **Step 3: Implement the root command, CI step, and docs**

Add a serial `pnpm coverage` root script. Keep the existing CI full-Vitest
command, then add coverage as a separate evidence step with `pipefail` and a
captured output log. Upload coverage reports on every CI result. Document how
to run and inspect the per-project HTML/LCOV/JSON reports, retain the coverage
log in conditional diagnostics, and record the implementation decision.

- [ ] **Step 3: Run the root command to verify the green state**

Run: `pnpm coverage`

Expected: PASS after executing all three coverage targets and producing their
separate reports.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/verify.yml docs/TESTING.md docs/PORTABLE_TEST_AUTOMATION.md test-impact/execution-record.jsonl
git commit -m "ci: publish Vitest coverage baseline"
```

### Task 3: Establish and verify the baseline

**Files:**
- Modify: `test-impact/execution-record.jsonl`

**Interfaces:**
- Consumes: `pnpm coverage` from Task 2.
- Produces: locally inspectable report artifacts and recorded verification.

- [ ] **Step 1: Run the coverage baseline**

Run: `pnpm coverage`

Expected: PASS; each covered project writes HTML, LCOV, and JSON summary
reports below `artifacts/coverage/`.

- [ ] **Step 2: Verify report shape and untested-file inclusion**

Run: a Node assertion that parses each
`artifacts/coverage/<project>/coverage-summary.json`, confirms it has a
non-empty `total`, and confirms a deliberately untested, included CRM source
file is present with zero coverage.

Expected: PASS; coverage is a meaningful baseline rather than imported-file
only output.

- [ ] **Step 3: Run the complete regression gate**

Run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`, and
`pnpm test:impacted -- --dry-run`.

Expected: all commands PASS with zero impact-selection errors.

- [ ] **Step 4: Record results and commit**

Append report locations, command outcomes, and the threshold deferral to the
portable execution record, then commit the verification record.
