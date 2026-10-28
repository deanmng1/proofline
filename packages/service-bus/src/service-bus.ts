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
};

const receiptKey = (consumerId: string, messageId: string) =>
  JSON.stringify([consumerId, messageId]);

export function createInMemoryServiceBus(): ServiceBus {
  const subscriptions: Subscription[] = [];
  const queue: EventEnvelope[] = [];
  const receipts = new Set<string>();
  const deliveries: DeliveryRecord[] = [];

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
        if (!envelope) {
          return;
        }

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
  };
}
