import type { DeepReadonly } from "./snapshot";

export type Product = "risk_secure" | "risk_secure_plus";

export type CommissionTiming = "on_bind" | "as_earned";

export type CommissionPlan = {
  timing: CommissionTiming;
  rateBasisPoints: number;
  holdPeriodDays: number;
  reverseOnRefund: boolean;
};

export type Quote = {
  id: string;
  customerId: string;
  propertyId: string;
  product: Product;
  premiumCents: number;
  commissionPlan: CommissionPlan;
  createdAt: string;
  status: "quoted" | "bound";
};

export type Policy = Omit<Quote, "createdAt" | "status"> & {
  quoteId: string;
  boundAt: string;
  status: "bound";
};

export type FinanceEntryKind = "deposit" | "premium_payment" | "refund" | "claim_payment";

export type FinanceEntry = {
  id: string;
  sourceEventId: string;
  policyId: string;
  kind: FinanceEntryKind;
  amountCents: number;
  occurredAt: string;
};

export type CommissionEntryKind = "accrual" | "refund_adjustment" | "payment";

export type CommissionStatus = "earned" | "payable" | "paid";

export type CommissionEntry = {
  id: string;
  sourceEventId: string;
  policyId: string;
  kind: CommissionEntryKind;
  amountCents: number;
  status: CommissionStatus;
  earnedAt: string;
  payableAt: string;
  paidAt?: string;
  reversesCommissionEntryId?: string;
  settlesCommissionEntryId?: string;
};

export type PolicyLifecycle = "bound" | "cancelled";

export type PolicyStateProjection = {
  policyId: string;
  lifecycle: PolicyLifecycle;
  revision: number;
  product: Product;
  premiumCents: number;
  commissionPlan: CommissionPlan;
  sourcePolicyMessageId: string;
};

export type RefundAllocation = {
  allocationId: string;
  financeEntryId: string;
  amountCents: number;
};

export type PolicyQuoteCreatedMessage = {
  type: "policy.quote.created";
  quote: Quote;
};

export type PolicyLifecycleChangedMessage = {
  type: "policy.lifecycle.changed";
  policy: Policy;
  lifecycle: PolicyLifecycle;
  revision: number;
};

export type PolicyStateChangedMessage = {
  type: "policy.state.changed";
  state: PolicyStateProjection;
};

export type FinanceDepositRecordedMessage = {
  type: "finance.deposit.recorded";
  commandId: string;
  policyId: string;
  amountCents: number;
};

export type FinancePremiumPaymentSettledMessage = {
  type: "finance.premium.payment.settled";
  commandId: string;
  policyId: string;
  amountCents: number;
};

export type FinanceRefundRecordedMessage = {
  type: "finance.refund.recorded";
  commandId: string;
  policyId: string;
  allocations: RefundAllocation[];
};

export type FinanceClaimPaymentRecordedMessage = {
  type: "finance.claim.payment.recorded";
  commandId: string;
  policyId: string;
  amountCents: number;
};

export type FinanceCommissionPaidMessage = {
  type: "finance.commission.paid";
  commandId: string;
  policyId: string;
  commissionEntryId: string;
};

export type ServiceEvent =
  | PolicyQuoteCreatedMessage
  | PolicyLifecycleChangedMessage
  | PolicyStateChangedMessage
  | FinanceDepositRecordedMessage
  | FinancePremiumPaymentSettledMessage
  | FinanceRefundRecordedMessage
  | FinanceClaimPaymentRecordedMessage
  | FinanceCommissionPaidMessage;

export type EventEnvelope<TEvent extends ServiceEvent = ServiceEvent> = DeepReadonly<{
  messageId: string;
  correlationId: string;
  causationId?: string;
  tenantId: string;
  schemaVersion: number;
  occurredAt: string;
  event: TEvent;
}>;
