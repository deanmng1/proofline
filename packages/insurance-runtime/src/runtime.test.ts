import * as domain from "@testbed/domain";
import { createInMemoryServiceBus, type ServiceBusCheckpoint } from "@testbed/service-bus";
import { describe, expect, test } from "vitest";
import {
  type Customer,
  createInsuranceRuntime,
  type InsuranceRuntimeCheckpoint,
  type Property,
  type RuntimeOptions,
  type RuntimeSeed,
} from "./runtime";
import { bindCommand, failFinanceOnce, quoteCommand, runtimeSeed } from "./test-fixtures";

describe("insurance runtime", () => {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object")
      return `{${Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
        .join(",")}}`;
    return JSON.stringify(value);
  };

  const present = <T>(value: T | undefined): T => {
    if (value === undefined) throw new Error("Expected fixture value.");
    return value;
  };

  test("restores_command_accepted_before_delivery_without_repeating_mutation", () => {
    const failPolicyStateOnce = (checkpoint?: ServiceBusCheckpoint) => {
      const bus = createInMemoryServiceBus(checkpoint);
      const subscribe = bus.subscribe.bind(bus);
      let shouldFail = checkpoint === undefined;
      bus.subscribe = (consumerId, eventType, handler) =>
        subscribe(consumerId, eventType, (message) => {
          if (consumerId === "policy-state" && shouldFail) {
            shouldFail = false;
            throw new Error("crash before policy projection");
          }
          handler(message);
        });
      return bus;
    };
    const runtime = createInsuranceRuntime(runtimeSeed, { busFactory: failPolicyStateOnce });
    runtime.execute(quoteCommand);
    expect(() => runtime.execute(bindCommand)).toThrow("pending");

    const checkpoint = JSON.parse(JSON.stringify(runtime.checkpoint()));
    const restored = createInsuranceRuntime({ tenants: runtimeSeed.tenants }, { checkpoint });
    expect(restored.execute(bindCommand)).toEqual(expect.objectContaining({ id: "policy" }));
    const state = restored.snapshot("tenant-a");
    expect(state.policy.policies).toHaveLength(1);
    expect(state.policyState.timelines.policy).toHaveLength(1);
    expect(state.finance.ledgers[0].commissionEntries).toHaveLength(1);
    expect(state.pendingMessages).toEqual([]);
    expect(state.messages.map((message) => message.messageId)).toEqual([
      "test-message-1",
      "test-message-2",
      "policy-state:test-message-2",
    ]);
  });

  test("restores_after_one_consumer_receipt_and_finance_failure", () => {
    const runtime = createInsuranceRuntime(runtimeSeed, { busFactory: failFinanceOnce });
    runtime.execute(quoteCommand);
    expect(() => runtime.execute(bindCommand)).toThrow("pending");
    const before = runtime.snapshot("tenant-a");
    expect(before.policyState.timelines.policy).toHaveLength(1);
    expect(before.finance.ledgers).toEqual([]);

    const restored = createInsuranceRuntime(
      { tenants: runtimeSeed.tenants },
      { checkpoint: JSON.parse(JSON.stringify(runtime.checkpoint())) },
    );
    expect(restored.execute(bindCommand)).toEqual(expect.objectContaining({ id: "policy" }));
    const after = restored.snapshot("tenant-a");
    expect(after.policyState.timelines.policy).toHaveLength(1);
    expect(after.finance.ledgers).toHaveLength(1);
    expect(after.finance.ledgers[0].commissionEntries).toHaveLength(1);
    expect(after.deliveries.map((delivery) => delivery.status)).toEqual([
      "completed",
      "failed",
      "completed",
    ]);
  });

  test("drains_restored_pending_delivery_before_returning_an_accepted_command_result", () => {
    const alwaysFailFinance = (checkpoint?: ServiceBusCheckpoint) => {
      const bus = createInMemoryServiceBus(checkpoint);
      const subscribe = bus.subscribe.bind(bus);
      bus.subscribe = (consumerId, eventType, handler) =>
        subscribe(consumerId, eventType, (message) => {
          if (consumerId === "finance-policy-state") throw new Error("finance remains unavailable");
          handler(message);
        });
      return bus;
    };
    const runtime = createInsuranceRuntime(runtimeSeed, { busFactory: alwaysFailFinance });
    runtime.execute(quoteCommand);
    expect(() => runtime.execute(bindCommand)).toThrow("pending");

    const restored = createInsuranceRuntime(
      { tenants: runtimeSeed.tenants },
      {
        checkpoint: JSON.parse(JSON.stringify(runtime.checkpoint())),
        busFactory: alwaysFailFinance,
      },
    );
    expect(() => restored.execute(bindCommand)).toThrow("pending");
    expect(restored.snapshot("tenant-a").pendingMessages).toHaveLength(1);
    expect(restored.snapshot("tenant-a").policy.policies).toHaveLength(1);
    expect(restored.snapshot("tenant-a").policyState.timelines.policy).toHaveLength(1);
  });

  test("replays_same_command_after_recreation_without_duplicate_policy_projection_or_ledger", () => {
    const runtime = createInsuranceRuntime(runtimeSeed, { busFactory: failFinanceOnce });
    runtime.execute(quoteCommand);
    expect(() => runtime.execute(bindCommand)).toThrow("pending");
    const original = runtime.checkpoint();
    const serialized = JSON.parse(JSON.stringify(original));
    const restored = createInsuranceRuntime(
      { tenants: runtimeSeed.tenants },
      { checkpoint: serialized },
    );
    original.customers[0].name = "mutated checkpoint";
    serialized.properties[0].city = "mutated input";

    const replay = restored.execute(bindCommand);
    expect(restored.execute(bindCommand)).toEqual(replay);
    const state = restored.snapshot("tenant-a");
    expect(state.customers[0].name).toBe("Alex");
    expect(state.properties[0].city).toBe("Austin");
    expect(state.policy.policies).toHaveLength(1);
    expect(state.policyState.timelines.policy).toHaveLength(1);
    expect(state.finance.ledgers[0].commissionEntries).toHaveLength(1);
    expect(new Set(state.messages.map((message) => message.messageId)).size).toBe(
      state.messages.length,
    );
    expect(restored.checkpoint()).toEqual(restored.checkpoint());
  });

  test("rejects_malformed_or_cross_tenant_checkpoint_before_hydration", () => {
    const runtime = createInsuranceRuntime(runtimeSeed);
    const checkpoint = runtime.checkpoint();
    expect(() =>
      createInsuranceRuntime({}, { checkpoint: { ...checkpoint, version: 99 } as never }),
    ).toThrow(/checkpoint/i);
    expect(() =>
      createInsuranceRuntime(
        {},
        {
          checkpoint: {
            ...checkpoint,
            customers: [{ ...checkpoint.customers[0], tenantId: "missing-tenant" }],
          },
        },
      ),
    ).toThrow(/tenant/i);
    expect(() =>
      createInsuranceRuntime({ ...runtimeSeed, commands: [quoteCommand] }, { checkpoint }),
    ).toThrow(/checkpoint.*seed|seed.*checkpoint/i);
  });

  test("rejects_completed_consumer_receipts_without_their_durable_effects", () => {
    const runtime = createInsuranceRuntime(runtimeSeed);
    runtime.execute(quoteCommand);
    runtime.execute(bindCommand);
    const checkpoint = runtime.checkpoint();
    const lifecycle = present(
      checkpoint.messages.find((message) => message.event.type === "policy.lifecycle.changed"),
    );
    const projected = present(
      checkpoint.messages.find((message) => message.event.type === "policy.state.changed"),
    );

    const missingProjection = structuredClone(checkpoint);
    missingProjection.policyState.timelines = [];
    missingProjection.finance.ledgers = [];
    missingProjection.messages = missingProjection.messages.filter(
      (message) => message.messageId !== projected.messageId,
    );
    missingProjection.bus.completedReceipts = missingProjection.bus.completedReceipts.filter(
      (receipt) => receipt.messageId !== projected.messageId,
    );
    missingProjection.bus.deliveries = missingProjection.bus.deliveries.filter(
      (delivery) => delivery.messageId !== projected.messageId,
    );
    expect(missingProjection.bus.completedReceipts).toContainEqual({
      consumerId: "policy-state",
      messageId: lifecycle.messageId,
    });
    expect(() => createInsuranceRuntime({}, { checkpoint: missingProjection })).toThrow(
      /policy state.*receipt|receipt.*policy state|durable projection/i,
    );

    const missingFinanceEffect = structuredClone(checkpoint);
    missingFinanceEffect.finance.ledgers = [];
    expect(missingFinanceEffect.bus.completedReceipts).toContainEqual({
      consumerId: "finance-policy-state",
      messageId: projected.messageId,
    });
    expect(() => createInsuranceRuntime({}, { checkpoint: missingFinanceEffect })).toThrow(
      /finance.*receipt|receipt.*finance|durable ledger/i,
    );
  });

  test("rejects_non_contiguous_finance_policy_state_receipts", () => {
    const runtime = createInsuranceRuntime({
      ...runtimeSeed,
      commands: [quoteCommand, bindCommand],
    });
    runtime.execute({
      type: "transition_policy",
      schemaVersion: 1,
      tenantId: "tenant-a",
      commandId: "cancel-command",
      correlationId: "cancel-workflow",
      policyId: "policy",
      lifecycle: "cancelled",
    });
    const checkpoint = runtime.checkpoint();
    const bound = present(
      checkpoint.messages.find(
        (message) =>
          message.event.type === "policy.state.changed" && message.event.state.revision === 1,
      ),
    );
    const cancelled = present(
      checkpoint.messages.find(
        (message) =>
          message.event.type === "policy.state.changed" && message.event.state.revision === 2,
      ),
    );
    checkpoint.bus.completedReceipts = checkpoint.bus.completedReceipts.filter(
      (receipt) =>
        receipt.consumerId !== "finance-policy-state" || receipt.messageId !== bound.messageId,
    );
    checkpoint.bus.deliveries = checkpoint.bus.deliveries.filter(
      (delivery) =>
        delivery.consumerId !== "finance-policy-state" || delivery.messageId !== bound.messageId,
    );
    checkpoint.bus.queue.push(bound);
    const ledger = checkpoint.finance.ledgers[0].value;
    ledger.auditEntries = ledger.auditEntries.filter(
      (entry) => entry.sourceEventId !== bound.messageId,
    );
    ledger.commissionEntries = ledger.commissionEntries.filter(
      (entry) => entry.sourceEventId !== bound.messageId,
    );
    expect(checkpoint.bus.completedReceipts).toContainEqual({
      consumerId: "finance-policy-state",
      messageId: cancelled.messageId,
    });

    expect(() => createInsuranceRuntime({}, { checkpoint })).toThrow(
      /contiguous|ordered|revision prefix/i,
    );
  });

  test("rejects_forged_runtime_receipt_queue_identity_and_lowered_sequence", () => {
    const intake = createInsuranceRuntime({ tenants: ["tenant-a", "tenant-b"] });
    const command = {
      type: "create_customer" as const,
      schemaVersion: 1 as const,
      tenantId: "tenant-a",
      commandId: "customer-command",
      correlationId: "intake-workflow",
      name: "Alex",
      email: "alex@example.test",
    };
    intake.execute(command);
    const forgedReceipt = intake.checkpoint();
    const changedCommand = { ...command, email: "forged@example.test" };
    forgedReceipt.commandReceipts[0].fingerprint = canonical(changedCommand);
    forgedReceipt.commandReceipts[0].result = {
      kind: "value",
      value: {
        tenantId: "tenant-b",
        id: "ghost",
        name: "Forged",
        email: "forged@example.test",
      },
    };
    expect(() => createInsuranceRuntime({}, { checkpoint: forgedReceipt })).toThrow(/receipt/i);

    const loweredSequence = intake.checkpoint();
    loweredSequence.sequence = 0;
    expect(() => createInsuranceRuntime({}, { checkpoint: loweredSequence })).toThrow(/sequence/i);

    const failPolicyStateOnce = (checkpoint?: ServiceBusCheckpoint) => {
      const bus = createInMemoryServiceBus(checkpoint);
      const subscribe = bus.subscribe.bind(bus);
      let fail = checkpoint === undefined;
      bus.subscribe = (consumerId, eventType, handler) =>
        subscribe(consumerId, eventType, (message) => {
          if (consumerId === "policy-state" && fail) {
            fail = false;
            throw new Error("pending projection");
          }
          handler(message);
        });
      return bus;
    };
    const workflow = createInsuranceRuntime(runtimeSeed, { busFactory: failPolicyStateOnce });
    workflow.execute(quoteCommand);
    expect(() => workflow.execute(bindCommand)).toThrow("pending");
    const forgedQueue = workflow.checkpoint();
    forgedQueue.bus.queue[0] = {
      ...forgedQueue.bus.queue[0],
      tenantId: "tenant-b",
    };
    expect(() => createInsuranceRuntime({}, { checkpoint: forgedQueue })).toThrow(/queue|history/i);
  });

  test("rejects_structural_checkpoint_corruption_before_hydration", () => {
    const runtime = createInsuranceRuntime({
      ...runtimeSeed,
      commands: [quoteCommand, bindCommand],
    });
    const base = runtime.checkpoint();
    const reject = (
      mutate: (checkpoint: InsuranceRuntimeCheckpoint) => void,
      seed: RuntimeSeed = {},
      options: Omit<RuntimeOptions, "checkpoint"> = {},
    ) => {
      const checkpoint = structuredClone(base);
      mutate(checkpoint);
      expect(() => createInsuranceRuntime(seed, { ...options, checkpoint })).toThrow();
    };

    reject((value) => Reflect.set(value, "tenants", null));
    reject((value) => Reflect.set(value, "customers", null));
    reject((value) => Reflect.set(value, "properties", null));
    reject((value) => Reflect.set(value, "generatedIds", null));
    reject((value) => Reflect.set(value, "commandReceipts", null));
    reject((value) => Reflect.set(value, "messages", null));
    reject((value) => Reflect.set(value.bus, "version", 2));
    reject((value) => Reflect.set(value.policy, "version", 2));
    reject((value) => Reflect.set(value.policyState, "version", 2));
    reject((value) => Reflect.set(value.finance, "version", 2));
    reject((value) => Reflect.set(value, "sequence", -1));
    reject((value) => Reflect.set(value, "currentTime", "invalid"));
    reject((value) => value.tenants.push(value.tenants[0]));
    reject((value) => Reflect.set(value, "tenants", []));
    reject(() => undefined, { tenants: ["other-tenant"] });
    reject(() => undefined, {}, { now: "2027-01-01T00:00:00.000Z" });
    reject(() => undefined, {}, { idPrefix: "other" });
    reject((value) => value.customers.push(structuredClone(value.customers[0])));
    reject((value) => Reflect.set(value.customers[0], "name", ""));
    reject((value) => value.properties.push(structuredClone(value.properties[0])));
    reject((value) => Reflect.set(value.properties[0], "customerId", "missing"));
    reject((value) => Reflect.set(value.properties[0], "tenantId", "other-tenant"));
    reject((value) => Reflect.set(value.commandReceipts[0], "result", { kind: "bogus" }));
    reject((value) => value.commandReceipts.push(structuredClone(value.commandReceipts[0])));
    reject((value) => Reflect.set(value.commandReceipts[0], "fingerprint", "not-json"));
    reject((value) => Reflect.set(value.commandReceipts[0], "tenantId", "other-tenant"));
    reject((value) => value.messages.push(structuredClone(value.messages[0])));
    reject((value) => Reflect.set(value.messages[0], "schemaVersion", 2));
    reject((value) => Reflect.set(value.messages[0], "tenantId", "other-tenant"));
    reject((value) => Reflect.set(value.policy.quotes[0], "key", "not-json"));
    reject((value) => Reflect.set(value.policy.quotes[0], "key", JSON.stringify(["tenant-a"])));

    const corruptCommand = (
      commandId: string,
      mutate: (command: Record<string, unknown>) => void,
    ) =>
      reject((value) => {
        const receipt = present(
          value.commandReceipts.find((entry) => entry.commandId === commandId),
        );
        const command = JSON.parse(receipt.fingerprint) as Record<string, unknown>;
        mutate(command);
        receipt.fingerprint = canonical(command);
      });
    corruptCommand(quoteCommand.commandId, (command) => Reflect.set(command, "schemaVersion", 2));
    corruptCommand(quoteCommand.commandId, (command) => Reflect.set(command, "correlationId", ""));
    corruptCommand(quoteCommand.commandId, (command) => Reflect.set(command, "product", "bogus"));
    corruptCommand(quoteCommand.commandId, (command) => Reflect.set(command, "premiumCents", 0));
    corruptCommand(quoteCommand.commandId, (command) => Reflect.set(command, "commissionPlan", {}));
    corruptCommand(quoteCommand.commandId, (command) =>
      Reflect.set(command, "occurredAt", "invalid"),
    );
    corruptCommand(bindCommand.commandId, (command) => Reflect.set(command, "quoteId", ""));
    corruptCommand(bindCommand.commandId, (command) => Reflect.set(command, "policyId", ""));
    corruptCommand(quoteCommand.commandId, (command) =>
      Reflect.set(command, "type", "not-a-command"),
    );
  });

  test("continues_generated_identity_sequence_exactly_after_restore", () => {
    const first = createInsuranceRuntime({ tenants: ["tenant-a"] });
    const customer = first.execute({
      type: "create_customer",
      schemaVersion: 1,
      tenantId: "tenant-a",
      commandId: "customer",
      correlationId: "workflow",
      name: "Alex",
      email: "alex@example.test",
    }) as Customer;
    const checkpoint = JSON.parse(JSON.stringify(first.checkpoint()));
    const propertyCommand = {
      type: "create_property" as const,
      schemaVersion: 1 as const,
      tenantId: "tenant-a",
      commandId: "property",
      correlationId: "workflow",
      customerId: customer.id,
      addressLine1: "1 Main",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
    };
    const uninterrupted = first.execute(propertyCommand) as Property;
    const restored = createInsuranceRuntime({}, { checkpoint });
    expect(restored.execute(propertyCommand)).toEqual(uninterrupted);
  });

  test("does_not_infer_allocator_state_from_explicit_external_ids", () => {
    const runtime = createInsuranceRuntime({ tenants: ["tenant-a"] });
    const command = {
      type: "create_customer" as const,
      schemaVersion: 1 as const,
      tenantId: "tenant-a",
      commandId: "explicit-customer",
      correlationId: "intake-workflow",
      customerId: "test-customer-999",
      name: "Alex",
      email: "alex@example.test",
    };
    runtime.execute(command);
    const checkpoint = runtime.checkpoint();
    expect(checkpoint.sequence).toBe(0);
    expect(checkpoint.generatedIds).toEqual([]);
    expect(createInsuranceRuntime({}, { checkpoint }).execute(command)).toEqual(
      expect.objectContaining({ id: "test-customer-999" }),
    );
  });

  test("rejects_history_receipt_and_command_facts_that_contradict_service_state", () => {
    const bound = createInsuranceRuntime({
      ...runtimeSeed,
      commands: [quoteCommand, bindCommand],
    });

    const missingQuoteHistory = bound.checkpoint();
    missingQuoteHistory.messages = missingQuoteHistory.messages.filter(
      (message) => message.event.type !== "policy.quote.created",
    );
    expect(() => createInsuranceRuntime({}, { checkpoint: missingQuoteHistory })).toThrow(
      /history|message/i,
    );

    const duplicatedQuoteHistory = bound.checkpoint();
    const quoteMessage = present(
      duplicatedQuoteHistory.messages.find(
        (message) => message.event.type === "policy.quote.created",
      ),
    );
    duplicatedQuoteHistory.messages.push({ ...quoteMessage, messageId: "duplicate-quote-fact" });
    expect(() => createInsuranceRuntime({}, { checkpoint: duplicatedQuoteHistory })).toThrow(
      /history/i,
    );

    const unknownCommand = bound.checkpoint();
    const runtimeReceipt = unknownCommand.commandReceipts[0];
    runtimeReceipt.fingerprint = canonical({
      ...JSON.parse(runtimeReceipt.fingerprint),
      type: "not-a-command",
    });
    expect(() => createInsuranceRuntime({}, { checkpoint: unknownCommand })).toThrow(/command/i);

    const deposit = {
      type: "deposit_recorded" as const,
      schemaVersion: 1 as const,
      tenantId: "tenant-a",
      commandId: "deposit",
      correlationId: "finance-workflow",
      policyId: "policy",
      amountCents: 10_000,
    };
    bound.execute(deposit);
    const changedFinanceCommand = bound.checkpoint();
    const depositReceipt = present(
      changedFinanceCommand.commandReceipts.find(
        (receipt) => receipt.commandId === deposit.commandId,
      ),
    );
    depositReceipt.fingerprint = canonical({ ...deposit, amountCents: 20_000 });
    expect(() => createInsuranceRuntime({}, { checkpoint: changedFinanceCommand })).toThrow(
      /finance.*receipt|receipt.*finance/i,
    );

    const cancel = {
      type: "transition_policy" as const,
      schemaVersion: 1 as const,
      tenantId: "tenant-a",
      commandId: "cancel",
      correlationId: "cancel-workflow",
      policyId: "policy",
      lifecycle: "cancelled" as const,
    };
    bound.execute(cancel);
    const missingPolicyReceipt = bound.checkpoint();
    missingPolicyReceipt.policy.commandReceipts =
      missingPolicyReceipt.policy.commandReceipts.filter(
        (receipt) => !receipt.key.includes(cancel.commandId),
      );
    expect(() => createInsuranceRuntime({}, { checkpoint: missingPolicyReceipt })).toThrow(
      /transition|Policy command receipt/i,
    );
  });

  test("projects_cancelled_policy_status_in_list_and_detail_queries", () => {
    const runtime = createInsuranceRuntime({
      ...runtimeSeed,
      commands: [quoteCommand, bindCommand],
    });
    const cancel = {
      type: "transition_policy" as const,
      schemaVersion: 1 as const,
      tenantId: "tenant-a",
      commandId: "cancel-command",
      correlationId: "cancel-workflow",
      policyId: "policy",
      lifecycle: "cancelled" as const,
    };
    runtime.execute(cancel);
    const restored = createInsuranceRuntime(
      { tenants: runtimeSeed.tenants },
      { checkpoint: JSON.parse(JSON.stringify(runtime.checkpoint())) },
    );
    expect(restored.getPolicy("tenant-a", "policy")?.status).toBe("cancelled");
    expect(restored.snapshot("tenant-a").policy.policies).toEqual([
      expect.objectContaining({ id: "policy", status: "cancelled" }),
    ]);
    expect(restored.getLedger("tenant-a", "policy")?.policyState.lifecycle).toBe("cancelled");
    expect(restored.snapshot("tenant-a").policyState.timelines.policy).toEqual([
      expect.objectContaining({ lifecycle: "bound", revision: 1 }),
      expect.objectContaining({ lifecycle: "cancelled", revision: 2 }),
    ]);
  });

  test("replays_customer_and_property_intake_with_stable_command_identity", () => {
    const runtime = createInsuranceRuntime({ tenants: ["tenant-a"] });
    const customerCommand = {
      type: "create_customer" as const,
      schemaVersion: 1 as const,
      tenantId: "tenant-a",
      commandId: "customer-command",
      correlationId: "intake-workflow",
      name: "Alex",
      email: "alex@example.test",
    };
    const customer = runtime.execute(customerCommand) as Customer;
    expect(runtime.execute(customerCommand)).toEqual(customer);
    expect(() => runtime.execute({ ...customerCommand, email: "changed@example.test" })).toThrow(
      /different input/i,
    );
    const propertyCommand = {
      type: "create_property" as const,
      schemaVersion: 1 as const,
      tenantId: "tenant-a",
      commandId: "property-command",
      correlationId: "intake-workflow",
      customerId: customer.id,
      addressLine1: "1 Main",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
    };
    const property = runtime.execute(propertyCommand) as Property;
    expect(runtime.execute(propertyCommand)).toEqual(property);
    expect(runtime.snapshot("tenant-a").customers).toEqual([customer]);
    expect(runtime.snapshot("tenant-a").properties).toEqual([property]);

    const restored = createInsuranceRuntime(
      { tenants: ["tenant-a"] },
      { checkpoint: JSON.parse(JSON.stringify(runtime.checkpoint())) },
    );
    expect(restored.execute(customerCommand)).toEqual(customer);
    expect(restored.execute(propertyCommand)).toEqual(property);
    expect(restored.snapshot("tenant-a").customers).toHaveLength(1);
    expect(restored.snapshot("tenant-a").properties).toHaveLength(1);
  });

  test("isolates_same_intake_command_and_correlation_ids_across_tenants", () => {
    const runtime = createInsuranceRuntime({ tenants: ["tenant-a", "tenant-b"] });
    const command = {
      type: "create_customer" as const,
      schemaVersion: 1 as const,
      commandId: "shared-command",
      correlationId: "shared-workflow",
      name: "Alex",
      email: "alex@example.test",
    };
    const first = runtime.execute({ ...command, tenantId: "tenant-a" }) as Customer;
    const second = runtime.execute({ ...command, tenantId: "tenant-b" }) as Customer;
    expect(first.id).not.toBe(second.id);
    expect(runtime.snapshot("tenant-a").customers).toEqual([first]);
    expect(runtime.snapshot("tenant-b").customers).toEqual([second]);
  });

  test("rejects_foreign_quote_references_without_draining_another_tenants_pending_delivery", () => {
    const runtime = createInsuranceRuntime(runtimeSeed, { busFactory: failFinanceOnce });
    runtime.execute(quoteCommand);
    expect(() => runtime.execute(bindCommand)).toThrow("pending");
    const pending = runtime.snapshot("tenant-a");
    expect(pending.pendingMessages).toHaveLength(1);
    expect(pending.finance.ledgers).toEqual([]);

    expect(() =>
      runtime.execute({
        ...quoteCommand,
        tenantId: "tenant-b",
        commandId: "foreign-quote",
      }),
    ).toThrow("Property is not owned by the customer in this tenant.");

    expect(runtime.snapshot("tenant-a")).toEqual(pending);
    expect(runtime.snapshot("tenant-b").messages).toEqual([]);
    runtime.execute(bindCommand);
    expect(runtime.snapshot("tenant-a").pendingMessages).toEqual([]);
    expect(runtime.getLedger("tenant-a", "policy")?.commissionEntries).toHaveLength(1);
  });
  test("same_command_ids_and_entity_ids_are_independent_across_tenants", () => {
    const runtime = createInsuranceRuntime({
      tenants: ["tenant-a", "tenant-b"],
      customers: ["tenant-a", "tenant-b"].map((tenantId) => ({
        ...runtimeSeed.customers[0],
        tenantId,
      })),
      properties: ["tenant-a", "tenant-b"].map((tenantId) => ({
        ...runtimeSeed.properties[0],
        tenantId,
      })),
    });
    for (const tenantId of ["tenant-a", "tenant-b"]) {
      runtime.execute({ ...quoteCommand, tenantId });
      runtime.execute({ ...bindCommand, tenantId });
    }
    expect(runtime.getLedger("tenant-a", "policy")?.commissionEntries).toHaveLength(1);
    expect(runtime.getLedger("tenant-b", "policy")?.commissionEntries).toHaveLength(1);
    expect(runtime.snapshot("tenant-a").messages.every((m) => m.tenantId === "tenant-a")).toBe(
      true,
    );
    expect(runtime.snapshot("tenant-b").messages.every((m) => m.tenantId === "tenant-b")).toBe(
      true,
    );
  });
  test("bind_chain_is_idempotent_across_all_consumers", () => {
    const runtime = createInsuranceRuntime(runtimeSeed);
    runtime.execute(quoteCommand);
    runtime.execute(bindCommand);
    runtime.execute(bindCommand);
    const state = runtime.snapshot("tenant-a");
    expect(state.policy.policies).toHaveLength(1);
    expect(state.policyState.timelines.policy).toHaveLength(1);
    expect(state.finance.ledgers[0].commissionEntries).toHaveLength(1);
    expect(state.messages.map((m) => m.event.type)).toEqual([
      "policy.quote.created",
      "policy.lifecycle.changed",
      "policy.state.changed",
    ]);
    expect(state.messages.every((m) => m.correlationId === "workflow")).toBe(true);
    expect(state.messages[2].causationId).toBe(state.messages[1].messageId);
    expect(state.deliveries.map((d) => d.consumerId)).toEqual([
      "policy-state",
      "finance-policy-state",
    ]);
    expect(runtime).not.toHaveProperty("bus");
    expect(runtime).not.toHaveProperty("policyService");
    state.policy.policies[0].premiumCents = 1;
    expect(runtime.getLedger("tenant-a", "policy")?.policy.premiumCents).toBe(10_000);
  });
  test("fresh_runtimes_do_not_share_bus_or_ledger_state", () => {
    const seed = { ...runtimeSeed, commands: [quoteCommand, bindCommand] };
    const first = createInsuranceRuntime(seed);
    const second = createInsuranceRuntime(seed);
    first.execute({
      type: "deposit_recorded",
      schemaVersion: 1,
      tenantId: "tenant-a",
      commandId: "deposit",
      correlationId: "workflow",
      policyId: "policy",
      amountCents: 100,
    });
    expect(first.getLedger("tenant-a", "policy")?.financeEntries).toHaveLength(1);
    expect(second.getLedger("tenant-a", "policy")?.financeEntries).toHaveLength(0);
    expect(second.snapshot("tenant-a").messages).toHaveLength(3);
    expect(first.snapshot("tenant-b").messages).toEqual([]);
  });
  test("checkpoints_and_replays_every_finance_command_shape", () => {
    const runtime = createInsuranceRuntime({
      ...runtimeSeed,
      commands: [quoteCommand, bindCommand],
    });
    const commands = [
      {
        type: "deposit_recorded" as const,
        schemaVersion: 1 as const,
        tenantId: "tenant-a",
        commandId: "deposit-all",
        correlationId: "finance-workflow",
        policyId: "policy",
        amountCents: 10_000,
      },
      {
        type: "premium_payment_settled" as const,
        schemaVersion: 1 as const,
        tenantId: "tenant-a",
        commandId: "premium-all",
        correlationId: "finance-workflow",
        policyId: "policy",
        amountCents: 5_000,
      },
      {
        type: "claim_payment_recorded" as const,
        schemaVersion: 1 as const,
        tenantId: "tenant-a",
        commandId: "claim-all",
        correlationId: "finance-workflow",
        policyId: "policy",
        amountCents: 100,
      },
    ];
    const results = commands.map((command) => runtime.execute(command));
    const ledger = present(runtime.getLedger("tenant-a", "policy"));
    const premium = present(
      ledger.financeEntries.find((entry) => entry.kind === "premium_payment"),
    );
    const accrual = present(ledger.commissionEntries.find((entry) => entry.kind === "accrual"));
    const refund = {
      type: "refund_recorded" as const,
      schemaVersion: 1 as const,
      tenantId: "tenant-a",
      commandId: "refund-all",
      correlationId: "finance-workflow",
      policyId: "policy",
      allocations: [
        { allocationId: "allocation-all", financeEntryId: premium.id, amountCents: 100 },
      ],
    };
    const commission = {
      type: "commission_paid" as const,
      schemaVersion: 1 as const,
      tenantId: "tenant-a",
      commandId: "commission-all",
      correlationId: "finance-workflow",
      policyId: "policy",
      commissionEntryId: accrual.id,
    };
    results.push(runtime.execute(refund), runtime.execute(commission));

    const restored = createInsuranceRuntime(
      {},
      { checkpoint: JSON.parse(JSON.stringify(runtime.checkpoint())) },
    );
    [...commands, refund, commission].forEach((command, index) => {
      expect(restored.execute(command)).toEqual(results[index]);
    });
    expect(restored.getLedger("tenant-a", "policy")?.financeEntries).toHaveLength(4);
  });
  test("legacy_reducer_is_not_exported_or_used_by_the_runtime", () => {
    expect(domain).not.toHaveProperty("applyEvent");
    expect(domain).not.toHaveProperty("emptyDomainState");
    const runtime = createInsuranceRuntime({
      ...runtimeSeed,
      commands: [quoteCommand, bindCommand],
    });
    expect(runtime.getLedger("tenant-a", "policy")?.policyState.lifecycle).toBe("bound");
    expect(runtime.snapshot("tenant-a")).not.toHaveProperty("domain");
  });
  test("retries_pending_finance_delivery_without_duplicate_policy_or_commission_records", () => {
    const runtime = createInsuranceRuntime(runtimeSeed, { busFactory: failFinanceOnce });
    runtime.execute(quoteCommand);
    expect(() => runtime.execute(bindCommand)).toThrow("pending");
    expect(runtime.snapshot("tenant-a").pendingMessages).toHaveLength(1);
    expect(runtime.getLedger("tenant-a", "policy")).toBeUndefined();
    runtime.execute(bindCommand);
    const state = runtime.snapshot("tenant-a");
    expect(state.policy.policies).toHaveLength(1);
    expect(state.policyState.timelines.policy).toHaveLength(1);
    expect(state.finance.ledgers[0].commissionEntries).toHaveLength(1);
    expect(state.pendingMessages).toEqual([]);
    expect(state.deliveries.map((d) => d.status)).toEqual(["completed", "failed", "completed"]);
  });
  test("cancellation_is_terminal_and_replay_does_not_restore_bound_state", () => {
    const runtime = createInsuranceRuntime({
      ...runtimeSeed,
      commands: [quoteCommand, bindCommand],
    });
    const cancel = {
      type: "transition_policy" as const,
      schemaVersion: 1 as const,
      tenantId: "tenant-a",
      commandId: "cancel",
      correlationId: "workflow",
      policyId: "policy",
      lifecycle: "cancelled" as const,
    };
    runtime.execute(cancel);
    runtime.execute(bindCommand);
    runtime.execute(cancel);
    expect(runtime.getLedger("tenant-a", "policy")?.policyState.lifecycle).toBe("cancelled");
    expect(runtime.snapshot("tenant-a").policyState.timelines.policy).toHaveLength(2);
    expect(() => runtime.execute({ ...cancel, commandId: "cancel-again" })).toThrow();
  });
});
