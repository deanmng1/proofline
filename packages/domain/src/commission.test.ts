import { describe, expect, test } from "vitest";
import {
  createAccrualEntry,
  createPaymentEntry,
  createRefundAdjustmentEntry,
  projectCommissionEntries,
  refundCommissionAdjustmentCents,
} from "./commission";
import { moneyFromBasisPoints } from "./money";

const createdAt = "2026-01-01T00:00:00.000Z";
const plan = {
  timing: "as_earned" as const,
  rateBasisPoints: 1000,
  holdPeriodDays: 30,
  reverseOnRefund: true,
};
const policy = { id: "policy-1", commissionPlan: plan };
describe("commission rules", () => {
  test("creates commission from only immutable policy identity and plan", () => {
    const roundingPlan = { ...plan, rateBasisPoints: 5000, holdPeriodDays: 0 };
    expect(
      createAccrualEntry({ id: "policy-1", commissionPlan: roundingPlan }, "premium", 1, createdAt),
    ).toMatchObject({ amountCents: 1, policyId: "policy-1", sourceEventId: "premium" });
    expect(refundCommissionAdjustmentCents(roundingPlan, 1, 0)).toBe(-1);
    expect(refundCommissionAdjustmentCents(roundingPlan, 2, -1)).toBe(0);
    expect(refundCommissionAdjustmentCents(roundingPlan, 3, -1)).toBe(-1);
  });
  test("COM-004 rejects malformed or negative commission plans at the domain boundary", () => {
    expect(() =>
      createAccrualEntry(
        { ...policy, commissionPlan: { ...plan, rateBasisPoints: -1000 } },
        "premium",
        10000,
        createdAt,
      ),
    ).toThrow("Commission rate basis points must be a non-negative safe integer.");
  });
  test("COM-001 rounds a written commission half-up and makes it immediately payable", () => {
    expect(moneyFromBasisPoints(101, 1250)).toBe(13);
    const entry = createAccrualEntry(
      {
        id: "policy-1",
        commissionPlan: { ...plan, timing: "on_bind", rateBasisPoints: 1250, holdPeriodDays: 0 },
      },
      "bound",
      101,
      createdAt,
    );
    expect(projectCommissionEntries([entry], createdAt)).toEqual([
      expect.objectContaining({
        amountCents: 13,
        kind: "accrual",
        policyId: "policy-1",
        status: "payable",
      }),
    ]);
  });
  test("COM-002 becomes payable at the exact hold boundary without rewriting the accrual", () => {
    const entry = createAccrualEntry(policy, "premium", 10000, "2026-01-02T00:00:00.000Z");
    expect(projectCommissionEntries([entry], "2026-01-31T23:59:59.999Z")[0]).toMatchObject({
      status: "earned",
      amountCents: 1000,
    });
    expect(projectCommissionEntries([entry], "2026-02-01T00:00:00.000Z")[0]).toMatchObject({
      status: "payable",
    });
    expect(entry.status).toBe("earned");
  });
  test("COM-005 projects linked payment without replacing the historical accrual", () => {
    const entry = createAccrualEntry(policy, "premium", 10000, createdAt);
    const payment = createPaymentEntry(entry, "payment", "2026-02-01T00:00:00.000Z");
    expect(payment).toMatchObject({
      kind: "payment",
      amountCents: 1000,
      settlesCommissionEntryId: entry.id,
      status: "paid",
    });
    expect(projectCommissionEntries([entry, payment], "2026-02-01T00:00:00.000Z")[0]).toMatchObject(
      { status: "paid" },
    );
    expect(entry.status).toBe("earned");
  });
  test("refund adjustments retain the original accrual and hold period", () => {
    const adjustment = createRefundAdjustmentEntry(
      policy,
      "refund",
      -200,
      createdAt,
      "original-accrual",
    );
    expect(adjustment).toMatchObject({
      amountCents: -200,
      reversesCommissionEntryId: "original-accrual",
      payableAt: "2026-01-31T00:00:00.000Z",
    });
  });
});
