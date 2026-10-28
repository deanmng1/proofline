# Event-Driven Services and Regression Contract Design

## Intent

Turn the reference insurance CRM into a realistic, deterministic example of
the intended workflow: business rules enter through a Policy service, policy
state becomes the shared downstream truth, Finance reacts to that state and
finance events, and every important behavior has durable automated evidence.
The future Codex/Cursor adapter must be able to require this evidence without
depending on the agent that authored it.

## Goals

- Give Policy, Policy State, and Finance separate state ownership and public
  service APIs.
- Carry contracts between them as typed, append-only messages through a
  deterministic in-memory service bus.
- Make the Test API and the CRM UI use that runtime, so service-boundary tests
  cover the same workflow as Playwright.
- Prove publication, consumption, per-consumer idempotency, policy-state
  projection, Finance reaction, and the visible customer-to-policy journey.
- Make rule ownership machine-readable and reject a rule with no executable
  test reference.
- Fail CI on a flaky Playwright result and establish focused coverage gates
  without inventing a global percentage target.

## Non-goals

- A production message broker, persistence database, retry scheduler, or
  provider integration.
- Legal/accounting rules beyond the explicitly recorded demonstration rules.
- Replacing the full Vitest and Chromium safety gates with impact selection.

## Chosen approach

The reference uses an **in-process typed service bus** rather than direct
cross-service calls or a real broker. It preserves the behavior the harness
must detect—published envelopes, independent consumer delivery, duplicate
delivery, and deterministic ordering—without credentials, timing races, or
external cost. A real transport can later implement the same message
contracts; it is not part of this testbed.

The runtime owns four independently testable units:

```text
Policy command
  -> Policy service emits policy.lifecycle.changed (bound, revision 1)
  -> Policy State service stores policy state and emits policy.state.changed
  -> Finance service creates its policy ledger from that state

Finance command
  -> Finance service emits and consumes finance.*
  -> Finance ledger / commission projection updates
```

The bus drains synchronously inside a command in this reference runtime. Each
subscriber records processed message IDs, so re-publishing an already
delivered message never repeats its local effect. Handler errors surface to
the caller; they are not swallowed or retried invisibly.

## Contracts and ownership

| Owner | Commands | Published messages | Owned state |
| --- | --- | --- | --- |
| Policy service | create quote, bind quote | `policy.quote.created`, `policy.lifecycle.changed` | quotes, immutable policies |
| Policy State service | consumes policy messages | `policy.state.changed` | state timeline and current policy state |
| Finance service | record finance event, pay commission | `finance.*` | ledger, commissions, refund totals |
| Service bus | publish, subscribe, drain | immutable envelopes | delivery log and per-consumer idempotency only |

### Concrete boundary and identity contract

Every package owns a private in-memory store. Services may import only
`@testbed/domain` value/message contracts and `@testbed/service-bus`; no
service package may import another service's store or implementation. The
composed runtime is the only cross-service façade, and the Test API calls only
that façade. Finance has no path to Policy's store: it initializes a local,
approved policy snapshot only after consuming `policy.state.changed`.

Commands and messages have different identities:

- `commandId` makes a client command idempotent. Repeating the same command
  with the same payload returns its original result and publishes nothing;
  repeating an ID with different input fails.
- `messageId` identifies one immutable bus envelope and is the delivery
  de-duplication key.
- `correlationId` follows one business workflow (for example quote to policy
  to finance); `causationId` points to the immediate source message, if any.
- Every command and envelope also has `schemaVersion`, `tenantId`,
  `eventType`, and ISO-UTC `occurredAt`.

The runtime injects deterministic clock and ID factories. Test fixtures use
the default `tenant-test` tenant. The API/runtime adapter owns the
customer/property reference-data port and refuses a customer/property pair
outside the requested tenant before it invokes Policy.

Every mutating Policy or Finance HTTP input carries a required `commandId`;
the CRM generates it once per submit and preserves it for a transport retry.
The existing `X-Tenant-Id` request header is the reference API's tenant
transport contract: a missing or unknown value is rejected before a command
is created. In a production adapter, authenticated identity authorizes that
same resolved tenant; a header alone never grants a tenant. `TestApiOptions`
supplies seeded tenant data but does not bypass request-level validation. The
adapter attaches the resolved tenant to customer/property records and every
service command. Service queries and stores use `(tenantId, policyId)`, never
a bare policy ID.

### Deterministic delivery contract

The in-memory bus uses one FIFO event queue and stable subscriber-registration
order. A message published by a handler goes to the queue tail. Delivery is
identified by `(consumerId, messageId)` and is marked complete only after the
consumer's state update returns successfully. A failure is written to the
delivery log, stops the drain at that event, leaves the message pending, and
is replayable on the next `drain()`. Earlier successful consumers are skipped
on replay; later consumers have not run. This prevents a hidden partial
failure from appearing green while still allowing deterministic recovery.

Every Finance action uses the source `messageId` as its immutable ledger
identity. Commission reversals remain linked to the accruals they offset;
deposits never become commissionable revenue.

### Policy State contract

Policy publishes versioned `policy.lifecycle.changed` messages. The initial
state machine is deliberately small: `none -> bound` at revision 1 and
`bound -> cancelled` at revision 2. A lifecycle command cannot skip a
revision, repeat an invalid predecessor, or mutate a terminal `cancelled`
policy. Policy State projects the message into `{ tenantId, policyId,
lifecycle, revision, product, premiumCents, commissionPlan,
sourcePolicyMessageId }`, then publishes `policy.state.changed` carrying that
complete snapshot. A repeat message is idempotent; an older revision is
ignored; a conflicting same revision or a skipped revision fails. Finance
reacts only to the `bound` state in this increment and retains the event
payload as its own approved policy snapshot.

