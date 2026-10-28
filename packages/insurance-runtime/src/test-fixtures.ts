import { createInMemoryServiceBus } from "@testbed/service-bus";
import type { RuntimeCommand, RuntimeSeed } from "./runtime";
export const runtimeSeed = {
  tenants: ["tenant-a", "tenant-b"],
  customers: [{ tenantId: "tenant-a", id: "customer", name: "Alex", email: "alex@example.test" }],
  properties: [
    {
      tenantId: "tenant-a",
      id: "property",
      customerId: "customer",
      addressLine1: "1 Main",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
    },
  ],
} satisfies RuntimeSeed;
export const quoteCommand = {
  type: "create_quote",
  schemaVersion: 1,
  tenantId: "tenant-a",
  commandId: "quote-command",
  correlationId: "workflow",
  quoteId: "quote",
  customerId: "customer",
  propertyId: "property",
  product: "risk_secure",
  premiumCents: 10_000,
  commissionPlan: {
    timing: "on_bind",
    rateBasisPoints: 1000,
    holdPeriodDays: 0,
    reverseOnRefund: true,
  },
} satisfies RuntimeCommand;
export const bindCommand = {
  type: "bind_quote",
  schemaVersion: 1,
  tenantId: "tenant-a",
  commandId: "bind-command",
  correlationId: "workflow",
  quoteId: "quote",
  policyId: "policy",
} satisfies RuntimeCommand;
export function failFinanceOnce() {
  const bus = createInMemoryServiceBus();
  const subscribe = bus.subscribe.bind(bus);
  let failed = false;
  bus.subscribe = (consumerId, eventType, handler) =>
    subscribe(consumerId, eventType, (message) => {
      if (consumerId === "finance-policy-state" && !failed) {
        failed = true;
        throw new Error("Transient Finance delivery failure");
      }
      handler(message);
    });
  return bus;
}
