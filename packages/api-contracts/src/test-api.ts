import type { DomainEvent, DomainState } from "@testbed/domain";
import { applyEvent, emptyDomainState } from "@testbed/domain";

import type {
  ApiError,
  BindQuoteInput,
  CreateCustomerInput,
  CreatePropertyInput,
  CreateQuoteInput,
  Customer,
  PolicyLedger,
  Property,
  RecordFinanceEventInput,
  TestApi,
  TestApiOptions,
  TestApiSnapshot,
  TestSeed,
} from "./contracts";

const defaultNow = "2026-01-01T00:00:00.000Z";

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function error(status: number, code: string, message: string): Response {
  return json({ error: { code, message } } satisfies ApiError, status);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function requiredString(body: JsonRecord, field: string): string | undefined {
  const value = body[field];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requiredNumber(body: JsonRecord, field: string): number | undefined {
  const value = body[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isResponse(value: JsonRecord | Response): value is Response {
  return value instanceof Response;
}

function policyLedger(
  state: DomainState,
  policyId: string,
  auditSourceEventIds: ReadonlySet<string>,
): PolicyLedger | undefined {
  const policy = state.policies[policyId];
  if (!policy) {
    return undefined;
  }
  const quote = state.quotes[policy.quoteId];
  if (!quote) {
    return undefined;
  }
  return {
    policy,
    quote,
    financeEntries: state.financeEntries.filter((entry) => entry.policyId === policyId),
    commissionEntries: state.commissionEntries.filter((entry) => entry.policyId === policyId),
    auditEntries: state.auditEntries.filter((entry) =>
      auditSourceEventIds.has(entry.sourceEventId),
    ),
  };
}

export function createTestApi(seed: TestSeed = {}, options: TestApiOptions = {}): TestApi {
  const now = options.now ?? defaultNow;
  const idPrefix = options.idPrefix ?? "test";
  let nextId = 1;
  let customers = [...(seed.customers ?? [])];
  let properties = [...(seed.properties ?? [])];
  let domain = emptyDomainState();
  const quoteAuditSourceEventIds = new Map<string, Set<string>>();
  const policyAuditSourceEventIds = new Map<string, Set<string>>();

  const addPolicyAuditSource = (policyId: string, sourceEventId: string) => {
    const sourceEventIds = policyAuditSourceEventIds.get(policyId) ?? new Set<string>();
    sourceEventIds.add(sourceEventId);
    policyAuditSourceEventIds.set(policyId, sourceEventIds);
  };
  const associateAuditEvent = (event: DomainEvent) => {
    if (event.type === "quote_created") {
      quoteAuditSourceEventIds.set(event.quote.id, new Set([event.sourceEventId]));
      return;
    }
    if (event.type === "quote_bound") {
      for (const sourceEventId of quoteAuditSourceEventIds.get(event.quoteId) ?? []) {
        addPolicyAuditSource(event.policyId, sourceEventId);
      }
      addPolicyAuditSource(event.policyId, event.sourceEventId);
      return;
    }
    addPolicyAuditSource(event.policyId, event.sourceEventId);
  };

  for (const event of seed.events ?? []) {
    domain = applyEvent(domain, event, now);
    associateAuditEvent(event);
  }

  const createId = (kind: string) => `${idPrefix}-${kind}-${nextId++}`;
  const createEventId = (type: DomainEvent["type"]) => createId(`event-${type}`);
  const snapshot = (): TestApiSnapshot => ({ customers, properties, domain });

  const createCustomer = (body: JsonRecord): Response => {
    const name = requiredString(body, "name");
    const email = requiredString(body, "email");
    if (!name || !email) {
      return error(400, "invalid_customer", "Customer name and email are required.");
    }
    const input = body as CreateCustomerInput;
    const customer: Customer = { id: input.id ?? createId("customer"), name, email };
    if (customers.some((entry) => entry.id === customer.id)) {
      return error(409, "customer_exists", `Customer already exists: ${customer.id}.`);
    }
    customers = [...customers, customer];
    return json(customer, 201);
  };

  const createProperty = (body: JsonRecord): Response => {
    const customerId = requiredString(body, "customerId");
    const addressLine1 = requiredString(body, "addressLine1");
    const city = requiredString(body, "city");
    const state = requiredString(body, "state");
    const postalCode = requiredString(body, "postalCode");
    if (!customerId || !addressLine1 || !city || !state || !postalCode) {
      return error(400, "invalid_property", "Property owner and address fields are required.");
    }
    if (!customers.some((entry) => entry.id === customerId)) {
      return error(404, "customer_not_found", `Unknown customer: ${customerId}.`);
    }
    const input = body as CreatePropertyInput;
    const property: Property = {
      id: input.id ?? createId("property"),
      customerId,
      addressLine1,
      city,
      state,
      postalCode,
    };
    if (properties.some((entry) => entry.id === property.id)) {
      return error(409, "property_exists", `Property already exists: ${property.id}.`);
    }
    properties = [...properties, property];
    return json(property, 201);
  };

  const createQuote = (body: JsonRecord): Response => {
    const customerId = requiredString(body, "customerId");
    const propertyId = requiredString(body, "propertyId");
    const product = requiredString(body, "product");
    const premiumCents = requiredNumber(body, "premiumCents");
    const commissionPlan = body.commissionPlan;
    if (
      !customerId ||
      !propertyId ||
      (product !== "risk_secure" && product !== "risk_secure_plus") ||
      premiumCents === undefined ||
      !isRecord(commissionPlan)
    ) {
      return error(
        400,
        "invalid_quote",
        "Quote customer, property, product, premium, and plan are required.",
      );
    }
    if (!customers.some((entry) => entry.id === customerId)) {
      return error(404, "customer_not_found", `Unknown customer: ${customerId}.`);
    }
    if (!properties.some((entry) => entry.id === propertyId && entry.customerId === customerId)) {
      return error(404, "property_not_found", `Unknown property: ${propertyId}.`);
    }
    const input = body as CreateQuoteInput;
    const quoteId = input.id ?? createId("quote");
    try {
      const event: DomainEvent = {
        type: "quote_created",
        sourceEventId: createEventId("quote_created"),
        occurredAt: now,
        quote: {
          id: quoteId,
          customerId,
          propertyId,
          product,
          premiumCents,
          commissionPlan: input.commissionPlan,
        },
      };
      domain = applyEvent(domain, event, now);
      associateAuditEvent(event);
      return json(domain.quotes[quoteId], 201);
    } catch (cause) {
      return error(400, "invalid_quote", cause instanceof Error ? cause.message : "Invalid quote.");
    }
  };

  const bindQuote = (quoteId: string, body: JsonRecord): Response => {
    if (!domain.quotes[quoteId]) {
      return error(404, "quote_not_found", `Unknown quote: ${quoteId}.`);
    }
    const input = body as BindQuoteInput;
    const policyId = input.policyId ?? createId("policy");
    try {
      const event: DomainEvent = {
        type: "quote_bound",
        sourceEventId: createEventId("quote_bound"),
        occurredAt: now,
        quoteId,
        policyId,
      };
      domain = applyEvent(domain, event, now);
      associateAuditEvent(event);
      return json(domain.policies[policyId], 201);
    } catch (cause) {
      return error(
        409,
        "quote_not_bindable",
        cause instanceof Error ? cause.message : "Quote cannot bind.",
      );
    }
  };

  const recordFinanceEvent = (policyId: string, body: JsonRecord): Response => {
    if (!domain.policies[policyId]) {
      return error(404, "policy_not_found", `Unknown policy: ${policyId}.`);
    }
    const input = body as RecordFinanceEventInput;
    let event: DomainEvent | undefined;
    const sourceEventId = createEventId(
      typeof input.type === "string" ? (input.type as DomainEvent["type"]) : "deposit_recorded",
    );
    if (input.type === "deposit_recorded" && typeof input.amountCents === "number") {
      event = {
        type: input.type,
        sourceEventId,
        occurredAt: now,
        policyId,
        amountCents: input.amountCents,
      };
    }
    if (input.type === "premium_payment_settled" && typeof input.amountCents === "number") {
      event = {
        type: input.type,
        sourceEventId,
        occurredAt: now,
        policyId,
        amountCents: input.amountCents,
      };
    }
    if (input.type === "refund_recorded" && typeof input.totalRefundedCents === "number") {
      event = {
        type: input.type,
        sourceEventId,
        occurredAt: now,
        policyId,
        totalRefundedCents: input.totalRefundedCents,
      };
    }
    if (input.type === "claim_payment_recorded" && typeof input.amountCents === "number") {
      event = {
        type: input.type,
        sourceEventId,
        occurredAt: now,
        policyId,
        amountCents: input.amountCents,
      };
    }
    if (!event) {
      return error(400, "invalid_finance_event", "Unsupported finance event payload.");
    }
    try {
      domain = applyEvent(domain, event, now);
      associateAuditEvent(event);
      return json(
        policyLedger(domain, policyId, policyAuditSourceEventIds.get(policyId) ?? new Set()),
        201,
      );
    } catch (cause) {
      return error(
        400,
        "invalid_finance_event",
        cause instanceof Error ? cause.message : "Invalid finance event.",
      );
    }
  };

  return {
    async handle(request) {
      const url = new URL(request.url, "http://test.local");
      const path = url.pathname;
      const method = request.method.toUpperCase();

      if (method === "GET" && path === "/api/test/state") {
        return json(snapshot());
      }
      if (method === "GET" && path === "/api/customers") {
        return json(customers);
      }
      if (method === "POST" && path === "/api/customers") {
        const body = await requestBody(request);
        return isResponse(body) ? body : createCustomer(body);
      }
      if (method === "GET" && path === "/api/properties") {
        return json(properties);
      }
      if (method === "POST" && path === "/api/properties") {
        const body = await requestBody(request);
        return isResponse(body) ? body : createProperty(body);
      }
      if (method === "GET" && path === "/api/quotes") {
        return json(Object.values(domain.quotes));
      }
      if (method === "POST" && path === "/api/quotes") {
        const body = await requestBody(request);
        return isResponse(body) ? body : createQuote(body);
      }

      const bindMatch = path.match(/^\/api\/quotes\/([^/]+)\/bind$/);
      if (method === "POST" && bindMatch) {
        const body = await requestBody(request);
        return isResponse(body) ? body : bindQuote(decodeURIComponent(bindMatch[1]), body);
      }
      if (method === "GET" && path === "/api/policies") {
        return json(Object.values(domain.policies));
      }

      const ledgerMatch = path.match(/^\/api\/policies\/([^/]+)\/ledger$/);
      if (method === "GET" && ledgerMatch) {
        const policyId = decodeURIComponent(ledgerMatch[1]);
        const ledger = policyLedger(
          domain,
          policyId,
          policyAuditSourceEventIds.get(policyId) ?? new Set(),
        );
        return ledger
          ? json(ledger)
          : error(
              404,
              "policy_not_found",
              `Unknown policy: ${decodeURIComponent(ledgerMatch[1])}.`,
            );
      }
      const financeMatch = path.match(/^\/api\/policies\/([^/]+)\/finance-events$/);
      if (method === "POST" && financeMatch) {
        const body = await requestBody(request);
        return isResponse(body)
          ? body
          : recordFinanceEvent(decodeURIComponent(financeMatch[1]), body);
      }
      const policyMatch = path.match(/^\/api\/policies\/([^/]+)$/);
      if (method === "GET" && policyMatch) {
        const policy = domain.policies[decodeURIComponent(policyMatch[1])];
        return policy
          ? json(policy)
          : error(
              404,
              "policy_not_found",
              `Unknown policy: ${decodeURIComponent(policyMatch[1])}.`,
            );
      }

      return error(404, "route_not_found", `No Test API route matches ${method} ${path}.`);
    },
  };
}
