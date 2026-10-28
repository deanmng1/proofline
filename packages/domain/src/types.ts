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
};

export type AuditEntry = {
  sourceEventId: string;
  type: DomainEvent["type"];
  occurredAt: string;
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
