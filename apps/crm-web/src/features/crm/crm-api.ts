import type {
  BindQuoteInput,
  CreateCustomerInput,
  CreatePropertyInput,
  CreateQuoteInput,
  Customer,
  PolicyLedger,
  Property,
  RecordFinanceEventInput,
} from "@testbed/api-contracts";
import { http } from "@/lib/http";

const post = <T>(path: string, body: unknown) =>
  http<T>(path, { method: "POST", body: JSON.stringify(body) });

export const getCustomers = () => http<Customer[]>("/api/customers");
export const createCustomer = (input: CreateCustomerInput) =>
  post<Customer>("/api/customers", input);

export const getProperties = () => http<Property[]>("/api/properties");
export const createProperty = (input: CreatePropertyInput) =>
  post<Property>("/api/properties", input);

export const getQuotes = () => http<QuoteSummary[]>("/api/quotes");
export const createQuote = (input: CreateQuoteInput) => post<QuoteSummary>("/api/quotes", input);
export const bindQuote = (quoteId: string, input: BindQuoteInput = {}) =>
  post<PolicySummary>(`/api/quotes/${quoteId}/bind`, input);

export const getPolicies = () => http<PolicySummary[]>("/api/policies");
export const getPolicyLedger = (policyId: string) =>
  http<PolicyLedger>(`/api/policies/${policyId}/ledger`);
export const recordFinanceEvent = (policyId: string, input: RecordFinanceEventInput) =>
  post<PolicyLedger>(`/api/policies/${policyId}/finance-events`, input);

export type QuoteSummary = {
  id: string;
  customerId: string;
  propertyId: string;
  product: "risk_secure" | "risk_secure_plus";
  premiumCents: number;
  commissionPlan: {
    timing: "on_bind" | "as_earned";
    rateBasisPoints: number;
    holdPeriodDays: number;
    reverseOnRefund: boolean;
  };
  status: "quoted" | "bound";
};

export type PolicySummary = QuoteSummary & {
  quoteId: string;
  boundAt: string;
  status: "bound";
};
