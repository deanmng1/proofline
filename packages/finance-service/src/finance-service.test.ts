import type { EventEnvelope, PolicyStateChangedMessage } from "@testbed/domain";
import { createInMemoryServiceBus } from "@testbed/service-bus";
import { describe, expect, test } from "vitest";
import {
  createFinanceService,
  type FinancePersistencePort,
  type FinanceServiceCheckpoint,
} from "./finance-service";

const at = "2026-01-01T00:00:00.000Z";
const base = { tenantId: "tenant-1", policyId: "policy-1", correlationId: "workflow-1" };
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected fixture value.");
  return value;
}
function setup(timing: "on_bind" | "as_earned" = "as_earned", holdPeriodDays = 0) {
  const bus = createInMemoryServiceBus();
  let time = at;
  let persistence!: FinancePersistencePort;
  const finance = createFinanceService({
    bus,
    now: () => time,
    registerPersistence: (port) => {
      persistence = port;
    },
  });
  const state = {
    messageId: "state-1",
    correlationId: "bind-1",
    tenantId: base.tenantId,
    schemaVersion: 1,
    occurredAt: at,
    event: {
      type: "policy.state.changed",
      state: {
        policyId: base.policyId,
        lifecycle: "bound",
        revision: 1,
        product: "risk_secure",
        premiumCents: 10_000,
        sourcePolicyMessageId: "bound-1",
        commissionPlan: {
          timing,
          rateBasisPoints: 1_000,
          holdPeriodDays,
          reverseOnRefund: true as boolean,
        },
      },
    },
  } satisfies EventEnvelope<PolicyStateChangedMessage>;
  const initialize = () => {
    bus.publish(state);
    bus.drain();
  };
  const ledger = () => required(finance.getLedger(base.tenantId, base.policyId));
  return {
    bus,
    finance,
    persistence,
    state,
    initialize,
    ledger,
    setTime: (value: string) => {
      time = value;
    },
  };
}

