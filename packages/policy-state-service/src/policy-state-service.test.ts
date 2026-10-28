import type { EventEnvelope, Policy, PolicyLifecycleChangedMessage } from "@testbed/domain";
import { createInMemoryServiceBus } from "@testbed/service-bus";
import { describe, expect, test } from "vitest";

import { createPolicyStateService } from "./policy-state-service";

const policy: Policy = {
  id: "policy-1",
  quoteId: "quote-1",
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
  boundAt: "2026-01-01T00:00:00.000Z",
  status: "bound",
};

const lifecycleMessage = ({
  lifecycle = "bound",
  messageId = "policy-message-1",
  policySnapshot = policy,
  revision = 1,
  tenantId = "tenant-test",
}: {
  lifecycle?: "bound" | "cancelled";
  messageId?: string;
  policySnapshot?: Policy;
  revision?: number;
  tenantId?: string;
} = {}): EventEnvelope<PolicyLifecycleChangedMessage> => ({
  messageId,
  correlationId: "command-create-1",
  causationId: "quote-message-1",
  tenantId,
  schemaVersion: 1,
  occurredAt: "2026-01-01T00:00:00.000Z",
  event: {
    type: "policy.lifecycle.changed",
    policy: policySnapshot,
    lifecycle,
    revision,
  },
});

describe("Policy State service", () => {
  test("projects_bound_policy_and_publishes_state_change", () => {
    const bus = createInMemoryServiceBus();
    const service = createPolicyStateService({ bus });
    const published: unknown[] = [];
    bus.subscribe("finance-policy-state", "policy.state.changed", (message) => {
      published.push(message);
    });

    bus.publish(lifecycleMessage());
    bus.drain();

    expect(service.getPolicyState("tenant-test", "policy-1")).toEqual({
      policyId: "policy-1",
      lifecycle: "bound",
      revision: 1,
      product: "risk_secure",
      premiumCents: 10_000,
      commissionPlan: {
        timing: "on_bind",
        rateBasisPoints: 1_000,
        holdPeriodDays: 0,
        reverseOnRefund: true,
      },
      sourcePolicyMessageId: "policy-message-1",
    });
    expect(published).toEqual([
      {
        messageId: "policy-state:policy-message-1",
        correlationId: "command-create-1",
        causationId: "policy-message-1",
        tenantId: "tenant-test",
        schemaVersion: 1,
        occurredAt: "2026-01-01T00:00:00.000Z",
        event: {
          type: "policy.state.changed",
          state: {
            policyId: "policy-1",
            lifecycle: "bound",
            revision: 1,
            product: "risk_secure",
            premiumCents: 10_000,
            commissionPlan: {
              timing: "on_bind",
              rateBasisPoints: 1_000,
              holdPeriodDays: 0,
              reverseOnRefund: true,
            },
            sourcePolicyMessageId: "policy-message-1",
          },
        },
      },
    ]);
  });

  test("projects_valid_cancelled_revision", () => {
    const bus = createInMemoryServiceBus();
    const service = createPolicyStateService({ bus });
    bus.publish(lifecycleMessage());
    bus.publish(
      lifecycleMessage({
        lifecycle: "cancelled",
        messageId: "policy-message-2",
        revision: 2,
      }),
    );

    bus.drain();

    expect(service.getPolicyState("tenant-test", "policy-1")).toEqual(
      expect.objectContaining({
        lifecycle: "cancelled",
        revision: 2,
        sourcePolicyMessageId: "policy-message-2",
      }),
    );
    expect(service.getPolicyStateTimeline("tenant-test", "policy-1")).toEqual([
      expect.objectContaining({ lifecycle: "bound", revision: 1 }),
      expect.objectContaining({ lifecycle: "cancelled", revision: 2 }),
    ]);
  });

  test("ignores_duplicate_policy_lifecycle_delivery", () => {
    const bus = createInMemoryServiceBus();
    const service = createPolicyStateService({ bus });
    const published: number[] = [];
    bus.subscribe("finance-policy-state", "policy.state.changed", () => {
      published.push(1);
    });
    const message = lifecycleMessage();

    bus.publish(message);
    bus.publish(message);
    bus.drain();

    expect(service.getPolicyStateTimeline("tenant-test", "policy-1")).toHaveLength(1);
    expect(published).toHaveLength(1);
  });

  test("ignores_stale_policy_state_revision", () => {
    const bus = createInMemoryServiceBus();
    const service = createPolicyStateService({ bus });
    bus.publish(lifecycleMessage());
    bus.publish(
      lifecycleMessage({
        lifecycle: "cancelled",
        messageId: "policy-message-2",
        revision: 2,
      }),
    );
    bus.publish(lifecycleMessage({ messageId: "policy-message-stale" }));

    bus.drain();

    expect(service.getPolicyState("tenant-test", "policy-1")).toEqual(
      expect.objectContaining({ lifecycle: "cancelled", revision: 2 }),
    );
    expect(service.getPolicyStateTimeline("tenant-test", "policy-1")).toHaveLength(2);
  });

  test("isolates_tenant_and_policy_ids_that_contain_key_delimiters", () => {
    const bus = createInMemoryServiceBus();
    const service = createPolicyStateService({ bus });
    const firstPolicy = { ...policy, id: "c" };
    const secondPolicy = {
      ...policy,
      id: "b:c",
      premiumCents: 20_000,
      commissionPlan: { ...policy.commissionPlan },
    };
    bus.publish(
      lifecycleMessage({
        messageId: "policy-message-delimited-1",
        policySnapshot: firstPolicy,
        tenantId: "a:b",
      }),
    );
    bus.publish(
      lifecycleMessage({
        messageId: "policy-message-delimited-2",
        policySnapshot: secondPolicy,
        tenantId: "a",
      }),
    );

    bus.drain();

    expect(service.getPolicyState("a:b", "c")).toEqual(
      expect.objectContaining({ policyId: "c", premiumCents: 10_000 }),
    );
    expect(service.getPolicyState("a", "b:c")).toEqual(
      expect.objectContaining({ policyId: "b:c", premiumCents: 20_000 }),
    );
    expect(service.getPolicyStateTimeline("a:b", "c")).toHaveLength(1);
    expect(service.getPolicyStateTimeline("a", "b:c")).toHaveLength(1);
  });

  test("rejects_conflicting_same_revision", () => {
    const bus = createInMemoryServiceBus();
    createPolicyStateService({ bus });
    bus.publish(lifecycleMessage());
    bus.drain();
    bus.publish(
      lifecycleMessage({
        lifecycle: "cancelled",
        messageId: "policy-message-conflict",
      }),
    );

    expect(() => bus.drain()).toThrow("Conflicting Policy State revision");
  });

  test("rejects_skipped_or_invalid_lifecycle_transition", () => {
    const skippedBus = createInMemoryServiceBus();
    createPolicyStateService({ bus: skippedBus });
    skippedBus.publish(lifecycleMessage({ messageId: "policy-message-2", revision: 2 }));

    expect(() => skippedBus.drain()).toThrow("Policy State revision must begin at 1");

    const invalidBus = createInMemoryServiceBus();
    createPolicyStateService({ bus: invalidBus });
    invalidBus.publish(lifecycleMessage({ lifecycle: "cancelled" }));

    expect(() => invalidBus.drain()).toThrow("Initial Policy State must be bound");
  });
});
