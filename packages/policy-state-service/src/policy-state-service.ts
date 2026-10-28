import type {
  EventEnvelope,
  PolicyLifecycleChangedMessage,
  PolicyStateChangedMessage,
  PolicyStateProjection,
} from "@testbed/domain";
import type { ServiceBus } from "@testbed/service-bus";

export type PolicyStateService = {
  getPolicyState(tenantId: string, policyId: string): PolicyStateProjection | undefined;
  getPolicyStateTimeline(tenantId: string, policyId: string): PolicyStateProjection[];
};

type PolicyStateServiceOptions = {
  bus: ServiceBus;
};

const copyState = (state: PolicyStateProjection): PolicyStateProjection => ({
  ...state,
  commissionPlan: { ...state.commissionPlan },
});

const samePolicySnapshot = (
  current: PolicyStateProjection,
  incoming: PolicyStateProjection,
): boolean =>
  current.policyId === incoming.policyId &&
  current.product === incoming.product &&
  current.premiumCents === incoming.premiumCents &&
  current.commissionPlan.timing === incoming.commissionPlan.timing &&
  current.commissionPlan.rateBasisPoints === incoming.commissionPlan.rateBasisPoints &&
  current.commissionPlan.holdPeriodDays === incoming.commissionPlan.holdPeriodDays &&
  current.commissionPlan.reverseOnRefund === incoming.commissionPlan.reverseOnRefund;

const projectState = (
  message: EventEnvelope<PolicyLifecycleChangedMessage>,
): PolicyStateProjection => ({
  policyId: message.event.policy.id,
  lifecycle: message.event.lifecycle,
  revision: message.event.revision,
  product: message.event.policy.product,
  premiumCents: message.event.policy.premiumCents,
  commissionPlan: { ...message.event.policy.commissionPlan },
  sourcePolicyMessageId: message.messageId,
});

export function createPolicyStateService({ bus }: PolicyStateServiceOptions): PolicyStateService {
  const timelinesByTenant = new Map<string, Map<string, PolicyStateProjection[]>>();

  const getTimeline = (tenantId: string, policyId: string) =>
    timelinesByTenant.get(tenantId)?.get(policyId);

  const setTimeline = (tenantId: string, policyId: string, timeline: PolicyStateProjection[]) => {
    const tenantTimelines = timelinesByTenant.get(tenantId) ?? new Map();
    tenantTimelines.set(policyId, timeline);
    timelinesByTenant.set(tenantId, tenantTimelines);
  };

  const appendAndPublish = (
    message: EventEnvelope<PolicyLifecycleChangedMessage>,
    state: PolicyStateProjection,
  ) => {
    const timeline = getTimeline(message.tenantId, state.policyId) ?? [];
    setTimeline(message.tenantId, state.policyId, [...timeline, copyState(state)]);

    const envelope: EventEnvelope<PolicyStateChangedMessage> = {
      messageId: `policy-state:${message.messageId}`,
      correlationId: message.correlationId,
      causationId: message.messageId,
      tenantId: message.tenantId,
      schemaVersion: 1,
      occurredAt: message.occurredAt,
      event: {
        type: "policy.state.changed",
        state: copyState(state),
      },
    };
    bus.publish(envelope);
  };

  bus.subscribe("policy-state", "policy.lifecycle.changed", (message) => {
    const incoming = projectState(message);
    const timeline = getTimeline(message.tenantId, incoming.policyId) ?? [];
    const current = timeline.at(-1);

    if (!current) {
      if (incoming.revision !== 1) {
        throw new Error("Policy State revision must begin at 1.");
      }
      if (incoming.lifecycle !== "bound") {
        throw new Error("Initial Policy State must be bound.");
      }
      appendAndPublish(message, incoming);
      return;
    }

    if (incoming.revision < current.revision) {
      return;
    }

    if (incoming.revision === current.revision) {
      if (incoming.lifecycle === current.lifecycle && samePolicySnapshot(current, incoming)) {
        return;
      }
      throw new Error(`Conflicting Policy State revision: ${incoming.revision}.`);
    }

    if (incoming.revision !== current.revision + 1) {
      throw new Error("Policy State revision cannot be skipped.");
    }
    if (current.lifecycle !== "bound" || incoming.lifecycle !== "cancelled") {
      throw new Error("Policy State lifecycle transition is not allowed.");
    }
    if (!samePolicySnapshot(current, incoming)) {
      throw new Error("Policy snapshot cannot change during a lifecycle transition.");
    }

    appendAndPublish(message, incoming);
  });

  return {
    getPolicyState(tenantId, policyId) {
      const state = getTimeline(tenantId, policyId)?.at(-1);
      return state ? copyState(state) : undefined;
    },
    getPolicyStateTimeline(tenantId, policyId) {
      return (getTimeline(tenantId, policyId) ?? []).map(copyState);
    },
  };
}
