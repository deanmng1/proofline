import {
  assertCommissionPlan,
  createAccrualEntry,
  createPaymentEntry,
  createRefundAdjustmentEntry,
  projectCommissionEntries,
  refundCommissionAdjustmentCents,
} from "./commission";
import type { DomainEvent, DomainState, FinanceEntry, Policy, Quote } from "./types";

export function emptyDomainState(): DomainState {
  return {
    quotes: {},
    policies: {},
    financeEntries: [],
    commissionEntries: [],
    auditEntries: [],
    processedSourceEventIds: [],
    refundTotalsCents: {},
  };
}

function assertPositiveCents(amountCents: number, label: string): void {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error(`${label} must be a positive integer number of cents.`);
  }
}

function assertKnownPolicy(state: DomainState, policyId: string): Policy {
  const policy = state.policies[policyId];
  if (!policy) {
    throw new Error(`Unknown policy: ${policyId}`);
  }
  return policy;
}

function appendFinance(
  state: DomainState,
  entry: Omit<FinanceEntry, "id">,
): Pick<DomainState, "financeEntries"> {
  return {
    financeEntries: [...state.financeEntries, { ...entry, id: `finance:${entry.sourceEventId}` }],
  };
}

function withAudit(state: DomainState, event: DomainEvent): DomainState {
  return {
    ...state,
    auditEntries: [
      ...state.auditEntries,
      {
        sourceEventId: event.sourceEventId,
        type: event.type,
        occurredAt: event.occurredAt,
        ...(event.type === "commission_paid" ? { commissionEntryId: event.commissionEntryId } : {}),
      },
    ],
    processedSourceEventIds: [...state.processedSourceEventIds, event.sourceEventId],
  };
}

function quoteToPolicy(quote: Quote, policyId: string, boundAt: string): Policy {
  return {
    id: policyId,
    quoteId: quote.id,
    customerId: quote.customerId,
    propertyId: quote.propertyId,
    product: quote.product,
    premiumCents: quote.premiumCents,
    commissionPlan: quote.commissionPlan,
    boundAt,
    status: "bound",
  };
}

function commissionableRefundCents(state: DomainState, policy: Policy, totalRefundedCents: number) {
  if (policy.commissionPlan.timing === "on_bind") {
    return Math.min(totalRefundedCents, policy.premiumCents);
  }

  const settledCents = state.financeEntries
    .filter((entry) => entry.policyId === policy.id && entry.kind === "premium_payment")
    .reduce((sum, entry) => sum + entry.amountCents, 0);
  return Math.min(totalRefundedCents, settledCents);
}

function createRefundAdjustments(
  state: DomainState,
  policy: Policy,
  sourceEventId: string,
  desiredAdjustmentCents: number,
  occurredAt: string,
) {
  let remainingReversalCents = -desiredAdjustmentCents;
  const adjustments: DomainState["commissionEntries"] = [];
  const accruals = state.commissionEntries.filter(
    (entry) => entry.policyId === policy.id && entry.kind === "accrual" && entry.amountCents > 0,
  );

  for (const accrual of accruals) {
    if (remainingReversalCents <= 0) {
      break;
    }
    const priorReversalsCents = state.commissionEntries
      .filter((entry) => entry.reversesCommissionEntryId === accrual.id)
      .reduce((sum, entry) => sum + entry.amountCents, 0);
    const availableCents = Math.max(0, accrual.amountCents + priorReversalsCents);
    const reversalCents = Math.min(availableCents, remainingReversalCents);
    if (reversalCents > 0) {
      adjustments.push(
        createRefundAdjustmentEntry(policy, sourceEventId, -reversalCents, occurredAt, accrual.id),
      );
      remainingReversalCents -= reversalCents;
    }
  }

  return adjustments;
}

