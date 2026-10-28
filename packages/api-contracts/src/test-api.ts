import { isCommissionPlan } from "@testbed/domain";
import type { RuntimeCommand } from "@testbed/insurance-runtime";
import { createInsuranceRuntime, RuntimeError } from "@testbed/insurance-runtime";
import type {
  ApiError,
  CreateCustomerInput,
  CreatePropertyInput,
  CreateQuoteInput,
  RecordFinanceEventInput,
  TestApi,
  TestApiOptions,
  TestSeed,
} from "./contracts";

type JsonRecord = Record<string, unknown>;
const json = (body: unknown, status = 200) => Response.json(body, { status });
const error = (status: number, code: string, message: string, recoverable?: boolean) =>
  json(
    { error: { code, message, ...(recoverable ? { recoverable } : {}) } } satisfies ApiError,
    status,
  );
const string = (body: JsonRecord, key: string) =>
  typeof body[key] === "string" && body[key].trim() ? (body[key] as string) : undefined;
const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
async function requestBody(request: Request): Promise<JsonRecord | Response> {
  try {
    const body: unknown = await request.json();
    return isRecord(body)
      ? body
      : error(400, "invalid_request", "Request body must be a JSON object.");
  } catch {
    return error(400, "invalid_json", "Request body must be valid JSON.");
  }
}
export function createTestApi(seed: TestSeed = {}, options: TestApiOptions = {}): TestApi {
  const runtime = createInsuranceRuntime(seed, options);
  return {
    async handle(request) {
      const tenantId = request.headers.get("X-Tenant-Id")?.trim();
      if (!tenantId) return error(400, "tenant_required", "X-Tenant-Id is required.");
      try {
        runtime.requireTenant(tenantId);
        const path = new URL(request.url).pathname;
        const method = request.method.toUpperCase();
        if (method === "GET") {
          if (path === "/api/test/state") return json(runtime.snapshot(tenantId));
          if (path === "/api/customers") return json(runtime.snapshot(tenantId).customers);
          if (path === "/api/properties") return json(runtime.snapshot(tenantId).properties);
          if (path === "/api/quotes") return json(runtime.snapshot(tenantId).policy.quotes);
          if (path === "/api/policies") return json(runtime.snapshot(tenantId).policy.policies);
          const match = path.match(/^\/api\/policies\/([^/]+)(\/ledger)?$/);
          if (match) {
            const id = decodeURIComponent(match[1]);
            const value = match[2]
              ? runtime.getLedger(tenantId, id)
              : runtime.getPolicy(tenantId, id);
            return value ? json(value) : error(404, "policy_not_found", "Unknown policy.");
          }
        }
        if (method === "POST") {
          const body = await requestBody(request);
          if (body instanceof Response) return body;
          if ("tenantId" in body)
            return error(
              400,
              "invalid_request",
              "Tenant context must be supplied only in X-Tenant-Id.",
            );
          for (const key of ["id", "policyId"] as const)
            if (key in body && !string(body, key))
              return error(400, "invalid_request", `${key} must be a nonempty string.`);
          if (path === "/api/customers")
            return json(runtime.createCustomer(tenantId, body as CreateCustomerInput), 201);
          if (path === "/api/properties")
            return json(runtime.createProperty(tenantId, body as CreatePropertyInput), 201);
          const commandId = string(body, "commandId");
          const correlationId = string(body, "correlationId");
          if (!commandId || !correlationId)
            return error(400, "invalid_request", "commandId and correlationId are required.");
          const metadata = { schemaVersion: 1 as const, commandId, correlationId, tenantId };
          if (path === "/api/quotes") {
            if (
              !string(body, "customerId") ||
              !string(body, "propertyId") ||
              (body.product !== "risk_secure" && body.product !== "risk_secure_plus") ||
              typeof body.premiumCents !== "number" ||
              !isCommissionPlan(body.commissionPlan)
            )
              return error(
                400,
                "invalid_quote",
                "Quote customer, property, product, premium, and plan are required.",
              );
            const input = body as CreateQuoteInput;
            const result = runtime.execute({
              ...metadata,
              type: "create_quote",
              quoteId: input.id,
              customerId: input.customerId,
              propertyId: input.propertyId,
              product: input.product,
              premiumCents: input.premiumCents,
              commissionPlan: input.commissionPlan,
            });
            return json(result, 201);
          }
          const bind = path.match(/^\/api\/quotes\/([^/]+)\/bind$/);
          if (bind) {
            const quoteId = decodeURIComponent(bind[1]);
            if (!runtime.getQuote(tenantId, quoteId))
              return error(404, "quote_not_found", "Unknown quote.");
            return json(
              runtime.execute({
                ...metadata,
                type: "bind_quote",
                quoteId,
                policyId: string(body, "policyId"),
              }),
              201,
            );
          }
          const transition = path.match(/^\/api\/policies\/([^/]+)\/lifecycle$/);
          if (transition) {
            if (body.lifecycle !== "cancelled")
              return error(400, "invalid_lifecycle", "Only cancellation is supported.");
            const policyId = decodeURIComponent(transition[1]);
            if (!runtime.getPolicy(tenantId, policyId))
              return error(404, "policy_not_found", "Unknown policy.");
            runtime.execute({
              ...metadata,
              type: "transition_policy",
              policyId,
              lifecycle: "cancelled",
            });
            return json(runtime.getLedger(tenantId, policyId), 201);
          }
          const finance = path.match(/^\/api\/policies\/([^/]+)\/finance-events$/);
          if (finance) {
            const policyId = decodeURIComponent(finance[1]);
            if (!runtime.getPolicy(tenantId, policyId))
              return error(404, "policy_not_found", "Unknown policy.");
            const input = body as RecordFinanceEventInput;
            let command: RuntimeCommand;
            if (input.type === "refund_recorded") {
              if (
                !Array.isArray(input.allocations) ||
                input.allocations.some(
                  (a) =>
                    !isRecord(a) ||
                    !string(a, "allocationId") ||
                    !string(a, "financeEntryId") ||
                    typeof a.amountCents !== "number",
                )
              )
                return error(400, "invalid_finance_event", "Refund allocations are required.");
              command = { ...metadata, type: input.type, policyId, allocations: input.allocations };
            } else if (input.type === "commission_paid") {
              if (!string(body, "commissionEntryId"))
                return error(400, "invalid_finance_event", "Commission entry is required.");
              command = {
                ...metadata,
                type: input.type,
                policyId,
                commissionEntryId: input.commissionEntryId,
              };
            } else if (
              ["deposit_recorded", "premium_payment_settled", "claim_payment_recorded"].includes(
                input.type,
              ) &&
              "amountCents" in input &&
              typeof input.amountCents === "number"
            ) {
              command = { ...metadata, type: input.type, policyId, amountCents: input.amountCents };
            } else return error(400, "invalid_finance_event", "Unsupported finance event payload.");
            runtime.execute(command);
            return json(runtime.getLedger(tenantId, policyId), 201);
          }
        }
        return error(404, "route_not_found", `No Test API route matches ${method} ${path}.`);
      } catch (cause) {
        if (cause instanceof RuntimeError)
          return error(cause.status, cause.code, cause.message, cause.recoverable);
        return error(
          400,
          "invalid_command",
          cause instanceof Error ? cause.message : "Invalid command.",
        );
      }
    },
  };
}
