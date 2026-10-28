# Portable hybrid workflow-harness design

## Intent

Proofline is a portable regression harness, not an insurance-CRM product to be
copied into another repository. An agent adapting it must discover the target
application's routes, roles, API seams, business rules, and test-data controls;
then it must author deterministic tests that can run repeatedly in CI without
an agent or model.

The reusable architecture combines fast rule/contract/UI tests with a small,
intentional set of browser workflows that navigate the visible application.
State-machine generation is deliberately parked as an optional extension for a
target application whose lifecycle complexity justifies it.

## Goals

- Prove a complete, user-visible workflow through real navigation: protected
  deep link, authentication, sidebar/mobile navigation, cross-screen state,
  policy/transaction completion, and post-action guard behavior.
- Keep business-rule permutations, event delivery, retries, and idempotency in
  fast deterministic service, runtime, contract, and UI tests.
- Let an adapted project run selected tests as a diagnostic pass, then retain
  complete CI gates as the correctness authority.
- Make test selection, coverage, and evidence fail closed rather than silently
  shrink or weaken when repository metadata is incomplete or changed.
- Preserve a small Node/shell/JSON core that Codex, Cursor, and CI can use
  without an IDE-specific dependency.

## Non-goals

- Do not port the CRM pages, policy fixtures, business rules, or their tests to
  a target project.
- Do not call an LLM or agent from test execution.
- Do not generate every possible browser state permutation.
- Do not require state-machine tooling for projects without complex workflows.
- Do not contact production providers or require provider credentials.

## Delivery decisions

The first delivery strengthens the CRM reference implementation and turns its
portable pieces into documented, repository-native configuration, scripts, and
adapter contracts. It is not an npm package, hosted service, or Codex/Cursor
plugin in this increment. Those distribution formats remain future consumers
of the same Node/shell/JSON core, so no future adapter must reverse-engineer
browser, rule, selection, or evidence behavior from the CRM.

For this direct-to-main project, critical coverage baselines may only rise in
ordinary changes. CI rejects all reductions. A future human-approved exception
or record-history migration must use a separately designed migration command
and explicit governance artifact; it is out of scope for the first delivery.

Each Playwright test receives one fresh Test API/runtime. A tenant-switch test
may use multiple pages or contexts against that same runtime only inside its
own test; no runtime, mutable fixture, tenant state, or browser storage is
shared across tests, workers, shards, or CI runs.

Test-only adapters are a production-negative capability, not a runtime flag a
client can turn on. The target exposes a separately built or test-entrypoint
application that accepts a randomly generated startup capability from the
test launcher, listens on loopback only, and refuses to start without it. Test
API, fake-auth, seeded-identity, and provider-fake modules are excluded from
the production entrypoint. CI builds the production artifact and checks its
route/import manifest for those modules and test markers; a production build
containing any of them is a hard failure.

Chromium remains the mandatory complete browser matrix. Firefox and WebKit run
the protected-route/login/sidebar/CRM smoke journey when explicitly enabled by
the target project's browser matrix. The reference implementation will expose
that smoke suite and CI switch, but will not claim all browser support until a
target enables and provisions it.

## Approaches considered

### Browser golden journey only

One full Playwright flow is quick to create and easy to understand, but it
would leave business-rule permutations in slow browser tests and make coverage
shallow as the target application grows.

### State-machine-generated journeys

This systematically explores lifecycle transitions, but requires a correct,
maintained model for each target application. It is a valuable extension for
claims, approvals, orders, subscriptions, or policy lifecycles, but is not a
portable default.

### Hybrid test layers — selected

Keep deterministic service/runtime/contract/UI tests as the owners of rules
and edge cases. Add a limited browser matrix that proves the routes, controls,
navigation, state transfer, and visible recovery users rely upon. This keeps
CI fast and failures diagnosable while still proving real end-to-end behavior.

## Architecture

```text
Business rule / event / idempotency
  -> domain + service/runtime Vitest
HTTP shape / tenant or role boundary
  -> contract Vitest
User-visible validation and recovery controls
  -> UI Vitest
Authentication + navigation + cross-screen workflow
  -> Playwright golden journeys
Changed code + ownership registry
  -> diagnostic impacted selection
Every CI change
  -> full unit/browser/coverage/record safety gates
```

### Portable harness manifest and validator

Each adapted repository provides a versioned `proofline.harness.json`. A Node
validator is a required CI command and rejects unknown schema versions, missing
fields, invalid repository-relative paths, duplicate ownership, and commands
that cannot be executed from the repository root. Its minimum schema is:

