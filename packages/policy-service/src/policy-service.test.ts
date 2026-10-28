import { createInMemoryServiceBus } from "@testbed/service-bus";
import { describe, expect, test } from "vitest";

import { createPolicyService } from "./policy-service";

const command = {
  correlationId: "workflow-1",
  tenantId: "tenant-test",
  customerId: "customer-1",
  propertyId: "property-1",
  product: "risk_secure" as const,
  premiumCents: 10_000,
  commissionPlan: {
    timing: "on_bind" as const,
    rateBasisPoints: 1_000,
    holdPeriodDays: 0,
    reverseOnRefund: true,
  },
};

const createService = () => {
  const bus = createInMemoryServiceBus();
  let messageNumber = 0;
  const service = createPolicyService({
    bus,
    clock: () => "2026-01-01T00:00:00.000Z",
    ids: {
      next: (prefix) => {
        if (prefix === "message") {
          messageNumber += 1;
          return `message-${messageNumber}`;
        }
        return `${prefix}-generated`;
      },
    },
    referenceData: {
      ownsProperty: ({ tenantId, customerId, propertyId }) =>
        tenantId === "tenant-test" && customerId === "customer-1" && propertyId === "property-1",
    },
  });
  return { bus, service };
};

describe("Policy service", () => {
  test("preserves_independent_workflow_correlation_on_every_policy_command", () => {
    const { bus, service } = createService();
    const quote = service.createQuote({ commandId: "create", ...command });
    service.bindQuote({
      commandId: "bind",
      correlationId: "workflow-1",
      tenantId: command.tenantId,
      quoteId: quote.id,
      policyId: "policy",
    });
    service.transitionPolicy({
      commandId: "cancel",
      correlationId: "cancellation-workflow",
      tenantId: command.tenantId,
      policyId: "policy",
      lifecycle: "cancelled",
    });
    expect(bus.pendingMessages().map((m) => m.correlationId)).toEqual([
      "workflow-1",
      "workflow-1",
      "cancellation-workflow",
    ]);
    expect(() =>
      service.createQuote({ ...command, commandId: "invalid", correlationId: "" }),
    ).toThrow("Correlation ID");
  });
  test("creates_quote_and_publishes_policy_quote_created", () => {
    const { bus, service } = createService();
    const published: string[] = [];
    bus.subscribe("audit", "policy.quote.created", (message) => {
      published.push(`${message.messageId}:${message.event.quote.id}`);
    });

    const quote = service.createQuote({ commandId: "command-create-1", ...command });
    bus.drain();

    expect(quote).toEqual(
      expect.objectContaining({
        id: "quote-generated",
        status: "quoted",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(published).toEqual(["message-1:quote-generated"]);
  });

  test("binds_a_quote_once_and_publishes_policy_lifecycle_changed", () => {
    const { bus, service } = createService();
    const published: { causationId?: string; lifecycle: string; revision: number }[] = [];
    const quote = service.createQuote({ commandId: "command-create-1", ...command });
    bus.subscribe("policy-state", "policy.lifecycle.changed", (message) => {
      published.push({
        causationId: message.causationId,
        lifecycle: message.event.lifecycle,
        revision: message.event.revision,
      });
    });

    const policy = service.bindQuote({
      commandId: "command-bind-1",
      correlationId: "workflow-1",
      tenantId: command.tenantId,
      quoteId: quote.id,
      policyId: "policy-1",
    });
    bus.drain();

    expect(policy).toEqual(expect.objectContaining({ id: "policy-1", quoteId: quote.id }));
    expect(published).toEqual([{ causationId: "message-1", lifecycle: "bound", revision: 1 }]);
  });

  test("transitions_bound_policy_to_cancelled_at_next_revision", () => {
    const { bus, service } = createService();
    const quote = service.createQuote({ commandId: "command-create-1", ...command });
    service.bindQuote({
      commandId: "command-bind-1",
      correlationId: "workflow-1",
      tenantId: command.tenantId,
      quoteId: quote.id,
      policyId: "policy-1",
    });
    const published: { lifecycle: string; revision: number }[] = [];
    bus.subscribe("audit", "policy.lifecycle.changed", (message) => {
      published.push({ lifecycle: message.event.lifecycle, revision: message.event.revision });
    });

    service.transitionPolicy({
      commandId: "command-cancel-1",
      correlationId: "workflow-1",
      tenantId: command.tenantId,
      policyId: "policy-1",
      lifecycle: "cancelled",
    });
    bus.drain();

    expect(published).toContainEqual({ lifecycle: "cancelled", revision: 2 });
  });

  test("returns_original_result_for_a_replayed_command_id", () => {
    const { bus, service } = createService();
    const published: string[] = [];
    bus.subscribe("audit", "policy.quote.created", (message) => {
      published.push(message.messageId);
    });
    const first = service.createQuote({ commandId: "command-create-1", ...command });
    const replay = service.createQuote({ commandId: "command-create-1", ...command });
    bus.drain();

    expect(replay).toEqual(first);
    expect(published).toEqual(["message-1"]);
    expect(bus.deliveryLog()).toHaveLength(1);
    expect(bus.pendingMessages()).toHaveLength(0);
  });

  test("rejects_same_command_id_with_different_payload", () => {
    const { service } = createService();
    service.createQuote({ commandId: "command-create-1", ...command });

    expect(() =>
      service.createQuote({
        commandId: "command-create-1",
        ...command,
        premiumCents: 12_000,
      }),
    ).toThrow("Command ID was already used with different input");
  });

  test("rejects_property_from_another_tenant_or_customer", () => {
    const { service } = createService();

    expect(() =>
      service.createQuote({
        commandId: "command-create-1",
        ...command,
        propertyId: "property-for-another-customer",
      }),
    ).toThrow("Property is not owned by the customer in this tenant");
  });
});
