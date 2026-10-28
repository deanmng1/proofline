import { describe, expect, test } from "vitest";

import { applyEvent, emptyDomainState } from "./apply-event";

const createdAt = "2026-01-01T00:00:00.000Z";

function createAndBindPolicy() {
  const quoted = applyEvent(
    emptyDomainState(),
    {
      type: "quote_created",
      sourceEventId: "quote-created-1",
      occurredAt: createdAt,
      quote: {
        id: "quote-1",
        customerId: "customer-1",
        propertyId: "property-1",
        product: "risk_secure_plus",
        premiumCents: 10_000,
        commissionPlan: {
          timing: "on_bind",
          rateBasisPoints: 1_000,
          holdPeriodDays: 0,
          reverseOnRefund: true,
        },
      },
    },
    createdAt,
  );
  return applyEvent(
    quoted,
    {
      type: "quote_bound",
      sourceEventId: "quote-bound-1",
      occurredAt: createdAt,
      quoteId: "quote-1",
      policyId: "policy-1",
    },
    createdAt,
  );
}

describe("append-only policy and finance transitions", () => {
  test("POL-001 binds one immutable policy and ignores a replayed source event", () => {
    const bound = createAndBindPolicy();
    const replayed = applyEvent(
      bound,
      {
        type: "quote_bound",
        sourceEventId: "quote-bound-1",
        occurredAt: "2026-01-03T00:00:00.000Z",
        quoteId: "quote-1",
        policyId: "policy-1",
      },
      "2026-01-03T00:00:00.000Z",
    );

    expect(replayed).toEqual(bound);
    expect(replayed.policies["policy-1"]).toEqual(
      expect.objectContaining({
        product: "risk_secure_plus",
        premiumCents: 10_000,
        quoteId: "quote-1",
        status: "bound",
      }),
    );
    expect(replayed.commissionEntries).toHaveLength(1);
  });

  test("FIN-001 appends one financial entry per unique source event", () => {
    const bound = createAndBindPolicy();
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
    const replayed = applyEvent(
      deposited,
      {
        type: "deposit_recorded",
        sourceEventId: "deposit-1",
        occurredAt: "2026-01-02T00:00:00.000Z",
        policyId: "policy-1",
        amountCents: 2_500,
      },
      "2026-01-02T00:00:00.000Z",
    );

    expect(replayed.financeEntries).toEqual([
      expect.objectContaining({ amountCents: 2_500, kind: "deposit", sourceEventId: "deposit-1" }),
    ]);
  });

  test("COM-003 creates only the incremental negative adjustment for cumulative refunds", () => {
    const bound = createAndBindPolicy();
    const partiallyRefunded = applyEvent(
      bound,
      {
        type: "refund_recorded",
        sourceEventId: "refund-2k",
        occurredAt: "2026-01-05T00:00:00.000Z",
        policyId: "policy-1",
        totalRefundedCents: 2_000,
      },
      "2026-01-05T00:00:00.000Z",
    );
    const cumulativelyRefunded = applyEvent(
      partiallyRefunded,
      {
        type: "refund_recorded",
        sourceEventId: "refund-5k-total",
        occurredAt: "2026-01-06T00:00:00.000Z",
        policyId: "policy-1",
        totalRefundedCents: 5_000,
      },
      "2026-01-06T00:00:00.000Z",
    );

    expect(cumulativelyRefunded.financeEntries.map((entry) => entry.amountCents)).toEqual([
      -2_000, -3_000,
    ]);
    expect(
      cumulativelyRefunded.commissionEntries
        .filter((entry) => entry.kind === "refund_adjustment")
        .map((entry) => entry.amountCents),
    ).toEqual([-200, -300]);
    expect(
      cumulativelyRefunded.commissionEntries
        .filter((entry) => entry.kind === "refund_adjustment")
        .reduce((sum, entry) => sum + entry.amountCents, 0),
    ).toBe(-500);
  });
});
