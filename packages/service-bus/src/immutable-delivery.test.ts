import type { EventEnvelope, FinanceRefundRecordedMessage } from "@testbed/domain";
import { describe, expect, test } from "vitest";
import { createInMemoryServiceBus } from "./service-bus";

const message = () => ({
  messageId: "message",
  correlationId: "workflow",
  tenantId: "tenant",
  schemaVersion: 1,
  occurredAt: "2026-01-01T00:00:00.000Z",
  event: {
    type: "finance.refund.recorded" as const,
    commandId: "refund",
    policyId: "policy",
    allocations: [{ allocationId: "a", financeEntryId: "premium", amountCents: 100 }],
  },
});

describe("immutable delivery", () => {
  test("owns_nested_publisher_and_inspection_values_before_delivery", () => {
    const bus = createInMemoryServiceBus();
    const input = message();
    bus.publish(input);
    input.event.allocations[0].amountCents = 999;
    input.event.allocations.push({
      allocationId: "b",
      financeEntryId: "premium",
      amountCents: 999,
    });
    const inspected = bus.pendingMessages()[0] as EventEnvelope<FinanceRefundRecordedMessage>;
    const second = bus.pendingMessages()[0] as EventEnvelope<FinanceRefundRecordedMessage>;
    expect(inspected.event.allocations).not.toBe(second.event.allocations);
    expect(Object.isFrozen(inspected.event.allocations)).toBe(true);
    Reflect.set(inspected.event.allocations[0], "amountCents", 888);
    const received: number[][] = [];
    bus.subscribe("consumer", "finance.refund.recorded", (value) => {
      received.push(value.event.allocations.map((a) => a.amountCents));
    });
    bus.drain();
    expect(received).toEqual([[100]]);
  });

  test("consumer_mutation_cannot_change_later_delivery_or_failed_retry", () => {
    const bus = createInMemoryServiceBus();
    const received: number[] = [];
    let fail = true;
    bus.subscribe("first", "finance.refund.recorded", (value) => {
      Reflect.set(value.event.allocations[0], "amountCents", 999);
      Reflect.set(value, "messageId", "changed");
    });
    bus.subscribe("retry", "finance.refund.recorded", (value) => {
      received.push(value.event.allocations[0].amountCents);
      Reflect.set(value.event.allocations[0], "amountCents", 888);
      if (fail) {
        fail = false;
        throw new Error("retry");
      }
    });
    bus.publish(message());
    expect(() => bus.drain()).toThrow("retry");
    bus.drain();
    expect(received).toEqual([100, 100]);
    expect(bus.deliveryLog().map((d) => [d.consumerId, d.messageId, d.status])).toEqual([
      ["first", "message", "completed"],
      ["retry", "message", "failed"],
      ["retry", "message", "completed"],
    ]);
    expect(bus.pendingMessages()).toEqual([]);
  });

  test("delimiter_ids_do_not_collide_between_consumers_and_messages", () => {
    const bus = createInMemoryServiceBus();
    const received: string[][] = [];
    for (const id of ["a:b", "a"])
      bus.subscribe(id, "finance.refund.recorded", (value) => {
        received.push([id, value.messageId]);
      });
    for (const messageId of ["c", "b:c", "c", "b:c"]) bus.publish({ ...message(), messageId });
    bus.drain();
    expect(received).toEqual([
      ["a:b", "c"],
      ["a", "c"],
      ["a:b", "b:c"],
      ["a", "b:c"],
    ]);
  });
});
