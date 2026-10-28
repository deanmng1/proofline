import { moneyFromBasisPoints } from "./money";
import type { CommissionEntry, CommissionPlan, Policy } from "./types";

const MILLIS_PER_DAY = 24 * 60 * 60 * 1_000;

function payableAt(earnedAt: string, holdPeriodDays: number): string {
  if (!Number.isInteger(holdPeriodDays) || holdPeriodDays < 0) {
    throw new Error("Commission hold days must be a non-negative integer.");
  }

  return new Date(new Date(earnedAt).getTime() + holdPeriodDays * MILLIS_PER_DAY).toISOString();
}

export function createAccrualEntry(
  policy: Policy,
  sourceEventId: string,
  amountCents: number,
  earnedAt: string,
): CommissionEntry {
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
  policy: Policy,
  sourceEventId: string,
  amountCents: number,
  earnedAt: string,
): CommissionEntry {
  return {
    id: `commission:${sourceEventId}`,
    sourceEventId,
    policyId: policy.id,
    kind: "refund_adjustment",
    amountCents,
    status: "earned",
    earnedAt,
    payableAt: payableAt(earnedAt, policy.commissionPlan.holdPeriodDays),
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

export function refundCommissionAdjustmentCents(
  plan: CommissionPlan,
  totalRefundedCents: number,
  priorAdjustmentsCents: number,
): number {
  const desiredTotalAdjustment = -moneyFromBasisPoints(totalRefundedCents, plan.rateBasisPoints);
  return desiredTotalAdjustment - priorAdjustmentsCents;
}