### Refund allocation contract

A refund is not a cumulative policy amount. It is an immutable Finance command
with one or more `{ allocationId, financeEntryId, amountCents }` allocations;
`allocationId` is unique within the command. Finance accepts only positive
allocations against refundable deposit or settled-premium source entries,
rejects a source from another policy/tenant and any amount above the
unrefunded balance, and records one entry with ID
`finance:<messageId>:<allocationId>` and its source message/entry IDs. In this
reference policy, only allocations against settled premium can reverse
cash-first commission; a deposit allocation never can. Mixed deposits and
premium payments are therefore testable without guessing the source of a
refund. Written-commission reversal beyond the recorded demonstration rule is
deliberately not invented here.

## Regression contract

`test-impact/rules.json` becomes the authoritative registry. Each record has
an ID, concise business expectation, criticality, source ownership paths, and
exact evidence references: a Vitest file plus test name, and (when a browser
journey is relevant) a Playwright spec, title, and tag. Critical rules require
at least one deterministic unit or runtime-integration reference; Playwright
is supplemental. The validator fails closed if an ID is duplicate, a
referenced test/tag is undiscovered, a required layer is absent, or a critical
rule lacks deterministic evidence.

Playwright discovery stores individual test identities rather than aggregating
tags at spec-file level. Discovery/parser failure writes the impact artifact,
selects all tests, and fails CI. `rules.json` itself is a configuration change
that selects all tests. `rules.md` is a generated checked-in view; the record
validator verifies it is current.

Impact selection uses the rule registry alongside import closure and feature
ownership. A change to a rule-owned path selects all of that rule's exact
tests; unknown runtime/configuration/discovery conditions still select all
tests. Vitest discovery uses `vitest list --json --includeTaskLocation` and
executes its discovered file with an anchored full-title pattern. Playwright
uses discovered spec locations and runs the selected `file:line` tests. The
fast selected run must prove no unrelated test executes; the later full safety
gates intentionally run everything.

## Coverage and CI policy

Coverage stays split by project and is collected even after ordinary test
assertion failure. `test-impact/coverage-baseline.json` records reviewed
line/branch/function/statement baselines per critical source file: service
bus, Policy, Policy State, Finance, composed runtime, Test API, and impact
validator. `coverage:check` reads those coverage summaries and rejects a
lower metric for any listed file. A future change may raise coverage but
cannot lower the scoped baseline without an explicit reviewed decision. No
global coverage percentage is introduced: large unexercised template code
must not hide a regression in Finance or the service bus.

Playwright uses CI retries for diagnostics, but `failOnFlakyTests` is enabled
in CI: a pass after retry is visible evidence of instability, not a green
release.

## Test matrix

| Behavior | Primary proof | Secondary proof |
| --- | --- | --- |
| Policy bind emits the correct message once | Policy/service-bus Vitest | Contract Test API test |
| Policy State projects bind and publishes usable state | Policy State Vitest | Finance consumer test |
| Finance initializes only from Policy State and ignores duplicate delivery | Runtime integration Vitest | API test |
| Cash-first/written commissions and refunds | Finance rule Vitest | Ledger Playwright journey |
| A customer can create, bind, and finance a policy | Playwright | Contract tests |
| Missing/stale rule-to-test evidence | Impact validator Vitest | CI `test:impacted` gate |
| Flaky browser execution | Playwright configuration test/CI setting | HTML/trace artifacts |

## Constraints and decisions

- All money remains integer cents and all rule clocks use explicit UTC ISO
  timestamps.
- All external providers remain replaced by deterministic adapters.
- UI Vitest creates and resets a new runtime for each test; routed Playwright
  fixtures create one runtime per browser context; the ordinary MSW worker
  creates one runtime per browser-worker session. None shares mutable state
  with another process/session.
- The ordinary local app startup continues to install the same deterministic
  Test API handlers when no real API URL is configured.
- The existing append-only execution record logs the design, reviews, changes,
  and verification commands. `record:check` validates every JSONL line
  against the schema and rejects duplicate record IDs.
- This is the agent's design choice: services are library packages inside one
  repository, not network processes. That preserves portability and makes
  the transport replaceable later.

## Fixed package layout

```text
packages/domain                 shared entities, money, commission helpers, service message contracts
packages/service-bus            deterministic envelope delivery and delivery log
packages/policy-service         quote/policy store and commands
packages/policy-state-service   policy-state projection and consumer
packages/finance-service        ledger/commission store, finance commands and consumer
packages/insurance-runtime      service composition, seeded deterministic runtime façade
packages/api-contracts          HTTP adapter only
```

The initial coverage numeric values are intentionally left to the post-change
measurement, not guessed in advance. The list of gated files and every metric
are fixed in the checked-in baseline created by the implementation.

## Migration rule

`applyEvent` and `DomainState` are transitional code, not a second production
rule engine. Their behavior must be recreated as service-level tests before
the Test API migration is complete. Task completion removes the reducer, its
tests, and its exported types. There is no legacy event adapter in the runtime:
all fixtures are migrated in one change to versioned typed runtime commands
with command/message identities. This prevents a passing legacy test suite
from being mistaken for proof that the service workflow works.