```json
{
  "version": 1,
  "commands": {
    "lint": { "argv": ["pnpm", "lint"], "cwd": "." },
    "typecheck": { "argv": ["pnpm", "typecheck"], "cwd": "." },
    "unit": { "argv": ["pnpm", "test"], "cwd": "." },
    "browser": { "argv": ["pnpm", "test:e2e"], "cwd": "." },
    "coverage": { "argv": ["pnpm", "coverage"], "cwd": "." },
    "coverageCheck": { "argv": ["pnpm", "coverage:check"], "cwd": "." }
  },
  "workspaces": [{ "path": "...", "unitCommand": "unit", "browserCommands": ["browser"] }],
  "browser": {
    "projects": ["chromium"],
    "crossBrowserSmokeProjects": [],
    "localOrigins": ["http://127.0.0.1"],
    "testEntrypoint": "..."
  },
  "adapters": {
    "testModeEnvironment": "...",
    "auth": "...",
    "api": "...",
    "providers": ["..."]
  },
  "coverage": [{ "workspace": "...", "provider": "...", "providerVersion": "...", "sourceGlobs": ["..."], "exclusions": [{ "glob": "...", "reason": "..." }], "report": "...", "metrics": ["lines", "functions", "branches", "statements"], "aggregation": "..." }],
  "ownership": [{ "glob": "...", "entrypoints": ["..."], "ruleIds": ["..."], "layers": ["..."], "testBindings": [{ "ruleId": "...", "layer": "...", "testId": "...", "commandKey": "unit" }] }]
}
```

Commands are canonical, structured argv values rather than aliases inferred
from a bounded file walk. Manifest validation never executes them: it verifies
schema, allowed repository-relative working directory, executable/package
script existence, and workspace membership. CI executes the commands only as
the declared canonical gates. A workspace may opt out of browser tests only by
declaring an empty browser command list and a non-empty
`browserOptOutReason`. Ownership rows must name every runtime glob, its public
entrypoints, at least one rule ID, the test layers that prove it, and concrete
test bindings. Each binding names a stable test identity, test path/title or
tag selector, and its command key; the validator discovers and verifies that
identity. Additions, renames, deletions, missing/ambiguous bindings, and
unresolved dynamic imports without a valid owner trigger a full gate.

The browser adapter contract is lifecycle-based: `createScenario(options)`
creates isolated state; `install(context, scenario)` installs auth/API/provider
routes before navigation; `reset()` is called after the test; and
`assertNoUnexpectedRequests()` runs during cleanup. Installation is
BrowserContext-scoped, so it covers every page a test opens. Its options
include unauthenticated/authenticated session state, role, tenant membership,
seed, fault plan, and permitted origins. Only the adapter may manipulate
browser storage or transport routes.

### 1. Composed browser application adapter

Replace the split browser setups with one reusable Playwright fixture that can
compose:

- an unauthenticated starting state, deterministic login/session/refresh
  endpoints, and protected-route redirect behavior;
- a target application's deterministic API adapter (the CRM Test API in this
  reference implementation);
- tenant/workspace membership and role variants; and
- one-shot transport or API fault plans for only the route under test.

The fixture starts one declared local test-entrypoint application server per
Playwright worker on an OS-allocated loopback port. Each test owns a fresh
BrowserContext and scenario with an opaque ID; multiple pages or contexts may
share that scenario only when the test requests it explicitly. The server has
no mutable scenario state. The context adapter owns the scenario runtime and,
where required by the target, propagates that ID on first-party test requests.
It installs and tears down with `try`/`finally`, including after a failed
assertion; worker servers also shut down deterministically after their worker.

The fixture permits static assets and manifest-declared first-party local
origins only; it routes declared providers to deterministic fakes and fails
every other outbound request with method, URL, scenario, and trace context.
That denial is enforced on every relevant plane: BrowserContext request routing
for pages/workers, an explicit service-worker block/cleanup policy,
WebSocket interception or a declared fail-closed unsupported-platform error,
and a server/runtime egress guard installed before application startup. The
runtime guard denies direct `fetch`, HTTP(S), and configured SDK clients unless
they use a declared fake/loopback route. The harness has self-tests that issue
undeclared requests from each enabled plane and assert deterministic denial;
targets with another egress plane must add a guard and self-test before it can
be enabled. A runner-level guard also denies test-side `fetch`, HTTP(S),
WebSocket, and spawned child-process egress, propagating its deny policy to
children; the self-test includes every enabled runner plane. It exposes
data-oriented options such as `role`, `tenant`, `seed`, `startAuthenticated`,
and `faults`; tests must not reach into private browser storage except inside
the fixture.

### 2. Golden browser workflow matrix

Create small, independently readable journeys. The reference CRM matrix is:

