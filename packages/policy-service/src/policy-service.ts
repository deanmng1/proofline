import type {
  CommissionPlan,
  DeepReadonly,
  EventEnvelope,
  Policy,
  PolicyLifecycle,
  PolicyLifecycleChangedMessage,
  PolicyQuoteCreatedMessage,
  Product,
  Quote,
} from "@testbed/domain";
import { assertCommissionPlan, assertUtcTimestamp, immutableSnapshot } from "@testbed/domain";
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
  createQuote(command: CreateQuoteCommand): DeepReadonly<Quote>;
  bindQuote(command: BindQuoteCommand): DeepReadonly<Policy>;
  transitionPolicy(command: TransitionPolicyCommand): void;
  getQuote(tenantId: string, quoteId: string): DeepReadonly<Quote> | undefined;
  getPolicy(tenantId: string, policyId: string): DeepReadonly<Policy> | undefined;
};

type PolicyServiceOptions = {
  bus: ServiceBus;
  clock: Clock;
  ids: IdFactory;
  referenceData: PolicyReferenceData;
  registerPersistence?: (port: PolicyServicePersistencePort) => void;
};

type QuoteRecord = {
  quote: DeepReadonly<Quote>;
  createdMessageId: string;
  correlationId: string;
};

type PolicyRecord = {
  policy: DeepReadonly<Policy>;
  correlationId: string;
  lifecycle: PolicyLifecycle;
  revision: number;
  lifecycleMessageId: string;
};

type CommandReceipt = {
  fingerprint: string;
  result: unknown;
};

export type PolicyServiceCheckpoint = {
  version: 1;
  quotes: { key: string; value: QuoteRecord }[];
  policies: { key: string; value: PolicyRecord }[];
  commandReceipts: { key: string; value: CommandReceipt }[];
};