describe("Finance service", () => {
  test("hydrates_a_detached_complete_finance_checkpoint", () => {
    const source = setup("on_bind");
    source.initialize();
    source.finance.recordDeposit({ ...base, commandId: "deposit", amountCents: 100 });
    source.bus.drain();
    const checkpoint = JSON.parse(JSON.stringify(source.persistence.checkpoint()));
    const restored = setup("on_bind");
    restored.persistence.hydrate(checkpoint);
    checkpoint.ledgers[0].value.policyState.premiumCents = 1;
    expect(restored.ledger()).toMatchObject({
      policyState: { premiumCents: 10_000 },
      financeEntries: [expect.objectContaining({ amountCents: 100 })],
      commissionEntries: [expect.objectContaining({ kind: "accrual" })],
    });
    expect(
      restored.finance.recordDeposit({ ...base, commandId: "deposit", amountCents: 100 }),
    ).toEqual(expect.objectContaining({ event: expect.objectContaining({ amountCents: 100 }) }));
  });

  test("rejects_forged_checkpoint_receipts_and_cross_tenant_ledger_history", () => {
    const source = setup("on_bind");
    source.initialize();
    source.finance.recordDeposit({ ...base, commandId: "deposit", amountCents: 100 });
    source.bus.drain();
    const checkpoint = source.persistence.checkpoint();

    const fingerprint = structuredClone(checkpoint);
    fingerprint.commandReceipts[0].value.fingerprint = "{}";
    expect(() => setup().persistence.hydrate(fingerprint)).toThrow(/fingerprint/i);

    const applied = structuredClone(checkpoint);
    applied.commandReceipts[0].value.applied = false;
    expect(() => setup().persistence.hydrate(applied)).toThrow(/applied|receipt/i);

    const foreignAudit = structuredClone(checkpoint);
    foreignAudit.ledgers[0].value.auditEntries[0].tenantId = "other-tenant";
    expect(() => setup().persistence.hydrate(foreignAudit)).toThrow(/tenant|ledger/i);

    const malformedEntry = structuredClone(checkpoint);
    malformedEntry.ledgers[0].value.financeEntries[0].amountCents = Number.NaN;
    expect(() => setup().persistence.hydrate(malformedEntry)).toThrow(/entry|amount/i);

    const malformedLedgerKey = structuredClone(checkpoint);
    malformedLedgerKey.ledgers[0].key = "not-json";
    expect(() => setup().persistence.hydrate(malformedLedgerKey)).toThrow(/ledger key/i);

    const malformedReceiptKey = structuredClone(checkpoint);
    malformedReceiptKey.commandReceipts[0].key = "not-json";
    expect(() => setup().persistence.hydrate(malformedReceiptKey)).toThrow(/receipt key/i);

    const duplicateReceipt = structuredClone(checkpoint);
    duplicateReceipt.commandReceipts.push(structuredClone(duplicateReceipt.commandReceipts[0]));
    expect(() => setup().persistence.hydrate(duplicateReceipt)).toThrow(/Duplicate.*receipt/i);

    const missingReceiptLedger = structuredClone(checkpoint);
    const missingEnvelope = missingReceiptLedger.commandReceipts[0].value.envelope;
    Reflect.set(missingEnvelope.event, "policyId", "missing-policy");
    missingReceiptLedger.commandReceipts[0].value.fingerprint = JSON.stringify({
      event: missingEnvelope.event,
      correlationId: missingEnvelope.correlationId,
    });
    expect(() => setup().persistence.hydrate(missingReceiptLedger)).toThrow(/missing ledger/i);

    const invalidCommissionDate = structuredClone(checkpoint);
    invalidCommissionDate.ledgers[0].value.commissionEntries[0].earnedAt = "invalid";
    expect(() => setup().persistence.hydrate(invalidCommissionDate)).toThrow(/commission/i);

    const invalidCommissionShape = structuredClone(checkpoint);
    const commission = invalidCommissionShape.ledgers[0].value.commissionEntries[0];
    commission.id = "";
    commission.amountCents = 0;
    expect(() => setup().persistence.hydrate(invalidCommissionShape)).toThrow(/commission/i);

    const rejectLedger = (mutate: (value: FinanceServiceCheckpoint) => void) => {
      const value = structuredClone(checkpoint);
      mutate(value);
      expect(() => setup().persistence.hydrate(value)).toThrow(/Finance checkpoint|ISO-UTC/i);
    };
    rejectLedger((value) => Reflect.set(value.ledgers[0].value.policyState, "lifecycle", "bogus"));
    rejectLedger((value) => Reflect.set(value.ledgers[0].value.policyState, "revision", 0));
    rejectLedger((value) => Reflect.set(value.ledgers[0].value.policyState, "product", "bogus"));
    rejectLedger((value) => Reflect.set(value.ledgers[0].value.policyState, "premiumCents", 0));
    rejectLedger((value) =>
      Reflect.set(value.ledgers[0].value.policyState, "sourcePolicyMessageId", ""),
    );
    rejectLedger((value) =>
      Reflect.set(value.ledgers[0].value.financeEntries[0], "tenantId", "other"),
    );
    rejectLedger((value) =>
      Reflect.set(value.ledgers[0].value.financeEntries[0], "policyId", "other"),
    );
    rejectLedger((value) => Reflect.set(value.ledgers[0].value.financeEntries[0], "id", ""));
    rejectLedger((value) =>
      Reflect.set(value.ledgers[0].value.financeEntries[0], "sourceEventId", ""),
    );
    rejectLedger((value) => Reflect.set(value.ledgers[0].value.financeEntries[0], "kind", "bogus"));
    rejectLedger((value) =>
      Reflect.set(value.ledgers[0].value.financeEntries[0], "amountCents", 0),
    );
    rejectLedger((value) =>
      Reflect.set(value.ledgers[0].value.financeEntries[0], "amountCents", -1),
    );
    rejectLedger((value) => {
      Reflect.set(value.ledgers[0].value.financeEntries[0], "kind", "refund");
      Reflect.set(value.ledgers[0].value.financeEntries[0], "amountCents", 1);
    });
    rejectLedger((value) =>
      Reflect.set(value.ledgers[0].value.financeEntries[0], "occurredAt", "invalid"),
    );
    rejectLedger((value) => {
      value.ledgers[0].value.financeEntries.push(
        structuredClone(value.ledgers[0].value.financeEntries[0]),
      );
    });
    rejectLedger((value) =>
      Reflect.set(value.ledgers[0].value.commissionEntries[0], "sourceEventId", ""),
    );
    rejectLedger((value) =>
      Reflect.set(value.ledgers[0].value.commissionEntries[0], "kind", "bogus"),
    );
    rejectLedger((value) =>
      Reflect.set(value.ledgers[0].value.commissionEntries[0], "status", "bogus"),
    );
    rejectLedger((value) => {
      value.ledgers[0].value.commissionEntries.push(
        structuredClone(value.ledgers[0].value.commissionEntries[0]),
      );
    });
    rejectLedger((value) =>
      Reflect.set(value.ledgers[0].value.auditEntries[0], "sourceEventId", ""),
    );
    rejectLedger((value) =>
      Reflect.set(value.ledgers[0].value.auditEntries[0], "correlationId", ""),
    );
    rejectLedger((value) => Reflect.set(value.ledgers[0].value.auditEntries[0], "type", "bogus"));
    rejectLedger((value) =>
      Reflect.set(value.ledgers[0].value.auditEntries[0], "occurredAt", "invalid"),
    );
    rejectLedger((value) => {
      value.ledgers[0].value.auditEntries = value.ledgers[0].value.auditEntries.filter(
        (entry) => entry.type !== "policy.state.changed",
      );
    });
  });

  test("initializes_ledger_from_policy_state", () => {
    const s = setup();
    expect(s.finance.getLedger(base.tenantId, base.policyId)).toBeUndefined();
    s.initialize();
    expect(s.ledger()).toMatchObject({
      policyState: s.state.event.state,
      financeEntries: [],
      commissionEntries: [],
    });
    expect(s.finance.getLedger("another-tenant", base.policyId)).toBeUndefined();
  });

  test("rejects_finance_events_for_uninitialized_policy", () => {
    const s = setup();
    s.bus.publish({
      ...s.state,
      messageId: "deposit",
      event: {
        type: "finance.deposit.recorded",
        commandId: "deposit",
        policyId: base.policyId,
        amountCents: 100,
      },
    });
    expect(() => s.bus.drain()).toThrow(/initialized/i);
    expect(s.finance.getLedger(base.tenantId, base.policyId)).toBeUndefined();
  });

  test("cash_first_accrues_only_settled_premium", () => {
    const s = setup();
    s.initialize();
    s.finance.recordDeposit({ ...base, commandId: "deposit", amountCents: 2500 });
    s.finance.recordClaimPayment({ ...base, commandId: "claim", amountCents: 400 });
    s.bus.drain();
    expect(s.ledger().commissionEntries).toEqual([]);
    s.finance.settlePremiumPayment({ ...base, commandId: "premium", amountCents: 101 });
    s.bus.drain();
    expect(s.ledger().financeEntries.map((e) => e.amountCents)).toEqual([2500, -400, 101]);
    expect(s.ledger().commissionEntries).toEqual([
      expect.objectContaining({ kind: "accrual", amountCents: 10 }),
    ]);
  });

  test("written_accrues_on_bound_state", () => {
    const s = setup("on_bind");
    s.initialize();
    s.bus.publish({ ...s.state, messageId: "duplicate-state" });
    s.bus.publish({
      ...s.state,
      messageId: "cancelled",
      event: {
        type: "policy.state.changed",
        state: { ...s.state.event.state, revision: 2, lifecycle: "cancelled" },
      },
    });
    s.bus.drain();
    expect(s.ledger().commissionEntries).toEqual([
      expect.objectContaining({ kind: "accrual", amountCents: 1000 }),
    ]);
    expect(s.ledger().policyState.lifecycle).toBe("cancelled");
  });

  test("does_not_reverse_an_allocated_deposit_refund", () => {
    const s = setup();
    s.initialize();
    s.finance.recordDeposit({ ...base, commandId: "deposit", amountCents: 2500 });
    s.finance.settlePremiumPayment({ ...base, commandId: "premium", amountCents: 5000 });
    s.bus.drain();
    const deposit = s.ledger().financeEntries[0];
    s.finance.recordRefund({
      ...base,
      commandId: "refund",
      allocations: [{ allocationId: "a1", financeEntryId: deposit.id, amountCents: 2500 }],
    });
    s.bus.drain();
    expect(s.ledger().commissionEntries.map((e) => e.amountCents)).toEqual([500]);
    expect(s.ledger().financeEntries.at(-1)).toMatchObject({
      kind: "refund",
      amountCents: -2500,
      refundsFinanceEntryId: deposit.id,
    });
  });

  test("reverses_only_allocated_settled_premium_in_a_mixed_refund", () => {
    const s = setup();
    s.initialize();
    s.finance.recordDeposit({ ...base, commandId: "deposit", amountCents: 2500 });
    s.finance.settlePremiumPayment({ ...base, commandId: "premium", amountCents: 5000 });
    s.bus.drain();
    const [deposit, premium] = s.ledger().financeEntries;
    const accrual = s.ledger().commissionEntries[0];
    s.finance.recordRefund({
      ...base,
      commandId: "refund",
      allocations: [
        { allocationId: "a1", financeEntryId: deposit.id, amountCents: 2500 },
        { allocationId: "a2", financeEntryId: premium.id, amountCents: 1500 },
      ],
    });
    s.bus.drain();
    expect(
      s
        .ledger()
        .financeEntries.slice(-2)
        .map((e) => e.amountCents),
    ).toEqual([-2500, -1500]);
    expect(s.ledger().commissionEntries).toEqual([
      accrual,
      expect.objectContaining({
        kind: "refund_adjustment",
        amountCents: -150,
        reversesCommissionEntryId: accrual.id,
      }),
    ]);
  });

  test("rejects_over_refund_or_cross_tenant_allocation", () => {
    const s = setup();
    s.initialize();
    s.finance.recordDeposit({ ...base, commandId: "deposit", amountCents: 100 });
    s.bus.drain();
    const deposit = s.ledger().financeEntries[0];
    expect(() =>
      s.finance.recordRefund({
        ...base,
        commandId: "over",
        allocations: [
          { allocationId: "a1", financeEntryId: deposit.id, amountCents: 70 },
          { allocationId: "a2", financeEntryId: deposit.id, amountCents: 40 },
        ],
      }),
    ).toThrow(/balance/i);
    s.bus.publish({ ...s.state, messageId: "other-tenant", tenantId: "tenant-2" });
    s.bus.drain();
    expect(() =>
      s.finance.recordRefund({
        ...base,
        tenantId: "tenant-2",
        commandId: "cross",
        allocations: [{ allocationId: "a1", financeEntryId: deposit.id, amountCents: 10 }],
      }),
    ).toThrow(/source/i);
    expect(s.ledger().financeEntries).toHaveLength(1);
    expect(s.bus.pendingMessages()).toHaveLength(0);
  });

  test("appends_commission_payment_without_rewriting_accrual", () => {
    const s = setup("on_bind", 1);
    s.initialize();
    const accrual = s.ledger().commissionEntries[0];
    expect(() =>
      s.finance.payCommission({ ...base, commandId: "early", commissionEntryId: accrual.id }),
    ).toThrow(/payable/i);
    s.setTime("2026-01-02T00:00:00.000Z");
    s.finance.payCommission({ ...base, commandId: "pay", commissionEntryId: accrual.id });
    s.bus.drain();
    expect(s.ledger().commissionEntries).toEqual([
      accrual,
      expect.objectContaining({
        kind: "payment",
        amountCents: 1000,
        settlesCommissionEntryId: accrual.id,
      }),
    ]);
    expect(s.finance.getCommissionEntries(base.tenantId, base.policyId)[0].status).toBe("paid");
    expect(() =>
      s.finance.payCommission({ ...base, commandId: "pay-again", commissionEntryId: accrual.id }),
    ).toThrow(/paid/i);
    expect(s.ledger().auditEntries.at(-1)).toMatchObject({ commissionEntryId: accrual.id });
  });

  test("replays_commands_once_and_rejects_conflicting_input", () => {
    const s = setup();
    s.initialize();
    const command = { ...base, commandId: "deposit", amountCents: 100 };
    const first = s.finance.recordDeposit(command);
    expect(s.finance.recordDeposit(command)).toEqual(first);
    expect(s.bus.pendingMessages()).toHaveLength(1);
    s.bus.drain();
    s.bus.publish(first);
    s.bus.drain();
    expect(s.ledger().financeEntries).toHaveLength(1);
    expect(() => s.finance.recordDeposit({ ...command, amountCents: 200 })).toThrow(
      /different input/i,
    );
    expect(() => s.finance.recordDeposit({ ...command, commandId: "" })).toThrow(/command/i);
  });

  test("distinct_commands_share_workflow_correlation_and_retry_independently", () => {
    const s = setup();
    s.initialize();
    const deposit = { ...base, commandId: "deposit", amountCents: 100 };
    const premium = { ...base, commandId: "premium", amountCents: 200 };
    const first = s.finance.recordDeposit(deposit);
    const second = s.finance.settlePremiumPayment(premium);
    expect(first).toMatchObject({ correlationId: "workflow-1", event: { commandId: "deposit" } });
    expect(second).toMatchObject({ correlationId: "workflow-1", event: { commandId: "premium" } });
    expect(s.finance.recordDeposit(deposit)).toEqual(first);
    expect(s.finance.settlePremiumPayment(premium)).toEqual(second);
    expect(s.bus.pendingMessages()).toHaveLength(2);
    s.bus.drain();
    expect(s.finance.recordDeposit(deposit)).toEqual(first);
    expect(s.finance.settlePremiumPayment(premium)).toEqual(second);
    expect(s.ledger().financeEntries.map((e) => e.amountCents)).toEqual([100, 200]);
    expect(
      s
        .ledger()
        .auditEntries.slice(-2)
        .map((e) => e.correlationId),
    ).toEqual(["workflow-1", "workflow-1"]);
    expect(s.bus.pendingMessages()).toHaveLength(0);
  });

  test("consumes_distinct_command_ids_in_one_workflow_and_rejects_missing_command_id", () => {
    const s = setup();
    s.initialize();
    const first = {
      ...s.state,
      messageId: "external-1",
      correlationId: "shared-workflow",
      event: {
        type: "finance.deposit.recorded" as const,
        commandId: "external-command-1",
        policyId: base.policyId,
        amountCents: 100,
      },
    };
    const second = {
      ...first,
      messageId: "external-2",
      event: { ...first.event, commandId: "external-command-2", amountCents: 200 },
    };
    s.bus.publish(first);
    s.bus.publish(second);
    s.bus.drain();
    s.bus.publish(first);
    s.bus.publish(second);
    s.bus.drain();
    expect(s.ledger().financeEntries.map((e) => e.amountCents)).toEqual([100, 200]);
    s.bus.publish({
      ...first,
      messageId: "missing-command",
      correlationId: "another-workflow",
      event: { ...first.event, commandId: "" },
    });
    expect(() => s.bus.drain()).toThrow(/command id/i);
    expect(s.ledger().financeEntries).toHaveLength(2);
  });

  test("keeps_refund_rounding_per_original_premium_accrual", () => {
    const s = setup();
    s.state.event.state.commissionPlan.rateBasisPoints = 5000;
    s.initialize();
    s.finance.settlePremiumPayment({ ...base, commandId: "p1", amountCents: 1 });
    s.finance.settlePremiumPayment({ ...base, commandId: "p2", amountCents: 1 });
    s.bus.drain();
    s.finance.recordRefund({
      ...base,
      commandId: "refund",
      allocations: s.ledger().financeEntries.map((e, i) => ({
        allocationId: `a${i}`,
        financeEntryId: e.id,
        amountCents: 1,
      })),
    });
    s.bus.drain();
    expect(s.ledger().commissionEntries.map((e) => e.amountCents)).toEqual([1, 1, -1, -1]);
    expect(new Set(s.ledger().commissionEntries.map((e) => e.id)).size).toBe(4);
  });

  test("validates_full_refund_atomically_and_rechecks_queued_balance", () => {
    const s = setup();
    s.initialize();
    s.finance.recordDeposit({ ...base, commandId: "d", amountCents: 100 });
    s.bus.drain();
    const source = s.ledger().financeEntries[0];
    const allocations = [{ allocationId: "a1", financeEntryId: source.id, amountCents: 60 }];
    s.finance.recordRefund({ ...base, commandId: "r1", allocations });
    s.finance.recordRefund({ ...base, commandId: "r2", allocations });
    expect(() => s.bus.drain()).toThrow(/balance/i);
    expect(s.ledger().financeEntries.map((e) => e.amountCents)).toEqual([100, -60]);
  });

  test("isolates_same_command_and_policy_ids_across_tenants_and_detaches_snapshots", () => {
    const s = setup();
    s.initialize();
    s.bus.publish({ ...s.state, tenantId: "tenant-2", messageId: "state-2" });
    s.bus.drain();
    const first = s.finance.recordDeposit({ ...base, commandId: "d", amountCents: 100 });
    s.finance.recordDeposit({ ...base, tenantId: "tenant-2", commandId: "d", amountCents: 200 });
    expect(() => {
      (first.event as { amountCents: number }).amountCents = 999;
    }).toThrow();
    s.bus.drain();
    expect(s.ledger().financeEntries[0].amountCents).toBe(100);
    expect(
      required(s.finance.getLedger("tenant-2", base.policyId)).financeEntries[0].amountCents,
    ).toBe(200);
    s.state.event.state.commissionPlan.rateBasisPoints = 9999;
    expect(s.ledger().policyState.commissionPlan.rateBasisPoints).toBe(1000);
  });

  test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects_invalid_cents_%s",
    (amountCents) => {
      const s = setup();
      s.initialize();
      expect(() => s.finance.recordDeposit({ ...base, commandId: "bad", amountCents })).toThrow(
        /cents/i,
      );
      expect(s.bus.pendingMessages()).toHaveLength(0);
    },
  );

  test("rejects_refund_sources_that_are_claims_or_other_policies", () => {
    const s = setup();
    s.initialize();
    s.finance.recordClaimPayment({ ...base, commandId: "claim", amountCents: 100 });
    s.bus.drain();
    expect(() =>
      s.finance.recordRefund({
        ...base,
        commandId: "bad",
        allocations: [
          { allocationId: "a1", financeEntryId: s.ledger().financeEntries[0].id, amountCents: 10 },
        ],
      }),
    ).toThrow(/source/i);
    s.bus.publish({
      ...s.state,
      messageId: "p2",
      event: {
        type: "policy.state.changed",
        state: { ...s.state.event.state, policyId: "policy-2" },
      },
    });
    s.bus.drain();
    s.finance.recordDeposit({ ...base, policyId: "policy-2", commandId: "d2", amountCents: 100 });
    s.bus.drain();
    const other = required(s.finance.getLedger(base.tenantId, "policy-2")).financeEntries[0];
    expect(() =>
      s.finance.recordRefund({
        ...base,
        commandId: "cross-policy",
        allocations: [{ allocationId: "a1", financeEntryId: other.id, amountCents: 10 }],
      }),
    ).toThrow(/source/i);
  });

  test("preserves_allocation_identity_and_rounds_partial_refunds_cumulatively", () => {
    const s = setup();
    s.state.event.state.commissionPlan.rateBasisPoints = 5000;
    s.initialize();
    s.finance.settlePremiumPayment({ ...base, commandId: "p", amountCents: 3 });
    s.bus.drain();
    const source = s.ledger().financeEntries[0];
    const allocations = [
      { allocationId: "a1", financeEntryId: source.id, amountCents: 1 },
      { allocationId: "a2", financeEntryId: source.id, amountCents: 1 },
    ];
    const message = s.finance.recordRefund({ ...base, commandId: "r1", allocations });
    allocations[0].amountCents = 3;
    s.bus.drain();
    s.finance.recordRefund({
      ...base,
      commandId: "r2",
      allocations: [{ allocationId: "a3", financeEntryId: source.id, amountCents: 1 }],
    });
    s.bus.drain();
    const refunds = s.ledger().financeEntries.filter((e) => e.kind === "refund");
    expect(refunds.map((e) => [e.allocationId, e.amountCents])).toEqual([
      ["a1", -1],
      ["a2", -1],
      ["a3", -1],
    ]);
    expect(new Set(refunds.map((e) => e.id)).size).toBe(3);
    expect(refunds[0].sourceEventId).toBe(message.messageId);
    expect(message).toMatchObject({
      correlationId: "workflow-1",
      causationId: "state-1",
      event: { commandId: "r1" },
    });
    expect(s.ledger().commissionEntries.map((e) => e.amountCents)).toEqual([2, -1, -1]);
  });

  test("requires_unique_nonempty_allocation_ids_before_publishing", () => {
    const s = setup();
    s.initialize();
    s.finance.recordDeposit({ ...base, commandId: "d", amountCents: 100 });
    s.bus.drain();
    const source = s.ledger().financeEntries[0];
    const allocation = { allocationId: "same", financeEntryId: source.id, amountCents: 1 };
    expect(() =>
      s.finance.recordRefund({ ...base, commandId: "r1", allocations: [allocation, allocation] }),
    ).toThrow(/unique/i);
    expect(() =>
      s.finance.recordRefund({
        ...base,
        commandId: "r2",
        allocations: [{ ...allocation, allocationId: "" }],
      }),
    ).toThrow(/allocation/i);
    expect(s.bus.pendingMessages()).toHaveLength(0);
  });

  test("honors_reverse_on_refund_and_caps_written_reversal_at_bound_accrual", () => {
    const s = setup("on_bind");
    s.initialize();
    s.finance.settlePremiumPayment({ ...base, commandId: "p", amountCents: 20000 });
    s.bus.drain();
    s.finance.recordRefund({
      ...base,
      commandId: "r",
      allocations: [
        { allocationId: "a", financeEntryId: s.ledger().financeEntries[0].id, amountCents: 20000 },
      ],
    });
    s.bus.drain();
    expect(s.ledger().commissionEntries.map((e) => e.amountCents)).toEqual([1000, -1000]);
    const keep = setup();
    keep.state.event.state.commissionPlan.reverseOnRefund = false;
    keep.initialize();
    keep.finance.settlePremiumPayment({ ...base, commandId: "p", amountCents: 100 });
    keep.bus.drain();
    keep.finance.recordRefund({
      ...base,
      commandId: "r",
      allocations: [
        {
          allocationId: "a",
          financeEntryId: keep.ledger().financeEntries[0].id,
          amountCents: 100,
        },
      ],
    });
    keep.bus.drain();
    expect(keep.ledger().commissionEntries.map((e) => e.amountCents)).toEqual([10]);
  });
});
