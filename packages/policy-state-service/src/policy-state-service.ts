import type {
  EventEnvelope,
  PolicyLifecycleChangedMessage,
  PolicyStateChangedMessage,
  PolicyStateProjection,
} from "@testbed/domain";
import { assertCommissionPlan, assertUtcTimestamp } from "@testbed/domain";
import type { ServiceBus } from "@testbed/service-bus";

export type PolicyStateService = {
  getPolicyState(tenantId: string, policyId: string): PolicyStateProjection | undefined;
  getPolicyStateTimeline(tenantId: string, policyId: string): PolicyStateProjection[];
};

type PolicyStateServiceOptions = {
  bus: ServiceBus;
  registerPersistence?: (port: PolicyStatePersistencePort) => void;
};

export type PolicyStateCheckpoint = {
  version: 1;
  timelines: { tenantId: string; policyId: string; states: PolicyStateProjection[] }[];
};

export type PolicyStatePersistencePort = {
  checkpoint(): PolicyStateCheckpoint;
  hydrate(checkpoint: PolicyStateCheckpoint): void;
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

export function createPolicyStateService({
  bus,
  registerPersistence,
}: PolicyStateServiceOptions): PolicyStateService {
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
    assertUtcTimestamp(message.occurredAt);
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

  const persistence: PolicyStatePersistencePort = {
    checkpoint: () => ({
      version: 1,
      timelines: [...timelinesByTenant.entries()]
        .flatMap(([tenantId, timelines]) =>
          [...timelines.entries()].map(([policyId, states]) => ({
            tenantId,
            policyId,
            states: states.map(copyState),
          })),
        )
        .sort((left, right) =>
          JSON.stringify([left.tenantId, left.policyId]).localeCompare(
            JSON.stringify([right.tenantId, right.policyId]),
          ),
        ),
    }),
    hydrate(checkpoint) {
      const restored = structuredClone(checkpoint);
      if (restored?.version !== 1 || !Array.isArray(restored.timelines))
        throw new Error("Invalid Policy State checkpoint.");
      const next = new Map<string, Map<string, PolicyStateProjection[]>>();
      for (const row of restored.timelines) {
        if (
          !row ||
          typeof row.tenantId !== "string" ||
          !row.tenantId.trim() ||
          typeof row.policyId !== "string" ||
          !row.policyId.trim() ||
          !Array.isArray(row.states) ||
          row.states.length === 0 ||
          row.states.length > 2
        )
          throw new Error("Invalid Policy State checkpoint timeline identity or terminal history.");
        const tenant = next.get(row.tenantId) ?? new Map<string, PolicyStateProjection[]>();
        if (tenant.has(row.policyId))
          throw new Error("Duplicate Policy State checkpoint timeline.");
        const sourceMessageIds = new Set<string>();
        row.states.forEach((state, index) => {
          if (
            state.policyId !== row.policyId ||
            state.revision !== index + 1 ||
            (index === 0 && state.lifecycle !== "bound") ||
            (index > 0 && state.lifecycle !== "cancelled") ||
            (state.product !== "risk_secure" && state.product !== "risk_secure_plus") ||
            !Number.isSafeInteger(state.premiumCents) ||
            state.premiumCents <= 0 ||
            typeof state.sourcePolicyMessageId !== "string" ||
            !state.sourcePolicyMessageId.trim() ||
            sourceMessageIds.has(state.sourcePolicyMessageId)
          )
            throw new Error("Invalid Policy State checkpoint revision or source history.");
          assertCommissionPlan(state.commissionPlan);
          sourceMessageIds.add(state.sourcePolicyMessageId);
          if (index > 0 && !samePolicySnapshot(row.states[0], state))
            throw new Error("Invalid Policy State checkpoint immutable snapshot history.");
        });
        tenant.set(row.policyId, row.states.map(copyState));
        next.set(row.tenantId, tenant);
      }
      timelinesByTenant.clear();
      for (const [tenantId, timelines] of next) timelinesByTenant.set(tenantId, timelines);
    },
  };
  registerPersistence?.(persistence);

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
