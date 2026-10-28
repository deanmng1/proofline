import type {
  EventEnvelope,
  Policy,
  PolicyLifecycleChangedMessage,
  PolicyQuoteCreatedMessage,
  Quote,
} from "@testbed/domain";
import { describe, expect, test } from "vitest";

import { createInMemoryServiceBus } from "./service-bus";

const quote: Quote = {
  id: "quote-1",
  customerId: "customer-1",
  propertyId: "property-1",
  product: "risk_secure",
  premiumCents: 10_000,
  commissionPlan: {
    timing: "on_bind",
    rateBasisPoints: 1_000,
    holdPeriodDays: 0,
    reverseOnRefund: true,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  status: "quoted",
};

const policy: Policy = {
  ...quote,
  quoteId: quote.id,
  boundAt: "2026-01-01T00:00:00.000Z",
  status: "bound",
};

const quoteEnvelope = (messageId: string): EventEnvelope<PolicyQuoteCreatedMessage> => ({
  messageId,
  correlationId: "workflow-1",
  tenantId: "tenant-test",
  schemaVersion: 1,
  occurredAt: "2026-01-01T00:00:00.000Z",
  event: {
    type: "policy.quote.created",
    quote,
  },
});

const lifecycleEnvelope = (messageId: string): EventEnvelope<PolicyLifecycleChangedMessage> => ({
  messageId,
  correlationId: "workflow-1",
  tenantId: "tenant-test",
  schemaVersion: 1,
  occurredAt: "2026-01-01T00:00:00.000Z",
  event: {
    type: "policy.lifecycle.changed",
    policy,
    lifecycle: "bound",
    revision: 1,
  },
});

describe("in-memory service bus", () => {
  test("delivers_once_per_consumer_and_preserves_delivery_log", () => {
    const bus = createInMemoryServiceBus();
    const receivedByPolicyState: string[] = [];
    const receivedByFinance: string[] = [];

    bus.subscribe("policy-state", "policy.quote.created", (message) => {
      receivedByPolicyState.push(message.messageId);
    });
    bus.subscribe("finance", "policy.quote.created", (message) => {
      receivedByFinance.push(message.messageId);
    });

    bus.publish(quoteEnvelope("message-1"));
    bus.drain();
    bus.publish(quoteEnvelope("message-1"));
    bus.drain();

    expect(receivedByPolicyState).toEqual(["message-1"]);
    expect(receivedByFinance).toEqual(["message-1"]);
    expect(bus.deliveryLog()).toEqual([
      expect.objectContaining({
        consumerId: "policy-state",
        messageId: "message-1",
        status: "completed",
      }),
      expect.objectContaining({
        consumerId: "finance",
        messageId: "message-1",
        status: "completed",
      }),
    ]);
  });

  test("drains_messages_in_publish_order", () => {
    const bus = createInMemoryServiceBus();
    const received: string[] = [];

    bus.subscribe("audit", "policy.quote.created", (message) => {
      received.push(message.messageId);
    });

    bus.publish(quoteEnvelope("message-1"));
    bus.publish(quoteEnvelope("message-2"));
    bus.drain();

    expect(received).toEqual(["message-1", "message-2"]);
  });

  test("appends_nested_publications_to_the_queue_tail", () => {
    const bus = createInMemoryServiceBus();
    const received: string[] = [];

    bus.subscribe("state", "policy.quote.created", (message) => {
      received.push(`quote:${message.messageId}`);
      bus.publish(lifecycleEnvelope("message-2"));
    });
    bus.subscribe("state", "policy.lifecycle.changed", (message) => {
      received.push(`lifecycle:${message.messageId}`);
    });

    bus.publish(quoteEnvelope("message-1"));
    bus.drain();

    expect(received).toEqual(["quote:message-1", "lifecycle:message-2"]);
  });

  test("leaves_failed_delivery_pending_for_a_deterministic_retry", () => {
    const bus = createInMemoryServiceBus();
    let shouldFail = true;
    const successfulDeliveries: string[] = [];

    bus.subscribe("first", "policy.quote.created", () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("transient consumer failure");
      }
      successfulDeliveries.push("first");
    });
    bus.subscribe("later", "policy.quote.created", () => {
      successfulDeliveries.push("later");
    });

    bus.publish(quoteEnvelope("message-1"));
    expect(() => bus.drain()).toThrow("transient consumer failure");
    expect(successfulDeliveries).toEqual([]);
    expect(bus.deliveryLog()).toContainEqual(
      expect.objectContaining({ consumerId: "first", messageId: "message-1", status: "failed" }),
    );

    bus.drain();

    expect(successfulDeliveries).toEqual(["first", "later"]);
    expect(bus.deliveryLog()).toContainEqual(
      expect.objectContaining({ consumerId: "first", messageId: "message-1", status: "completed" }),
    );
    expect(bus.deliveryLog()).toContainEqual(
      expect.objectContaining({ consumerId: "later", messageId: "message-1", status: "completed" }),
    );
  });
});
