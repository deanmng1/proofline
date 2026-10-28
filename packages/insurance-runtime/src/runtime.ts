import type { EventEnvelope, Policy, PolicyStateProjection, Quote } from "@testbed/domain";
import { assertUtcTimestamp } from "@testbed/domain";
import {
  type AmountCommand,
  type CommissionPaymentCommand,
  createFinanceService,
  type FinanceAuditEntry,
  type FinanceLedger,
  type RefundCommand,
} from "@testbed/finance-service";
import {
  type BindQuoteCommand,
  type CreateQuoteCommand,
  createPolicyService,
  type PolicyReferenceData,
  type TransitionPolicyCommand,
} from "@testbed/policy-service";
import { createPolicyStateService } from "@testbed/policy-state-service";
import {
  createInMemoryServiceBus,
  type DeliveryRecord,
  type ServiceBus,
} from "@testbed/service-bus";

export type Customer = { tenantId: string; id: string; name: string; email: string };
export type Property = {
  tenantId: string;
  id: string;
  customerId: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
};
type CommandMetadata = { schemaVersion: 1; occurredAt?: string; correlationId: string };
export type RuntimeCommand = CommandMetadata &
  (
    | ({ type: "create_quote" } & CreateQuoteCommand)
    | ({ type: "bind_quote" } & BindQuoteCommand)
    | ({ type: "transition_policy" } & TransitionPolicyCommand)
    | ({
        type: "deposit_recorded" | "premium_payment_settled" | "claim_payment_recorded";
      } & AmountCommand)
    | ({ type: "refund_recorded" } & RefundCommand)
    | ({ type: "commission_paid" } & CommissionPaymentCommand)
  );
