import { createInMemoryServiceBus } from "@testbed/service-bus";
import { describe, expect, test } from "vitest";
import type { PolicyServicePersistencePort } from "./policy-service";
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
  let persistence!: PolicyServicePersistencePort;
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
    registerPersistence: (port) => {
      persistence = port;
    },
  });
  return { bus, service, persistence };
};

describe("Policy service", () => {
  test("hydrates_a_detached_full_policy_checkpoint_and_replays_each_command", () => {
    const source = createService();
    const create = { commandId: "create", ...command, quoteId: "quote-1" };
    const quote = source.service.createQuote(create);
    const bind = {
      commandId: "bind",
      correlationId: "workflow-1",
      tenantId: command.tenantId,
      quoteId: quote.id,
      policyId: "policy-1",
    };
    const policy = source.service.bindQuote(bind);
    const cancel = {
      commandId: "cancel",
      correlationId: "cancel-workflow",
      tenantId: command.tenantId,
      policyId: policy.id,
      lifecycle: "cancelled" as const,
    };
    source.service.transitionPolicy(cancel);
    const checkpoint = JSON.parse(JSON.stringify(source.persistence.checkpoint()));

    const restored = createService();
    restored.persistence.hydrate(checkpoint);
    Reflect.set(checkpoint.policies[0].value.policy, "premiumCents", 1);
    expect(restored.service.createQuote(create)).toEqual(quote);
    expect(restored.service.bindQuote(bind)).toEqual(policy);
    expect(() => restored.service.transitionPolicy(cancel)).not.toThrow();
    expect(restored.service.getPolicy(command.tenantId, policy.id)).toMatchObject({
      status: "cancelled",
      premiumCents: 10_000,
    });
  });

  test("rejects_forged_checkpoint_receipt_fingerprint_or_result_identity", () => {
    const source = createService();
    source.service.createQuote({ commandId: "create", ...command, quoteId: "quote-1" });
    const checkpoint = source.persistence.checkpoint();

    const forgedFingerprint = structuredClone(checkpoint);
    forgedFingerprint.commandReceipts[0].value.fingerprint = JSON.stringify({
      commandId: "other-command",
      ...command,
    });
    expect(() => createService().persistence.hydrate(forgedFingerprint)).toThrow(/fingerprint/i);

    const foreignResult = structuredClone(checkpoint);
    (foreignResult.commandReceipts[0].value.result as { id: string }).id = "missing-quote";
    expect(() => createService().persistence.hydrate(foreignResult)).toThrow(/result/i);

    const foreignKey = structuredClone(checkpoint);
    foreignKey.commandReceipts[0].key = JSON.stringify(["other-tenant", "create"]);
    expect(() => createService().persistence.hydrate(foreignKey)).toThrow(/identity/i);

    const malformedKey = structuredClone(checkpoint);
    malformedKey.quotes[0].key = "not-json";
    expect(() => createService().persistence.hydrate(malformedKey)).toThrow(/key/i);

    const invalidPremium = structuredClone(checkpoint);
    Reflect.set(invalidPremium.quotes[0].value.quote, "premiumCents", 0);
    expect(() => createService().persistence.hydrate(invalidPremium)).toThrow(/premium/i);

    const malformedFingerprint = structuredClone(checkpoint);
    malformedFingerprint.commandReceipts[0].value.fingerprint = "not-json";
    expect(() => createService().persistence.hydrate(malformedFingerprint)).toThrow(/fingerprint/i);

    const unknownReceipt = structuredClone(checkpoint);
    unknownReceipt.commandReceipts[0].value.fingerprint = JSON.stringify({
      commandId: "create",
      tenantId: command.tenantId,
    });
    expect(() => createService().persistence.hydrate(unknownReceipt)).toThrow(/receipt input/i);
  });

  test("fails_closed_for_duplicate_or_missing_policy_entities", () => {
    const { service } = createService();
    const quote = service.createQuote({ commandId: "create", ...command, quoteId: "quote-1" });
    expect(() =>
      service.createQuote({ commandId: "duplicate", ...command, quoteId: quote.id }),
    ).toThrow(/already exists/i);
    expect(() =>
      service.bindQuote({
        commandId: "missing-quote",
        correlationId: "workflow-1",
        tenantId: command.tenantId,
        quoteId: "missing",
      }),
    ).toThrow(/Unknown quote/i);
    service.bindQuote({
      commandId: "bind",
      correlationId: "workflow-1",
      tenantId: command.tenantId,
      quoteId: quote.id,
      policyId: "policy-1",
    });
    expect(() =>
      service.transitionPolicy({
        commandId: "missing-policy",
        correlationId: "workflow-1",
        tenantId: command.tenantId,
        policyId: "missing",
        lifecycle: "cancelled",
      }),
    ).toThrow(/Unknown policy/i);
  });

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
    const published: { lifecycle: string; revision: number; status: string }[] = [];
    bus.subscribe("audit", "policy.lifecycle.changed", (message) => {
      published.push({
        lifecycle: message.event.lifecycle,
        revision: message.event.revision,
        status: message.event.policy.status,
      });
    });

    service.transitionPolicy({
      commandId: "command-cancel-1",
      correlationId: "workflow-1",
      tenantId: command.tenantId,
      policyId: "policy-1",
      lifecycle: "cancelled",
    });
    bus.drain();

    expect(published).toContainEqual({ lifecycle: "cancelled", revision: 2, status: "cancelled" });
    const messageCount = bus.pendingMessages().length;
    service.transitionPolicy({
      commandId: "command-cancel-1",
      correlationId: "workflow-1",
      tenantId: command.tenantId,
      policyId: "policy-1",
      lifecycle: "cancelled",
    });
    expect(bus.pendingMessages()).toHaveLength(messageCount);
    expect(service.getPolicy(command.tenantId, "policy-1")?.status).toBe("cancelled");
    expect(() =>
      service.transitionPolicy({
        commandId: "command-cancel-2",
        correlationId: "workflow-1",
        tenantId: command.tenantId,
        policyId: "policy-1",
        lifecycle: "cancelled",
      }),
    ).toThrow("not allowed");
    expect(bus.pendingMessages()).toHaveLength(messageCount);
    expect(service.getPolicy(command.tenantId, "policy-1")?.status).toBe("cancelled");
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

  test("owns_input_terms_and_detaches_results_queries_and_replay_receipts", () => {
    const { bus, service } = createService();
    const input = structuredClone({ commandId: "create", ...command });
    const original = structuredClone(input);
    const quote = service.createQuote(input);
    input.commissionPlan.rateBasisPoints = 9999;
    Reflect.set(quote.commissionPlan, "rateBasisPoints", 8888);
    Reflect.set(quote, "premiumCents", 1);
    const queried = service.getQuote(command.tenantId, quote.id);
    if (!queried) throw new Error("Expected created quote");
    Reflect.set(queried.commissionPlan, "holdPeriodDays", 999);
    const bind = {
      commandId: "bind",
      correlationId: "workflow",
      tenantId: command.tenantId,
      quoteId: quote.id,
    };
    const policy = service.bindQuote(bind);
    Reflect.set(policy.commissionPlan, "rateBasisPoints", 7777);
    const queriedPolicy = service.getPolicy(command.tenantId, policy.id);
    const boundQuote = service.getQuote(command.tenantId, quote.id);
    if (!queriedPolicy || !boundQuote) throw new Error("Expected bound policy and quote");
    Reflect.set(queriedPolicy, "premiumCents", 2);
    Reflect.set(boundQuote, "status", "quoted");
    expect(() =>
      service.bindQuote({ ...bind, commandId: "bind-again", policyId: "duplicate" }),
    ).toThrow("already bound");
    const replay = service.createQuote(original);
    expect(replay).toMatchObject({
      premiumCents: 10000,
      status: "quoted",
      commissionPlan: { rateBasisPoints: 1000, holdPeriodDays: 0 },
    });
    expect(replay).not.toBe(quote);
    expect(replay.commissionPlan).not.toBe(quote.commissionPlan);
    expect(Object.isFrozen(replay.commissionPlan)).toBe(true);
    expect(service.bindQuote(bind)).toMatchObject({
      premiumCents: 10000,
      commissionPlan: { rateBasisPoints: 1000, holdPeriodDays: 0 },
    });
    expect(bus.pendingMessages()).toHaveLength(2);
    const bound = bus.pendingMessages()[1];
    expect(bound.event).toMatchObject({
      policy: { premiumCents: 10000, commissionPlan: { rateBasisPoints: 1000 } },
    });
  });
});
