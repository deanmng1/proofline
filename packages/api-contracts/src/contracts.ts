import type { CommissionPlan, PolicyLifecycle, Product, RefundAllocation } from "@testbed/domain";
import type {
  Customer,
  PolicyLedger,
  Property,
  RuntimeOptions,
  RuntimeSeed,
  RuntimeSnapshot,
} from "@testbed/insurance-runtime";

export type { Customer, PolicyLedger, PolicyLifecycle, Property };
export type TestSeed = RuntimeSeed;
export type TestApiRole = "Owner" | "Admin" | "Manager" | "Viewer";
export type TestApiAuthorityClaims = {
  subject: string;
  role: TestApiRole;
  tenantIds: readonly string[];
};
export type TestApiOperation =
  | "tenant.list"
  | "state.read"
  | "customer.read"
  | "customer.create"
  | "property.read"
  | "property.create"
  | "quote.read"
  | "quote.create"
  | "quote.bind"
  | "policy.read"
  | "policy.lifecycle"
  | "policy.finance";
export type TestApiAuthorityRequest = {
  bearerToken: string | null;
  tenantId: string;
  method: string;
  path: string;
  operation: TestApiOperation;
  mutation: boolean;
};
export type TestApiAuthorityDecision =
  | { allowed: true; claims: TestApiAuthorityClaims }
  | { allowed: false; code: "unauthenticated" | "cross_tenant" | "role_forbidden" };
export type TestApiAuthorityPort = {
  authorize(
    request: TestApiAuthorityRequest,
  ): TestApiAuthorityDecision | Promise<TestApiAuthorityDecision>;
};
export type TestApiOptions = RuntimeOptions & { authority: TestApiAuthorityPort };
export type TestApiSnapshot = RuntimeSnapshot;
export type TestApi = { handle(request: Request): Promise<Response> };
export type CommandIdentity = { commandId: string; correlationId: string };
export type CreateCustomerInput = CommandIdentity &
  Omit<Customer, "id" | "tenantId"> & { id?: string };
export type CreatePropertyInput = CommandIdentity &
  Omit<Property, "id" | "tenantId"> & { id?: string };
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