export type PolicyServicePersistencePort = {
  checkpoint(): PolicyServiceCheckpoint;
  hydrate(checkpoint: PolicyServiceCheckpoint): void;
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
  registerPersistence,
}: PolicyServiceOptions): PolicyService {
  const quotes = new Map<string, QuoteRecord>();
  const policies = new Map<string, PolicyRecord>();
  const commandReceipts = new Map<string, CommandReceipt>();

  const runCommand = <T>(
    commandId: string,
    input: { tenantId: string },
    action: () => T,
  ): DeepReadonly<T> => {
    assertNonEmpty(commandId, "Command ID");
    assertNonEmpty(input.tenantId, "Tenant ID");
    const fingerprint = commandFingerprint(input);
    const key = recordKey(input.tenantId, commandId);
    const receipt = commandReceipts.get(key);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new Error("Command ID was already used with different input.");
      }
      return immutableSnapshot(receipt.result as T);
    }

    const result = action();
    commandReceipts.set(key, { fingerprint, result: immutableSnapshot(result) });
    return immutableSnapshot(result);
  };

  const publish = <TEvent extends PolicyQuoteCreatedMessage | PolicyLifecycleChangedMessage>(
    envelope: EventEnvelope<TEvent>,
  ) => {
    bus.publish(envelope);
  };

  const mapRows = <T>(map: Map<string, T>) =>
    [...map.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({ key, value: structuredClone(value) }));
  const hydrateRows = <T>(
    label: string,
    rows: { key: string; value: T }[],
    validate: (key: string, value: T) => void,
  ): Map<string, T> => {
    if (!Array.isArray(rows)) throw new Error(`Invalid Policy checkpoint ${label}.`);
    const next = new Map<string, T>();
    for (const row of rows) {
      if (!row || typeof row.key !== "string" || !row.value)
        throw new Error(`Invalid Policy checkpoint ${label} row.`);
      if (next.has(row.key)) throw new Error(`Duplicate Policy checkpoint ${label} key.`);
      validate(row.key, row.value);
      next.set(row.key, immutableSnapshot(row.value) as T);
    }
    return next;
  };
  const parseKey = (value: string, label: string): [string, string] => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(`Invalid Policy checkpoint ${label} key.`);
    }
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      !parsed[0].trim() ||
      typeof parsed[1] !== "string" ||
      !parsed[1].trim()
    )
      throw new Error(`Invalid Policy checkpoint ${label} identity.`);
    return [parsed[0], parsed[1]];
  };
  const persistence: PolicyServicePersistencePort = {
    checkpoint: () => ({
      version: 1,
      quotes: mapRows(quotes),
      policies: mapRows(policies),
      commandReceipts: mapRows(commandReceipts),
    }),
    hydrate(checkpoint) {
      const restored = structuredClone(checkpoint);
      if (restored?.version !== 1) throw new Error("Invalid Policy checkpoint version.");
      const nextQuotes = hydrateRows("quote", restored.quotes, (key, record) => {
        const [, id] = parseKey(key, "quote");
        if (
          id !== record.quote.id ||
          !record.createdMessageId ||
          !record.correlationId ||
          (record.quote.product !== "risk_secure" && record.quote.product !== "risk_secure_plus") ||
          (record.quote.status !== "quoted" && record.quote.status !== "bound")
        )
          throw new Error("Invalid Policy checkpoint quote identity.");
        assertPositiveCents(record.quote.premiumCents);
        assertCommissionPlan(record.quote.commissionPlan);
        assertUtcTimestamp(record.quote.createdAt);
      });
      const nextPolicies = hydrateRows("policy", restored.policies, (key, record) => {
        const [tenantId, id] = parseKey(key, "policy");
        if (
          id !== record.policy.id ||
          record.policy.status !== record.lifecycle ||
          (record.policy.product !== "risk_secure" &&
            record.policy.product !== "risk_secure_plus") ||
          (record.lifecycle !== "bound" && record.lifecycle !== "cancelled") ||
          !Number.isSafeInteger(record.revision) ||
          record.revision !== (record.lifecycle === "bound" ? 1 : 2) ||
          !record.lifecycleMessageId ||
          !record.correlationId ||
          !nextQuotes.has(recordKey(tenantId, record.policy.quoteId))
        )
          throw new Error("Invalid Policy checkpoint policy identity.");
        assertPositiveCents(record.policy.premiumCents);
        assertCommissionPlan(record.policy.commissionPlan);
        assertUtcTimestamp(record.policy.boundAt);
      });
      const nextReceipts = hydrateRows(
        "command receipt",
        restored.commandReceipts,
        (key, receipt) => {
          const [tenantId, commandId] = parseKey(key, "command receipt");
          if (typeof receipt.fingerprint !== "string")
            throw new Error("Invalid Policy checkpoint command receipt fingerprint.");
          let input: Record<string, unknown>;
          try {
            input = JSON.parse(receipt.fingerprint) as Record<string, unknown>;
          } catch {
            throw new Error("Invalid Policy checkpoint command receipt fingerprint.");
          }
          if (
            !input ||
            typeof input !== "object" ||
            input.tenantId !== tenantId ||
            input.commandId !== commandId ||
            commandFingerprint(input) !== receipt.fingerprint
          )
            throw new Error("Invalid Policy checkpoint command receipt fingerprint identity.");
          if (typeof input.customerId === "string" && typeof input.product === "string") {
            const result = receipt.result as Quote | undefined;
            const restoredQuote = result && nextQuotes.get(recordKey(tenantId, result.id))?.quote;
            if (!result || !restoredQuote) {
              throw new Error("Invalid Policy checkpoint quote command result.");
            }
            const { status: resultStatus, ...resultFacts } = result;
            const { status: restoredStatus, ...restoredFacts } = restoredQuote;
            if (
              resultStatus !== "quoted" ||
              (restoredStatus !== "quoted" && restoredStatus !== "bound") ||
              JSON.stringify(resultFacts) !== JSON.stringify(restoredFacts)
            )
              throw new Error("Invalid Policy checkpoint quote command result.");
            return;
          }
          if (typeof input.quoteId === "string") {
            const result = receipt.result as Policy | undefined;
            const restoredPolicy =
              result && nextPolicies.get(recordKey(tenantId, result.id))?.policy;
            if (!result || !restoredPolicy) {
              throw new Error("Invalid Policy checkpoint bind command result.");
            }
            const { status: resultStatus, ...resultFacts } = result;
            const { status: restoredStatus, ...restoredFacts } = restoredPolicy;
            if (
              resultStatus !== "bound" ||
              (restoredStatus !== "bound" && restoredStatus !== "cancelled") ||
              JSON.stringify(resultFacts) !== JSON.stringify(restoredFacts)
            )
              throw new Error("Invalid Policy checkpoint bind command result.");
            return;
          }
          if (input.lifecycle === "cancelled" && typeof input.policyId === "string") {
            if (receipt.result !== undefined)
              throw new Error("Invalid Policy checkpoint transition command result.");
            const restoredPolicy = nextPolicies.get(recordKey(tenantId, input.policyId));
            if (restoredPolicy?.lifecycle !== "cancelled")
              throw new Error("Invalid Policy checkpoint transition result identity.");
            return;
          }
          throw new Error("Invalid Policy checkpoint command receipt input.");
        },
      );
      quotes.clear();
      policies.clear();
      commandReceipts.clear();
      for (const [key, value] of nextQuotes) quotes.set(key, value);
      for (const [key, value] of nextPolicies) policies.set(key, value);
      for (const [key, value] of nextReceipts) commandReceipts.set(key, value);
    },
  };
  registerPersistence?.(persistence);

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
        const quote = immutableSnapshot<Quote>({
          id: quoteId,
          customerId: command.customerId,
          propertyId: command.propertyId,
          product: command.product,
          premiumCents: command.premiumCents,
          commissionPlan: command.commissionPlan,
          createdAt: assertUtcTimestamp(clock()),
          status: "quoted",
        });
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

        const boundAt = assertUtcTimestamp(clock());
        const { createdAt: _createdAt, status: _quoteStatus, ...policyFields } = quoteRecord.quote;
        const policy = immutableSnapshot<Policy>({
          ...policyFields,
          id: policyId,
          quoteId: quoteRecord.quote.id,
          boundAt,
          status: "bound",
        });
        const messageId = ids.next("message");
        quotes.set(quoteKey, {
          ...quoteRecord,
          quote: immutableSnapshot({ ...quoteRecord.quote, status: "bound" as const }),
        });
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
        const occurredAt = assertUtcTimestamp(clock());
        const transitionedPolicy = immutableSnapshot<Policy>({
          ...policyRecord.policy,
          status: command.lifecycle,
        });
        policies.set(key, {
          ...policyRecord,
          policy: transitionedPolicy,
          correlationId: command.correlationId,
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
            policy: transitionedPolicy,
            lifecycle: command.lifecycle,
            revision,
          },
        });
      });
    },
    getQuote(tenantId, quoteId) {
      return immutableSnapshot(quotes.get(recordKey(tenantId, quoteId))?.quote);
    },
    getPolicy(tenantId, policyId) {
      return immutableSnapshot(policies.get(recordKey(tenantId, policyId))?.policy);
    },
  };
}