1. Protected CRM deep link -> sign in -> intended route -> sidebar Customer
   intake -> sidebar Quotes and policies -> create customer/property/quote ->
   bind -> policy detail -> finance event -> logout -> protected-route guard.
2. A recoverable bind outcome -> disabled competing actions -> status check or
   retry -> exactly one policy, projection, and ledger result.
3. Role-denied CRM navigation and direct route access; no protected API command
   is issued by a disallowed role.
4. Workspace/tenant isolation in one of two manifest-declared modes: a real
   user-visible tenant switch, or two independently authenticated contexts
   with contract assertions that each tenant cannot read or mutate the other's
   resources. The adapter may establish identities but cannot perform the
   switch under test; customer, quote, policy, ledger, and retry state never
   cross tenants.
5. Cancellation/refund/commission correction only after the UI either exposes
   those operations or they are explicitly documented as outside the reference
   workflow.

The first journey uses actual sidebar navigation rather than `page.goto()` for
transitions that a user can perform. Separate direct-route tests retain deep
link and route-guard coverage. Every workflow row declares (a) adapter-only
setup, (b) user-performed UI actions, (c) expected URL transitions, (d)
accessible visible assertions at each screen, and (e) a persisted invariant
queried only after the final visible outcome. Adapter calls may create fixtures
or inspect invariants, but may not perform an in-scope user operation.

Chromium runs the entire matrix. Every enabled Firefox/WebKit project runs the
same invariant smoke: unauthenticated protected deep link, form login,
restoration to the intended route, real sidebar/mobile navigation to one
protected workflow screen, one visible mutation, logout, and denied revisit.

### 3. Rule and state ownership

Every discovered business rule receives a stable rule ID, deterministic
evidence, and an explicit owner:

- domain: pure value/arithmetic helpers;
- service/runtime: command identity, delivery, persistence/restart semantics,
  business transition rules, and event projections;
- contract: request/response shape, authority, tenant and role boundaries;
- UI: validation and recovery affordances; and
- Playwright: the smallest set of true multi-screen workflows.

