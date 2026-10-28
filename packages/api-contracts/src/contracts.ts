import type { CommissionPlan, Product, RefundAllocation } from "@testbed/domain";
import type {
  Customer,
  PolicyLedger,
  Property,
  RuntimeOptions,
  RuntimeSeed,
  RuntimeSnapshot,
} from "@testbed/insurance-runtime";

export type { Customer, PolicyLedger, Property };
export type TestSeed = RuntimeSeed;
export type TestApiOptions = RuntimeOptions;
export type TestApiSnapshot = RuntimeSnapshot;
export type TestApi = { handle(request: Request): Promise<Response> };
export type CreateCustomerInput = Omit<Customer, "id" | "tenantId"> & { id?: string };
export type CreatePropertyInput = Omit<Property, "id" | "tenantId"> & { id?: string };
export type CommandIdentity = { commandId: string; correlationId: string };
export type CreateQuoteInput = CommandIdentity & {
  id?: string;
  customerId: string;
  propertyId: string;
  product: Product;
  premiumCents: number;
  commissionPlan: CommissionPlan;
};
export type BindQuoteInput = CommandIdentity & { policyId?: string };
export type TransitionPolicyInput = CommandIdentity & { lifecycle: "cancelled" };
export type RecordFinanceEventInput = CommandIdentity &
  (
    | {
        type: "deposit_recorded" | "premium_payment_settled" | "claim_payment_recorded";
        amountCents: number;
      }
    | { type: "refund_recorded"; allocations: RefundAllocation[] }
    | { type: "commission_paid"; commissionEntryId: string }
  );
export type ApiError = { error: { code: string; message: string; recoverable?: boolean } };
