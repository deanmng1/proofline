import type {
  CommissionPlan,
  DomainEvent,
  DomainState,
  Policy,
  Product,
  Quote,
} from "@testbed/domain";

export type Customer = {
  id: string;
  name: string;
  email: string;
};

export type Property = {
  id: string;
  customerId: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
};

export type TestSeed = {
  customers?: Customer[];
  properties?: Property[];
  events?: DomainEvent[];
};

export type TestApiOptions = {
  idPrefix?: string;
  now?: string;
};

export type TestApiSnapshot = {
  customers: Customer[];
  properties: Property[];
  domain: DomainState;
};

export type TestApi = {
  handle(request: Request): Promise<Response>;
};

export type CreateCustomerInput = Omit<Customer, "id"> & { id?: string };
export type CreatePropertyInput = Omit<Property, "id"> & { id?: string };

export type CreateQuoteInput = {
  id?: string;
  customerId: string;
  propertyId: string;
  product: Product;
  premiumCents: number;
  commissionPlan: CommissionPlan;
};

export type BindQuoteInput = {
  policyId?: string;
};

export type RecordFinanceEventInput =
  | { type: "deposit_recorded"; amountCents: number }
  | { type: "premium_payment_settled"; amountCents: number }
  | { type: "refund_recorded"; totalRefundedCents: number }
  | { type: "claim_payment_recorded"; amountCents: number };

export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

export type PolicyLedger = {
  policy: Policy;
  quote: Quote;
  financeEntries: DomainState["financeEntries"];
  commissionEntries: DomainState["commissionEntries"];
  auditEntries: DomainState["auditEntries"];
};
