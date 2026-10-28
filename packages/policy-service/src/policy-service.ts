import type {
  CommissionPlan,
  EventEnvelope,
  Policy,
  PolicyLifecycle,
  PolicyLifecycleChangedMessage,
  PolicyQuoteCreatedMessage,
  Product,
  Quote,
} from "@testbed/domain";
import { assertCommissionPlan } from "@testbed/domain";
import type { ServiceBus } from "@testbed/service-bus";

export type Clock = () => string;

export type IdFactory = {
  next(prefix: string): string;
};

export type PolicyReferenceData = {
  ownsProperty(input: { tenantId: string; customerId: string; propertyId: string }): boolean;
};

export type CreateQuoteCommand = {
  commandId: string;
  correlationId: string;
  tenantId: string;
  customerId: string;
  propertyId: string;
  product: Product;
  premiumCents: number;
  commissionPlan: CommissionPlan;
  quoteId?: string;
};

export type BindQuoteCommand = {
  commandId: string;
  correlationId: string;
  tenantId: string;
  quoteId: string;
  policyId?: string;
};

export type TransitionPolicyCommand = {
  commandId: string;
  correlationId: string;
  tenantId: string;
  policyId: string;
  lifecycle: "cancelled";
};

export type PolicyService = {
  createQuote(command: CreateQuoteCommand): Quote;
  bindQuote(command: BindQuoteCommand): Policy;
  transitionPolicy(command: TransitionPolicyCommand): void;
  getQuote(tenantId: string, quoteId: string): Quote | undefined;
  getPolicy(tenantId: string, policyId: string): Policy | undefined;
};

type PolicyServiceOptions = {
  bus: ServiceBus;
  clock: Clock;
  ids: IdFactory;
  referenceData: PolicyReferenceData;
};

type QuoteRecord = {
  quote: Quote;
  createdMessageId: string;
  correlationId: string;
};

type PolicyRecord = {
  policy: Policy;
  correlationId: string;
  lifecycle: PolicyLifecycle;
  revision: number;
  lifecycleMessageId: string;
};

type CommandReceipt = {
  fingerprint: string;
  result: unknown;
};

const recordKey = (tenantId: string, id: string) => JSON.stringify([tenantId, id]);

const commandFingerprint = (input: object) => JSON.stringify(input);

const assertNonEmpty = (value: string, label: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
};

const assertPositiveCents = (amountCents: number) => {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error("Quote premium must be a positive integer number of cents.");
  }
};