export type RuntimeSeed = {
  tenants?: string[];
  customers?: Customer[];
  properties?: Property[];
  commands?: RuntimeCommand[];
};
export type RuntimeOptions = { now?: string; idPrefix?: string; busFactory?: () => ServiceBus };
export type PolicyLedger = FinanceLedger & {
  policy: Policy;
  quote: Quote;
  policyStateTimeline: PolicyStateProjection[];
  messages: EventEnvelope[];
  deliveries: DeliveryRecord[];
};
export type RuntimeSnapshot = {
  customers: Customer[];
  properties: Property[];
  policy: { quotes: Quote[]; policies: Policy[] };
  policyState: { timelines: Record<string, PolicyStateProjection[]> };
  finance: { ledgers: FinanceLedger[] };
  messages: EventEnvelope[];
  deliveries: DeliveryRecord[];
  pendingMessages: EventEnvelope[];
};
export class RuntimeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly recoverable = false,
  ) {
    super(message);
  }
}
export type InsuranceRuntime = ReturnType<typeof createInsuranceRuntime>;
const clone = <T>(value: T): T => structuredClone(value);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const required = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim())
    throw new RuntimeError("invalid_request", `${label} is required.`);
};
const validTime = (value: string) => {
  try {
    return assertUtcTimestamp(value);
  } catch {
    throw new RuntimeError("invalid_request", "A valid ISO-UTC timestamp is required.");
  }
};
export function createInsuranceRuntime(seed: RuntimeSeed = {}, options: RuntimeOptions = {}) {
  const tenants = new Set(seed.tenants ?? ["test-tenant"]);
  const requireTenant = (tenantId: string) => {
    required(tenantId, "Tenant ID");
    if (!tenants.has(tenantId)) throw new RuntimeError("unknown_tenant", "Unknown tenant.", 403);
  };
  let sequence = 0;
  const ids = { next: (kind: string) => `${options.idPrefix ?? "test"}-${kind}-${++sequence}` };
  const currentTime = validTime(options.now ?? "2026-01-01T00:00:00.000Z");
  let commandTime = currentTime;
  const customers = clone(seed.customers ?? []);
  const properties = clone(seed.properties ?? []);
  for (const row of [...customers, ...properties]) requireTenant(row.tenantId);
  const messages: EventEnvelope[] = [];
  const transport = (options.busFactory ?? createInMemoryServiceBus)();
  const bus: ServiceBus = {
    ...transport,
    publish(message) {
      transport.publish(message);
      messages.push(clone(message));
    },
  };
  const referenceData: PolicyReferenceData = {
    ownsProperty: ({ tenantId, customerId, propertyId }) =>
      customers.some((c) => c.tenantId === tenantId && c.id === customerId) &&
      properties.some(
        (p) => p.tenantId === tenantId && p.id === propertyId && p.customerId === customerId,
      ),
  };
  const policy = createPolicyService({
    bus,
    clock: () => commandTime,
    ids,
    referenceData,
  });
  const policyState = createPolicyStateService({ bus });
  const finance = createFinanceService({ bus, now: () => commandTime });
  const receipts = new Map<string, { fingerprint: string; result: unknown }>();
  const drain = () => {
    try {
      bus.drain();
    } catch (cause) {
      throw new RuntimeError(
        "delivery_pending",
        `Event delivery is pending: ${cause instanceof Error ? cause.message : String(cause)}`,
        409,
        true,
      );
    }
  };
  const execute = (input: RuntimeCommand): unknown => {
    const command = clone(input);
    requireTenant(command.tenantId);
    required(command.commandId, "Command ID");
    required(command.correlationId, "Correlation ID");
    if (command.schemaVersion !== 1)
      throw new RuntimeError("invalid_schema", "Only command schema version 1 is supported.");
    // Reject foreign reference data before either the replay or new-command path drains.
    // Policy still validates the same ownership rule at its own command boundary.
    if (command.type === "create_quote" && !referenceData.ownsProperty(command))
      throw new RuntimeError(
        "invalid_quote",
        "Property is not owned by the customer in this tenant.",
      );
    const fingerprint = canonical(command);
    const key = JSON.stringify([command.tenantId, command.commandId]);
    const previous = receipts.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new RuntimeError(
          "command_conflict",
          "Command ID was already used with different input.",
          409,
        );
      drain();
      return clone(previous.result);
    }
    commandTime = validTime(command.occurredAt ?? currentTime);
    try {
      // A pending earlier event must settle before accepting another command against its projections.
      drain();
      let result: unknown;
      switch (command.type) {
        case "create_quote":
          result = policy.createQuote(command);
          break;
        case "bind_quote":
          result = policy.bindQuote(command);
          break;
        case "transition_policy":
          result = policy.transitionPolicy(command);
          break;
        case "deposit_recorded":
          result = finance.recordDeposit(command);
          break;
        case "premium_payment_settled":
          result = finance.settlePremiumPayment(command);
          break;
        case "claim_payment_recorded":
          result = finance.recordClaimPayment(command);
          break;
        case "refund_recorded":
          result = finance.recordRefund(command);
          break;
        case "commission_paid":
          result = finance.payCommission(command);
          break;
        default:
          throw new RuntimeError("invalid_command", "Unsupported runtime command.");
      }
      // Commit the command receipt before delivery: a failed consumer must never repeat the mutation.
      receipts.set(key, { fingerprint, result: clone(result) });
      drain();
      return clone(result);
    } finally {
      commandTime = currentTime;
    }
  };
  const tenantMessages = (tenantId: string) => messages.filter((m) => m.tenantId === tenantId);
  const deliveryRecords = (selected: EventEnvelope[]) => {
    const ids = new Set(selected.map((m) => m.messageId));
    return bus.deliveryLog().filter((d) => ids.has(d.messageId));
  };
  const quotesFor = (tenantId: string) =>
    tenantMessages(tenantId).flatMap((m) => {
      const quote =
        m.event.type === "policy.quote.created"
          ? policy.getQuote(tenantId, m.event.quote.id)
          : undefined;
      return quote ? [quote] : [];
    });
  const policiesFor = (tenantId: string) => {
    const ids = new Set(
      tenantMessages(tenantId).flatMap((m) =>
        m.event.type === "policy.lifecycle.changed" ? [m.event.policy.id] : [],
      ),
    );
    return [...ids].flatMap((id) => {
      const found = policy.getPolicy(tenantId, id);
      return found ? [found] : [];
    });
  };
  const getLedger = (tenantId: string, policyId: string): PolicyLedger | undefined => {
    requireTenant(tenantId);
    const facts = policy.getPolicy(tenantId, policyId);
    const ledger = finance.getLedger(tenantId, policyId);
    if (!facts || !ledger) return undefined;
    const quote = policy.getQuote(tenantId, facts.quoteId);
    if (!quote) return undefined;
    const selected = tenantMessages(tenantId).filter((m) => {
      const event = m.event;
      if (event.type === "policy.quote.created") return event.quote.id === facts.quoteId;
      if (event.type === "policy.lifecycle.changed") return event.policy.id === policyId;
      if (event.type === "policy.state.changed") return event.state.policyId === policyId;
      return event.policyId === policyId;
    });
    const auditEntries: FinanceAuditEntry[] = selected.map((m) => ({
      sourceEventId: m.messageId,
      correlationId: m.correlationId,
      causationId: m.causationId,
      tenantId: m.tenantId,
      type: m.event.type,
      occurredAt: m.occurredAt,
      ...(m.event.type === "finance.commission.paid"
        ? { commissionEntryId: m.event.commissionEntryId }
        : {}),
    }));
    return clone({
      ...ledger,
      policy: facts,
      quote,
      commissionEntries: finance.getCommissionEntries(tenantId, policyId),
      auditEntries,
      policyStateTimeline: policyState.getPolicyStateTimeline(tenantId, policyId),
      messages: selected,
      deliveries: deliveryRecords(selected),
    });
  };
  const snapshot = (tenantId: string): RuntimeSnapshot => {
    requireTenant(tenantId);
    const policies = policiesFor(tenantId);
    const selected = tenantMessages(tenantId);
    return clone({
      customers: customers.filter((c) => c.tenantId === tenantId),
      properties: properties.filter((p) => p.tenantId === tenantId),
      policy: { quotes: quotesFor(tenantId), policies },
      policyState: {
        timelines: Object.fromEntries(
          policies.map((p) => [p.id, policyState.getPolicyStateTimeline(tenantId, p.id)]),
        ),
      },
      finance: {
        ledgers: policies.flatMap((p) => {
          const ledger = finance.getLedger(tenantId, p.id);
          return ledger
            ? [{ ...ledger, commissionEntries: finance.getCommissionEntries(tenantId, p.id) }]
            : [];
        }),
      },
      messages: selected,
      deliveries: deliveryRecords(selected),
      pendingMessages: bus.pendingMessages().filter((m) => m.tenantId === tenantId),
    });
  };
  for (const command of seed.commands ?? []) execute(command);
  return {
    requireTenant,
    execute,
    snapshot,
    getLedger,
    getQuote(tenantId: string, id: string) {
      requireTenant(tenantId);
      return clone(policy.getQuote(tenantId, id));
    },
    getPolicy(tenantId: string, id: string) {
      requireTenant(tenantId);
      return clone(policy.getPolicy(tenantId, id));
    },
    createCustomer(tenantId: string, input: Omit<Customer, "tenantId" | "id"> & { id?: string }) {
      requireTenant(tenantId);
      required(input.name, "Customer name");
      required(input.email, "Email");
      const row = { ...clone(input), tenantId, id: input.id ?? ids.next("customer") };
      if (customers.some((c) => c.tenantId === tenantId && c.id === row.id))
        throw new RuntimeError("customer_exists", "Customer already exists.", 409);
      customers.push(row);
      return clone(row);
    },
    createProperty(tenantId: string, input: Omit<Property, "tenantId" | "id"> & { id?: string }) {
      requireTenant(tenantId);
      for (const field of ["customerId", "addressLine1", "city", "state", "postalCode"] as const)
        required(input[field], field);
      if (!customers.some((c) => c.tenantId === tenantId && c.id === input.customerId))
        throw new RuntimeError("customer_not_found", "Unknown customer.", 404);
      const row = { ...clone(input), tenantId, id: input.id ?? ids.next("property") };
      if (properties.some((p) => p.tenantId === tenantId && p.id === row.id))
        throw new RuntimeError("property_exists", "Property already exists.", 409);
      properties.push(row);
      return clone(row);
    },
  };
}
