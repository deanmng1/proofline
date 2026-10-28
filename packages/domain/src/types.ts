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

export type AuditEntry = {
  sourceEventId: string;
  type: DomainEvent["type"];
  occurredAt: string;
  commissionEntryId?: string;
};

export type DomainState = {
  quotes: Record<string, Quote>;
  policies: Record<string, Policy>;
  financeEntries: FinanceEntry[];
  commissionEntries: CommissionEntry[];
  auditEntries: AuditEntry[];
  processedSourceEventIds: string[];
  refundTotalsCents: Record<string, number>;
};

export type QuoteCreatedEvent = {
  type: "quote_created";
  sourceEventId: string;
  occurredAt: string;
  quote: Omit<Quote, "createdAt" | "status">;
};

export type QuoteBoundEvent = {
  type: "quote_bound";
  sourceEventId: string;
  occurredAt: string;
  quoteId: string;
  policyId: string;
};

export type DepositRecordedEvent = {
  type: "deposit_recorded";
  sourceEventId: string;
  occurredAt: string;
  policyId: string;
  amountCents: number;
};

export type PremiumPaymentSettledEvent = {
  type: "premium_payment_settled";
  sourceEventId: string;
  occurredAt: string;
  policyId: string;
  amountCents: number;
};

export type RefundRecordedEvent = {
  type: "refund_recorded";
  sourceEventId: string;
  occurredAt: string;
  policyId: string;
  totalRefundedCents: number;
};

export type ClaimPaymentRecordedEvent = {
  type: "claim_payment_recorded";
  sourceEventId: string;
  occurredAt: string;
  policyId: string;
  amountCents: number;
};

export type CommissionPaidEvent = {
  type: "commission_paid";
  sourceEventId: string;
  occurredAt: string;
  policyId: string;
  commissionEntryId: string;
};

export type DomainEvent =
  | QuoteCreatedEvent
  | QuoteBoundEvent
  | DepositRecordedEvent
  | PremiumPaymentSettledEvent
  | RefundRecordedEvent
  | ClaimPaymentRecordedEvent
  | CommissionPaidEvent;

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
  policyId: string;
  amountCents: number;
};

export type FinancePremiumPaymentSettledMessage = {
  type: "finance.premium.payment.settled";
  policyId: string;
  amountCents: number;
};

export type FinanceRefundRecordedMessage = {
  type: "finance.refund.recorded";
  policyId: string;
  allocations: RefundAllocation[];
};

export type FinanceClaimPaymentRecordedMessage = {
  type: "finance.claim.payment.recorded";
  policyId: string;
  amountCents: number;
};

export type FinanceCommissionPaidMessage = {
  type: "finance.commission.paid";
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

export type EventEnvelope<TEvent extends ServiceEvent = ServiceEvent> = {
  messageId: string;
  correlationId: string;
  causationId?: string;
  tenantId: string;
  schemaVersion: number;
  occurredAt: string;
  event: TEvent;
};