For a target with a lifecycle, the harness requires a lightweight executable
`lifecycle-matrix.json` with a versioned schema. Rows contain `state`,
`operation`, `role`, `tenantScope`, `expectedResult`, `nextState`, `ruleIds`,
and `testLayer`; `expectedResult` is one of `accepted`, `rejected`, or `no-op`,
and a rejected/no-op row uses `nextState: null` or the unchanged state by the
schema's explicit convention. Stateless projects declare `lifecycleMatrix:
null` in the manifest. If the matrix exceeds the team's maintainable
hand-authored cases, the optional state-model extension generates service-level
transition tests from it; it does not generate the default browser suite.

### 4. Durable recovery seam

The reference in-memory runtime remains the fast default. Add a persistence
test adapter that can snapshot and restore command receipts, event envelopes,
consumer receipts, projections, and generated IDs at named crash points.

The adapter must prove these cases without a production database:

- command accepted before event delivery;
- failure before and after one consumer records its receipt;
- process recreation followed by same-command replay; and
- no duplicate policy, finance entry, or consumer projection after recovery.

Intake mutations must use the same command-identity/retry contract as quote,
bind, and finance mutations. Policy read models must expose lifecycle truth,
rather than presenting a cancelled policy as bound.

### 5. Fail-closed impact, coverage, and evidence governance

- A selected run is only a diagnostic acceleration. Full registered unit and
  browser gates remain mandatory CI authority.
- Configuration, incomplete ownership, unresolved dynamic dependencies, an
  invalid supplied Git base/head, or a runtime change without reviewed feature
  ownership must select canonical full commands, not a bounded discovered list.
- Static imports add selection evidence but cannot alone establish that a
  cross-layer runtime change is fully covered.
- CI compares a proposed coverage baseline to the merge-base version and
  rejects every reduction in the first delivery. A coverage entry declares the
  provider/version, instrumented source groups, approved exclusions, report
  format, aggregation rule, and thresholds. Reports and all four metrics use
  normalized repository-relative paths; missing reports, metrics, baseline
  files, new unclassified source groups, or incompatible measurement entries
  fail the check. Browser journeys are behavioral evidence, not quantitative
  coverage, unless a compatible browser-instrumentation entry is explicitly
  declared.
- CI verifies that the execution record is the exact base-file prefix plus new
  appended JSONL records, including a single trailing newline and no rewritten
  bytes. History rewrites are rejected; a future migration command is a
  separate design.
- Workspace test/e2e discovery comes from the workspace project graph or the
  canonical test commands, so a newly added app cannot be skipped by an
  "all-tests" fallback.

The impact selector emits a machine-readable changed-file -> ownership row ->
rule -> test-binding rationale. Targeted Vitest and Playwright runners execute
the declared test path and canonical title/tag identity, rather than merely a
whole project or spec containing it. Missing, deleted, or ambiguous bindings
and paths without an exact mapping select the canonical full commands.

CI must fetch full history and resolve the supplied base/head to a verified
merge base before selection, coverage comparison, or record-prefix comparison.
An absent, shallow, unresolvable, or conflicting revision makes the diagnostic
selection fail closed and invokes canonical full commands; CI retains the
reason, selection manifest, coverage reports, browser report, trace,
screenshot/video, and unit output under immutable run artifacts.

## Target-project adaptation protocol

1. Inventory project workspaces, routes, auth/role boundaries, APIs, test
   framework, browser configuration, and existing tests.
2. Identify business rules, stateful workflows, side effects, external
   providers, and deterministic seams. Declare provider adapters before test
   authoring.
3. Write the validated manifest, per-project rule registry, ownership map, and
   lifecycle matrix when applicable before implementation. New or uncertain
   executable ownership fails closed.
4. Install/adapt the reusable browser fixture and write the target's golden
   workflow matrix from user-visible acceptance examples.
5. Add deterministic service/contract/UI tests at the narrowest valid layer;
   use Playwright only for cross-screen or browser-specific claims.
6. Record design, review, failed/red tests, repairs, selection results, and
   final verification in the portable JSONL evidence trail.

## Acceptance criteria

- The flagship reference journey begins unauthenticated, follows a protected
  deep link through login, navigates CRM screens through actual UI controls,
  and proves persisted workflow state through the policy/finance screen.
- Browser fixture variants prove a role denial, the manifest-declared
  tenant-isolation mode in one shared scenario/runtime (including cross-tenant
  read and mutation denial), and a recoverable command outcome without live
  network access.
- The test entrypoint is loopback-only and capability-gated; production-build
  checks prove fake auth, Test API, seeded identities, and provider fakes are
  absent from production artifacts.
- Deny-by-default network self-tests cover every enabled browser and runtime
  egress plane, and per-worker server/per-scenario context isolation remains
  reliable under parallel and sharded execution.
- Each golden-workflow row records its setup seam, user actions, URL transitions,
  accessible screen assertions, persisted invariant, and rule IDs; no adapter
  performs an in-scope user action.
- Customer/property intake has command identity and accepted-but-response-lost
  regression coverage.
- Restart/replay tests prove durable receipts and delivery behavior through a
  persistence adapter.
- Policy lists/details expose lifecycle-consistent state, and every supported
  user operation is either browser-verifiable or explicitly excluded.
- Coverage baseline lowering, execution-record rewrites, invalid supplied Git
  revisions, missing merge-base data, undeclared outbound requests, and unowned
  new workspace projects fail CI safely.
- Impact fallback runs canonical full registered test commands and records why
  it broadened selection.
- Ownership-to-test bindings, source-group coverage configuration, and
  lifecycle/result schemas are validated before selection or coverage
  comparison can claim a targeted or comparable result.
- Lint, typecheck, targeted regressions, impact tests, full unit/browser
  suites, coverage ratchets, execution-record validation, and manifest
  validation pass before merge; failure artifacts include selection rationale,
  reports, and browser diagnostics.

## Design review record

This design followed the project's three-round maximum before implementation.

1. Builder feasibility check exposed unspecified delivery form, governance,
   isolation, and browser-support choices. The delivery decisions now make the
   first increment a repository-native portable core plus CRM reference, reject
   normal baseline reductions, isolate a runtime per test, and require Chromium
   with opt-in cross-browser smoke.
2. Independent review found missing executable manifest/configuration,
   user-action separation in golden journeys, total request denial, test
   selection semantics, merge-base handling, cross-browser scope, lifecycle
   shape, and artifact requirements. The manifest, workflow contract, and
   fail-closed CI requirements now make each of those machine-checkable.
3. Independent review then found test-only production leakage, incomplete
   egress coverage, parallel lifecycle ambiguity, unbound targeted tests,
   incompatible coverage comparisons, tenant-proof ambiguity, and unsafe
   command validation. The final revision adds production-negative build
   checks, browser/runtime/runner egress guards, per-worker server plus
   per-scenario context isolation, validated test bindings, normalized coverage
   entries, declared tenant modes, and static command validation.

The final review reported no critical issue. Its two refinements—test-runner
egress denial and acceptance wording consistent with either tenant-isolation
mode—are incorporated above. No implementation has begun; this document is
ready for user approval.

## Builder discretion

The implementation plan may choose the smallest internal types and helper
names that preserve these contracts. It may stage the work in independently
verifiable increments, provided no increment weakens existing full CI gates or
introduces an agent/model dependency into test execution.
