import { describe, expect, test } from "vitest";

import { applyEvent, emptyDomainState } from "./apply-event";
import {
  createAccrualEntry,
  projectCommissionEntries,
  refundCommissionAdjustmentCents,
} from "./commission";
import { moneyFromBasisPoints } from "./money";

const createdAt = "2026-01-01T00:00:00.000Z";

function createQuote(
  plan: {
    timing: "on_bind" | "as_earned";
    rateBasisPoints: number;
    holdPeriodDays: number;
    reverseOnRefund: boolean;
  },
  premiumCents = 10_000,
) {
  return {
    type: "quote_created" as const,
    sourceEventId: "quote-created-1",
    occurredAt: createdAt,
    quote: {
      id: "quote-1",
      customerId: "customer-1",
      propertyId: "property-1",
      product: "risk_secure" as const,
      premiumCents,
      commissionPlan: plan,
    },
  };
}

function bindQuote() {
  return {
    type: "quote_bound" as const,
    sourceEventId: "quote-bound-1",
    occurredAt: createdAt,
    quoteId: "quote-1",
    policyId: "policy-1",
  };
}

describe("commission rules", () => {
  test("creates commission from only immutable policy identity and plan", () => {
    const plan = {
      timing: "as_earned" as const,
      rateBasisPoints: 5000,
      holdPeriodDays: 0,
      reverseOnRefund: true,
    };
    expect(
      createAccrualEntry({ id: "policy-1", commissionPlan: plan }, "premium", 1, createdAt),
    ).toMatchObject({ amountCents: 1, policyId: "policy-1", sourceEventId: "premium" });
    expect(refundCommissionAdjustmentCents(plan, 1, 0)).toBe(-1);
    expect(refundCommissionAdjustmentCents(plan, 2, -1)).toBe(0);
    expect(refundCommissionAdjustmentCents(plan, 3, -1)).toBe(-1);
  });

  test("COM-004 rejects malformed or negative commission plans at the domain boundary", () => {
    expect(() =>
      applyEvent(
        emptyDomainState(),
        createQuote({
          timing: "on_bind",
          rateBasisPoints: -1_000,
          holdPeriodDays: 0,
          reverseOnRefund: true,
        }),
        createdAt,
      ),
    ).toThrow("Commission rate basis points must be a non-negative safe integer.");
  });

  test("COM-001 rounds a written commission half-up and makes it payable on bind", () => {
    expect(moneyFromBasisPoints(101, 1_250)).toBe(13);

    const quoted = applyEvent(
      emptyDomainState(),
      createQuote(
        {
          timing: "on_bind",
          rateBasisPoints: 1_250,
          holdPeriodDays: 0,
          reverseOnRefund: true,
        },
        101,
      ),
      createdAt,
    );
    const bound = applyEvent(quoted, bindQuote(), createdAt);

    expect(projectCommissionEntries(bound.commissionEntries, createdAt)).toEqual([
      expect.objectContaining({
        amountCents: 13,
        kind: "accrual",
        policyId: "policy-1",
        status: "payable",
      }),
    ]);
  });

  test("COM-002 earns only settled premium and becomes payable at the exact hold boundary", () => {
    const quoted = applyEvent(
      emptyDomainState(),
      createQuote({
        timing: "as_earned",
        rateBasisPoints: 1_000,
        holdPeriodDays: 30,
        reverseOnRefund: true,
      }),
      createdAt,
    );
    const bound = applyEvent(quoted, bindQuote(), createdAt);
    expect(bound.commissionEntries).toHaveLength(0);

    const settledAt = "2026-01-02T00:00:00.000Z";
    const settled = applyEvent(
      bound,
      {
        type: "premium_payment_settled",
        sourceEventId: "premium-1",
        occurredAt: settledAt,
        policyId: "policy-1",
        amountCents: 10_000,
      },
      settledAt,
    );
    expect(projectCommissionEntries(settled.commissionEntries, settledAt)[0]).toEqual(
      expect.objectContaining({ amountCents: 1_000, status: "earned" }),
    );

    const beforeBoundary = applyEvent(
      settled,
      {
        type: "claim_payment_recorded",
        sourceEventId: "claim-before-hold",
        occurredAt: "2026-01-31T23:59:59.999Z",
        policyId: "policy-1",
        amountCents: 1,
      },
      "2026-01-31T23:59:59.999Z",
    );
    expect(
      projectCommissionEntries(beforeBoundary.commissionEntries, "2026-01-31T23:59:59.999Z")[0],
    ).toEqual(expect.objectContaining({ status: "earned" }));

    const atBoundary = applyEvent(
      beforeBoundary,
      {
        type: "claim_payment_recorded",
        sourceEventId: "claim-at-hold",
        occurredAt: "2026-02-01T00:00:00.000Z",
        policyId: "policy-1",
        amountCents: 1,
      },
      "2026-02-01T00:00:00.000Z",
    );
    expect(
      projectCommissionEntries(atBoundary.commissionEntries, "2026-02-01T00:00:00.000Z")[0],
    ).toEqual(expect.objectContaining({ status: "payable" }));
  });

  test("FIN-002 records deposits and claims without creating agent commission", () => {
    const quoted = applyEvent(
      emptyDomainState(),
      createQuote({
        timing: "as_earned",
        rateBasisPoints: 1_000,
        holdPeriodDays: 0,
        reverseOnRefund: true,
      }),
      createdAt,
    );
    const bound = applyEvent(quoted, bindQuote(), createdAt);
    const deposited = applyEvent(
      bound,
      {
        type: "deposit_recorded",
        sourceEventId: "deposit-1",
        occurredAt: createdAt,
        policyId: "policy-1",
        amountCents: 2_500,
      },
      createdAt,
    );
    const claimed = applyEvent(
      deposited,
      {
        type: "claim_payment_recorded",
        sourceEventId: "claim-1",
        occurredAt: createdAt,
        policyId: "policy-1",
        amountCents: 1_700,
      },
      createdAt,
    );

    expect(claimed.financeEntries.map((entry) => [entry.kind, entry.amountCents])).toEqual([
      ["deposit", 2_500],
      ["claim_payment", -1_700],
    ]);
    expect(claimed.commissionEntries).toHaveLength(0);
  });

  test("COM-003 does not reverse commission for an as-earned deposit that never accrued", () => {
    const quoted = applyEvent(
      emptyDomainState(),
      createQuote({
        timing: "as_earned",
        rateBasisPoints: 1_000,
        holdPeriodDays: 0,
        reverseOnRefund: true,
      }),
      createdAt,
    );
    const bound = applyEvent(quoted, bindQuote(), createdAt);
    const deposited = applyEvent(
      bound,
      {
        type: "deposit_recorded",
        sourceEventId: "deposit-1",
        occurredAt: createdAt,
        policyId: "policy-1",
        amountCents: 4_000,
      },
      createdAt,
    );

    const refunded = applyEvent(
      deposited,
      {
        type: "refund_recorded",
        sourceEventId: "refund-4k",
        occurredAt: createdAt,
        policyId: "policy-1",
        totalRefundedCents: 4_000,
      },
      createdAt,
    );

    expect(refunded.commissionEntries).toEqual([]);
  });

  test("COM-005 appends a linked payment instead of replacing a payable accrual", () => {
    const quoted = applyEvent(
      emptyDomainState(),
      createQuote({
        timing: "on_bind",
        rateBasisPoints: 1_000,
        holdPeriodDays: 0,
        reverseOnRefund: true,
      }),
      createdAt,
    );
    const bound = applyEvent(quoted, bindQuote(), createdAt);
    const paid = applyEvent(
      bound,
      {
        type: "commission_paid",
        sourceEventId: "commission-payment-1",
        occurredAt: createdAt,
        policyId: "policy-1",
        commissionEntryId: "commission:quote-bound-1",
      },
      createdAt,
    );

    expect(paid.commissionEntries).toEqual([
      expect.objectContaining({
        id: "commission:quote-bound-1",
        kind: "accrual",
        status: "earned",
      }),
      expect.objectContaining({
        kind: "payment",
        settlesCommissionEntryId: "commission:quote-bound-1",
        status: "paid",
      }),
    ]);
    expect(projectCommissionEntries(paid.commissionEntries, createdAt)[0]).toEqual(
      expect.objectContaining({ status: "paid" }),
    );
    expect(paid.auditEntries.at(-1)).toEqual(
      expect.objectContaining({ commissionEntryId: "commission:quote-bound-1" }),
    );
  });
});
