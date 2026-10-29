import type { EventEnvelope, ServiceEvent } from "@testbed/domain";
import { assertUtcTimestamp, immutableSnapshot } from "@testbed/domain";

type EventType = ServiceEvent["type"];
type EventFor<TEventType extends EventType> = Extract<ServiceEvent, { type: TEventType }>;
type EventHandler<TEventType extends EventType> = (
  envelope: EventEnvelope<EventFor<TEventType>>,
) => void;

type Subscription = {
  consumerId: string;
  eventType: EventType;
  handler: (envelope: EventEnvelope) => void;
};

export type DeliveryRecord = {
  consumerId: string;
  messageId: string;
  eventType: EventType;
  status: "completed" | "failed";
  error?: string;
};

export type ServiceBusCheckpoint = {
  version: 1;
  queue: EventEnvelope[];
  completedReceipts: { consumerId: string; messageId: string }[];
  deliveries: DeliveryRecord[];
};

export type ServiceBus = {
  subscribe<TEventType extends EventType>(
    consumerId: string,
    eventType: TEventType,
    handler: EventHandler<TEventType>,
  ): void;
  publish(envelope: EventEnvelope): void;
  drain(): void;
  deliveryLog(): DeliveryRecord[];
  pendingMessages(): EventEnvelope[];
  checkpoint(): ServiceBusCheckpoint;
};

const receiptKey = (consumerId: string, messageId: string) =>
  JSON.stringify([consumerId, messageId]);

const clone = <T>(value: T): T => structuredClone(value);

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid service bus checkpoint: ${label} is required.`);
  }
  return value;
};

const restoreCheckpoint = (input: ServiceBusCheckpoint | undefined): ServiceBusCheckpoint => {
  if (input === undefined) {
    return { version: 1, queue: [], completedReceipts: [], deliveries: [] };
  }
  const checkpoint = clone(input) as ServiceBusCheckpoint;
  if (!checkpoint || typeof checkpoint !== "object" || checkpoint.version !== 1) {
    throw new Error("Invalid service bus checkpoint version.");
  }
  if (
    !Array.isArray(checkpoint.queue) ||
    !Array.isArray(checkpoint.completedReceipts) ||
    !Array.isArray(checkpoint.deliveries)
  ) {
    throw new Error("Invalid service bus checkpoint collections.");
  }
  const messageIds = new Set<string>();
  for (const envelope of checkpoint.queue) {
    if (!envelope || typeof envelope !== "object" || !envelope.event) {
      throw new Error("Invalid service bus checkpoint envelope.");
    }
    requireString(envelope.messageId, "message ID");
    requireString(envelope.correlationId, "correlation ID");
    requireString(envelope.tenantId, "tenant ID");
    assertUtcTimestamp(envelope.occurredAt);
    if (messageIds.has(envelope.messageId)) {
      throw new Error(
        `Invalid service bus checkpoint: duplicate queued message ${envelope.messageId}.`,
      );
    }
    messageIds.add(envelope.messageId);
  }
  const receiptKeys = new Set<string>();
  for (const receipt of checkpoint.completedReceipts) {
    const key = receiptKey(
      requireString(receipt?.consumerId, "consumer ID"),
      requireString(receipt?.messageId, "receipt message ID"),
    );
    if (receiptKeys.has(key)) {
      throw new Error("Invalid service bus checkpoint: duplicate completed receipt.");
    }
    receiptKeys.add(key);
  }
  const completedDeliveryKeys = new Set<string>();
  for (const delivery of checkpoint.deliveries) {
    requireString(delivery?.consumerId, "delivery consumer ID");
    requireString(delivery?.messageId, "delivery message ID");
    requireString(delivery?.eventType, "delivery event type");
    if (delivery.status !== "completed" && delivery.status !== "failed") {
      throw new Error("Invalid service bus checkpoint delivery status.");
    }
    const queued = checkpoint.queue.find((message) => message.messageId === delivery.messageId);
    if (queued && delivery.eventType !== queued.event.type) {
      throw new Error("Invalid service bus checkpoint delivery event type.");
    }
    if (delivery.status === "completed") {
      completedDeliveryKeys.add(receiptKey(delivery.consumerId, delivery.messageId));
    }
  }
  if (
    receiptKeys.size !== completedDeliveryKeys.size ||
    [...receiptKeys].some((key) => !completedDeliveryKeys.has(key))
  ) {
    throw new Error("Invalid service bus checkpoint: completed receipt and delivery log disagree.");
  }
  return checkpoint;
};

export function createInMemoryServiceBus(input?: ServiceBusCheckpoint): ServiceBus {
  const checkpoint = restoreCheckpoint(input);
  const subscriptions: Subscription[] = [];
  const queue: EventEnvelope[] = checkpoint.queue.map((envelope) => immutableSnapshot(envelope));
  const receipts = new Set(
    checkpoint.completedReceipts.map(({ consumerId, messageId }) =>
      receiptKey(consumerId, messageId),
    ),
  );
  const deliveries: DeliveryRecord[] = checkpoint.deliveries.map((delivery) => ({
    ...delivery,
  }));

  return {
    subscribe(consumerId, eventType, handler) {
      subscriptions.push({
        consumerId,
        eventType,
        handler: (envelope) => handler(envelope as EventEnvelope<EventFor<typeof eventType>>),
      });
    },
    publish(envelope) {
      assertUtcTimestamp(envelope.occurredAt);
      queue.push(immutableSnapshot(envelope));
    },
    drain() {
      while (queue.length > 0) {
        const envelope = queue[0];

        const matchingSubscriptions = subscriptions.filter(
          (subscription) => subscription.eventType === envelope.event.type,
        );

        for (const subscription of matchingSubscriptions) {
          const key = receiptKey(subscription.consumerId, envelope.messageId);
          if (receipts.has(key)) {
            continue;
          }

          try {
            subscription.handler(envelope);
            receipts.add(key);
            deliveries.push({
              consumerId: subscription.consumerId,
              messageId: envelope.messageId,
              eventType: envelope.event.type,
              status: "completed",
            });
          } catch (error) {
            deliveries.push({
              consumerId: subscription.consumerId,
              messageId: envelope.messageId,
              eventType: envelope.event.type,
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        }

        queue.shift();
      }
    },
    deliveryLog() {
      return deliveries.map((delivery) => ({ ...delivery }));
    },
    pendingMessages() {
      return queue.map((envelope) => immutableSnapshot(envelope));
    },
    checkpoint() {
      return clone({
        version: 1,
        queue,
        completedReceipts: [...receipts]
          .map((value) => {
            const parsed = JSON.parse(value) as [string, string];
            return { consumerId: parsed[0], messageId: parsed[1] };
          })
          .sort((a, b) =>
            receiptKey(a.consumerId, a.messageId).localeCompare(
              receiptKey(b.consumerId, b.messageId),
            ),
          ),
        deliveries,
      });
    },
  };
}
