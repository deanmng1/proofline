import { moneyFromBasisPoints } from "./money";
import type { CommissionEntry, CommissionPlan, Policy } from "./types";

const MILLIS_PER_DAY = 24 * 60 * 60 * 1_000;

/** Commission math needs immutable identity and terms, never a Policy store. */
type CommissionPolicy = Pick<Policy, "id" | "commissionPlan">;

export function isCommissionPlan(value: unknown): value is CommissionPlan {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const plan = value as Record<string, unknown>;
  return (
    (plan.timing === "on_bind" || plan.timing === "as_earned") &&
    Number.isSafeInteger(plan.rateBasisPoints) &&
    (plan.rateBasisPoints as number) >= 0 &&
    Number.isSafeInteger(plan.holdPeriodDays) &&
    (plan.holdPeriodDays as number) >= 0 &&
    typeof plan.reverseOnRefund === "boolean"
  );
}

export function assertCommissionPlan(plan: CommissionPlan): void {
  if (plan.timing !== "on_bind" && plan.timing !== "as_earned") {
    throw new Error("Commission timing must be on_bind or as_earned.");
  }
  if (!Number.isSafeInteger(plan.rateBasisPoints) || plan.rateBasisPoints < 0) {
    throw new Error("Commission rate basis points must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(plan.holdPeriodDays) || plan.holdPeriodDays < 0) {
    throw new Error("Commission hold days must be a non-negative integer.");
  }
  if (typeof plan.reverseOnRefund !== "boolean") {
    throw new Error("Commission reverse-on-refund must be a boolean.");
  }
}

function payableAt(earnedAt: string, holdPeriodDays: number): string {
  if (!Number.isInteger(holdPeriodDays) || holdPeriodDays < 0) {
    throw new Error("Commission hold days must be a non-negative integer.");
  }

  return new Date(new Date(earnedAt).getTime() + holdPeriodDays * MILLIS_PER_DAY).toISOString();
}

export function createAccrualEntry(
  policy: CommissionPolicy,
  sourceEventId: string,
  amountCents: number,
  earnedAt: string,
): CommissionEntry {
  assertCommissionPlan(policy.commissionPlan);
  return {
    id: `commission:${sourceEventId}`,
    sourceEventId,
    policyId: policy.id,
    kind: "accrual",
    amountCents: moneyFromBasisPoints(amountCents, policy.commissionPlan.rateBasisPoints),
    status: "earned",
    earnedAt,
    payableAt: payableAt(earnedAt, policy.commissionPlan.holdPeriodDays),
  };
}

export function createRefundAdjustmentEntry(
  policy: CommissionPolicy,
  sourceEventId: string,
  amountCents: number,
  earnedAt: string,
  reversesCommissionEntryId: string,
): CommissionEntry {
  return {
    id: `commission:${sourceEventId}:${reversesCommissionEntryId}`,
    sourceEventId,
    policyId: policy.id,
    kind: "refund_adjustment",
    amountCents,
    status: "earned",
    earnedAt,
    payableAt: payableAt(earnedAt, policy.commissionPlan.holdPeriodDays),
    reversesCommissionEntryId,
  };
}

export function createPaymentEntry(
  entry: CommissionEntry,
  sourceEventId: string,
  paidAt: string,
): CommissionEntry {
  return {
    id: `commission:${sourceEventId}:${entry.id}`,
    sourceEventId,
    policyId: entry.policyId,
    kind: "payment",
    amountCents: entry.amountCents,
    status: "paid",
    earnedAt: paidAt,
    payableAt: paidAt,
    paidAt,
    settlesCommissionEntryId: entry.id,
  };
}

export function advanceCommissionStatuses(
  entries: CommissionEntry[],
  now: string,
): CommissionEntry[] {
  const nowMillis = new Date(now).getTime();
  if (Number.isNaN(nowMillis)) {
    throw new Error("Commission status updates require an ISO timestamp.");
  }

  return entries.map((entry) => {
    if (entry.status === "earned" && nowMillis >= new Date(entry.payableAt).getTime()) {
      return { ...entry, status: "payable" };
    }
    return entry;
  });
}

/** Projects the current view without mutating historical accrual or payment records. */
export function projectCommissionEntries(
  entries: CommissionEntry[],
  now: string,
): CommissionEntry[] {
  const advanced = advanceCommissionStatuses(entries, now);
  const payments = new Map(
    entries
      .filter((entry) => entry.kind === "payment" && entry.settlesCommissionEntryId)
      .map((entry) => [entry.settlesCommissionEntryId, entry]),
  );

  return advanced.map((entry) => {
    if (entry.kind === "payment") {
      return entry;
    }
    const payment = payments.get(entry.id);
    return payment ? { ...entry, status: "paid", paidAt: payment.paidAt } : entry;
  });
}

export function refundCommissionAdjustmentCents(
  plan: CommissionPlan,
  totalRefundedCents: number,
  priorAdjustmentsCents: number,
): number {
  const desiredTotalAdjustment = -moneyFromBasisPoints(totalRefundedCents, plan.rateBasisPoints);
  return desiredTotalAdjustment - priorAdjustmentsCents;
}