export function createPolicyService({
  bus,
  clock,
  ids,
  referenceData,
}: PolicyServiceOptions): PolicyService {
  const quotes = new Map<string, QuoteRecord>();
  const policies = new Map<string, PolicyRecord>();
  const commandReceipts = new Map<string, CommandReceipt>();

  const runCommand = <T>(commandId: string, input: { tenantId: string }, action: () => T): T => {
    assertNonEmpty(commandId, "Command ID");
    assertNonEmpty(input.tenantId, "Tenant ID");
    const fingerprint = commandFingerprint(input);
    const key = recordKey(input.tenantId, commandId);
    const receipt = commandReceipts.get(key);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new Error("Command ID was already used with different input.");
      }
      return receipt.result as T;
    }

    const result = action();
    commandReceipts.set(key, { fingerprint, result });
    return result;
  };

  const publish = <TEvent extends PolicyQuoteCreatedMessage | PolicyLifecycleChangedMessage>(
    envelope: EventEnvelope<TEvent>,
  ) => {
    bus.publish(envelope);
  };

  return {
    createQuote(command) {
      return runCommand(command.commandId, command, () => {
        assertNonEmpty(command.tenantId, "Tenant ID");
        assertNonEmpty(command.correlationId, "Correlation ID");
        assertNonEmpty(command.customerId, "Customer ID");
        assertNonEmpty(command.propertyId, "Property ID");
        assertPositiveCents(command.premiumCents);
        assertCommissionPlan(command.commissionPlan);
        if (
          !referenceData.ownsProperty({
            tenantId: command.tenantId,
            customerId: command.customerId,
            propertyId: command.propertyId,
          })
        ) {
          throw new Error("Property is not owned by the customer in this tenant.");
        }

        const quoteId = command.quoteId ?? ids.next("quote");
        const key = recordKey(command.tenantId, quoteId);
        if (quotes.has(key)) {
          throw new Error(`Quote already exists: ${quoteId}`);
        }
        const quote: Quote = {
          id: quoteId,
          customerId: command.customerId,
          propertyId: command.propertyId,
          product: command.product,
          premiumCents: command.premiumCents,
          commissionPlan: command.commissionPlan,
          createdAt: clock(),
          status: "quoted",
        };
        const messageId = ids.next("message");
        quotes.set(key, {
          quote,
          createdMessageId: messageId,
          correlationId: command.correlationId,
        });
        publish({
          messageId,
          correlationId: command.correlationId,
          tenantId: command.tenantId,
          schemaVersion: 1,
          occurredAt: quote.createdAt,
          event: { type: "policy.quote.created", quote },
        });
        return quote;
      });
    },
    bindQuote(command) {
      return runCommand(command.commandId, command, () => {
        assertNonEmpty(command.tenantId, "Tenant ID");
        assertNonEmpty(command.correlationId, "Correlation ID");
        assertNonEmpty(command.quoteId, "Quote ID");
        const quoteKey = recordKey(command.tenantId, command.quoteId);
        const quoteRecord = quotes.get(quoteKey);
        if (!quoteRecord) {
          throw new Error(`Unknown quote: ${command.quoteId}`);
        }
        if (quoteRecord.quote.status === "bound") {
          throw new Error(`Quote is already bound: ${command.quoteId}`);
        }

        const policyId = command.policyId ?? ids.next("policy");
        const policyKey = recordKey(command.tenantId, policyId);
        if (policies.has(policyKey)) {
          throw new Error(`Policy already exists: ${policyId}`);
        }

        const boundAt = clock();
        const { createdAt: _createdAt, status: _quoteStatus, ...policyFields } = quoteRecord.quote;
        const policy: Policy = {
          ...policyFields,
          id: policyId,
          quoteId: quoteRecord.quote.id,
          boundAt,
          status: "bound",
        };
        const messageId = ids.next("message");
        quotes.set(quoteKey, { ...quoteRecord, quote: { ...quoteRecord.quote, status: "bound" } });
        policies.set(policyKey, {
          policy,
          correlationId: command.correlationId,
          lifecycle: "bound",
          revision: 1,
          lifecycleMessageId: messageId,
        });
        publish({
          messageId,
          correlationId: command.correlationId,
          causationId: quoteRecord.createdMessageId,
          tenantId: command.tenantId,
          schemaVersion: 1,
          occurredAt: boundAt,
          event: {
            type: "policy.lifecycle.changed",
            policy,
            lifecycle: "bound",
            revision: 1,
          },
        });
        return policy;
      });
    },
    transitionPolicy(command) {
      runCommand(command.commandId, command, () => {
        assertNonEmpty(command.tenantId, "Tenant ID");
        assertNonEmpty(command.correlationId, "Correlation ID");
        const key = recordKey(command.tenantId, command.policyId);
        const policyRecord = policies.get(key);
        if (!policyRecord) {
          throw new Error(`Unknown policy: ${command.policyId}`);
        }
        if (policyRecord.lifecycle !== "bound" || command.lifecycle !== "cancelled") {
          throw new Error("Policy lifecycle transition is not allowed.");
        }

        const revision = policyRecord.revision + 1;
        const messageId = ids.next("message");
        const occurredAt = clock();
        policies.set(key, {
          ...policyRecord,
          lifecycle: command.lifecycle,
          revision,
          lifecycleMessageId: messageId,
        });
        publish({
          messageId,
          correlationId: command.correlationId,
          causationId: policyRecord.lifecycleMessageId,
          tenantId: command.tenantId,
          schemaVersion: 1,
          occurredAt,
          event: {
            type: "policy.lifecycle.changed",
            policy: policyRecord.policy,
            lifecycle: command.lifecycle,
            revision,
          },
        });
      });
    },
    getQuote(tenantId, quoteId) {
      return quotes.get(recordKey(tenantId, quoteId))?.quote;
    },
    getPolicy(tenantId, policyId) {
      return policies.get(recordKey(tenantId, policyId))?.policy;
    },
  };
}