export function applyEvent(state: DomainState, event: DomainEvent, now: string): DomainState {
  if (state.processedSourceEventIds.includes(event.sourceEventId)) {
    return state;
  }

  let next = withAudit(state, event);

  switch (event.type) {
    case "quote_created": {
      assertPositiveCents(event.quote.premiumCents, "Quote premium");
      assertCommissionPlan(event.quote.commissionPlan);
      if (next.quotes[event.quote.id]) {
        throw new Error(`Quote already exists: ${event.quote.id}`);
      }
      next = {
        ...next,
        quotes: {
          ...next.quotes,
          [event.quote.id]: { ...event.quote, createdAt: event.occurredAt, status: "quoted" },
        },
      };
      break;
    }

    case "quote_bound": {
      const quote = next.quotes[event.quoteId];
      if (!quote) {
        throw new Error(`Unknown quote: ${event.quoteId}`);
      }
      if (quote.status === "bound" || next.policies[event.policyId]) {
        throw new Error(`Quote is already bound: ${event.quoteId}`);
      }
      const policy = quoteToPolicy(quote, event.policyId, event.occurredAt);
      const boundQuote = { ...quote, status: "bound" as const };
      next = {
        ...next,
        quotes: { ...next.quotes, [quote.id]: boundQuote },
        policies: { ...next.policies, [policy.id]: policy },
      };
      if (policy.commissionPlan.timing === "on_bind") {
        next = {
          ...next,
          commissionEntries: [
            ...next.commissionEntries,
            createAccrualEntry(policy, event.sourceEventId, policy.premiumCents, event.occurredAt),
          ],
        };
      }
      break;
    }

    case "deposit_recorded": {
      assertPositiveCents(event.amountCents, "Deposit");
      assertKnownPolicy(next, event.policyId);
      next = {
        ...next,
        ...appendFinance(next, { ...event, kind: "deposit", amountCents: event.amountCents }),
      };
      break;
    }

    case "premium_payment_settled": {
      assertPositiveCents(event.amountCents, "Settled premium payment");
      const policy = assertKnownPolicy(next, event.policyId);
      next = {
        ...next,
        ...appendFinance(next, {
          ...event,
          kind: "premium_payment",
          amountCents: event.amountCents,
        }),
      };
      if (policy.commissionPlan.timing === "as_earned") {
        next = {
          ...next,
          commissionEntries: [
            ...next.commissionEntries,
            createAccrualEntry(policy, event.sourceEventId, event.amountCents, event.occurredAt),
          ],
        };
      }
      break;
    }

    case "refund_recorded": {
      const policy = assertKnownPolicy(next, event.policyId);
      assertPositiveCents(event.totalRefundedCents, "Cumulative refund");
      const priorTotal = next.refundTotalsCents[event.policyId] ?? 0;
      if (event.totalRefundedCents < priorTotal || event.totalRefundedCents > policy.premiumCents) {
        throw new Error(
          `Refund total must be between ${priorTotal} and ${policy.premiumCents} cents.`,
        );
      }
      const refundDeltaCents = event.totalRefundedCents - priorTotal;
      next = {
        ...next,
        ...appendFinance(next, {
          sourceEventId: event.sourceEventId,
          policyId: event.policyId,
          kind: "refund",
          amountCents: -refundDeltaCents,
          occurredAt: event.occurredAt,
        }),
        refundTotalsCents: {
          ...next.refundTotalsCents,
          [event.policyId]: event.totalRefundedCents,
        },
      };
      if (policy.commissionPlan.reverseOnRefund) {
        const priorAdjustmentsCents = next.commissionEntries
          .filter((entry) => entry.policyId === policy.id && entry.kind === "refund_adjustment")
          .reduce((sum, entry) => sum + entry.amountCents, 0);
        const adjustmentCents = refundCommissionAdjustmentCents(
          policy.commissionPlan,
          commissionableRefundCents(next, policy, event.totalRefundedCents),
          priorAdjustmentsCents,
        );
        if (adjustmentCents !== 0) {
          next = {
            ...next,
            commissionEntries: [
              ...next.commissionEntries,
              ...createRefundAdjustments(
                next,
                policy,
                event.sourceEventId,
                adjustmentCents,
                event.occurredAt,
              ),
            ],
          };
        }
      }
      break;
    }

    case "claim_payment_recorded": {
      assertPositiveCents(event.amountCents, "Claim payment");
      assertKnownPolicy(next, event.policyId);
      next = {
        ...next,
        ...appendFinance(next, {
          ...event,
          kind: "claim_payment",
          amountCents: -event.amountCents,
        }),
      };
      break;
    }

    case "commission_paid": {
      assertKnownPolicy(next, event.policyId);
      const entry = next.commissionEntries.find(
        (candidate) => candidate.id === event.commissionEntryId,
      );
      const projectedEntry = projectCommissionEntries(next.commissionEntries, now).find(
        (candidate) => candidate.id === event.commissionEntryId,
      );
      if (
        !entry ||
        entry.kind === "payment" ||
        entry.policyId !== event.policyId ||
        projectedEntry?.status !== "payable"
      ) {
        throw new Error(`Commission entry is not payable: ${event.commissionEntryId}`);
      }
      next = {
        ...next,
        commissionEntries: [
          ...next.commissionEntries,
          createPaymentEntry(entry, event.sourceEventId, event.occurredAt),
        ],
      };
      break;
    }
  }

  return next;
}
