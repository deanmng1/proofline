import type { EventEnvelope, Policy, PolicyStateProjection, Quote } from "@testbed/domain";
import { assertUtcTimestamp, isCommissionPlan } from "@testbed/domain";
import {
  type AmountCommand,
  type CommissionPaymentCommand,
  createFinanceService,
  type FinanceAuditEntry,
  type FinanceLedger,
  type FinancePersistencePort,
  type FinanceServiceCheckpoint,
  type RefundCommand,
} from "@testbed/finance-service";
import {
  type BindQuoteCommand,
  type CreateQuoteCommand,
  createPolicyService,
  type PolicyReferenceData,
  type PolicyServiceCheckpoint,
  type PolicyServicePersistencePort,
  type TransitionPolicyCommand,
} from "@testbed/policy-service";
import {
  createPolicyStateService,
  type PolicyStateCheckpoint,
  type PolicyStatePersistencePort,
} from "@testbed/policy-state-service";
import {
  createInMemoryServiceBus,
  type DeliveryRecord,
  type ServiceBus,
  type ServiceBusCheckpoint,
} from "@testbed/service-bus";

export type Customer = { tenantId: string; id: string; name: string; email: string };
export type Property = {
  tenantId: string;
  id: string;
  customerId: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
};
type CommandMetadata = { schemaVersion: 1; occurredAt?: string; correlationId: string };
export type CreateCustomerCommand = CommandMetadata & {
  type: "create_customer";
  commandId: string;
  tenantId: string;
  customerId?: string;
  name: string;
  email: string;
};
export type CreatePropertyCommand = CommandMetadata & {
  type: "create_property";
  commandId: string;
  tenantId: string;
  propertyId?: string;
  customerId: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
};
export type RuntimeCommand = CommandMetadata &
  (
    | CreateCustomerCommand
    | CreatePropertyCommand
    | ({ type: "create_quote" } & CreateQuoteCommand)
    | ({ type: "bind_quote" } & BindQuoteCommand)
    | ({ type: "transition_policy" } & TransitionPolicyCommand)
    | ({
        type: "deposit_recorded" | "premium_payment_settled" | "claim_payment_recorded";
      } & AmountCommand)
    | ({ type: "refund_recorded" } & RefundCommand)
    | ({ type: "commission_paid" } & CommissionPaymentCommand)
  );
export type RuntimeSeed = {
  tenants?: string[];
  customers?: Customer[];
  properties?: Property[];
  commands?: RuntimeCommand[];
};
type StoredCommandResult = { kind: "void" } | { kind: "value"; value: unknown };
export type RuntimeCommandReceiptCheckpoint = {
  tenantId: string;
  commandId: string;
  fingerprint: string;
  result: StoredCommandResult;
};
export type InsuranceRuntimeCheckpoint = {
  version: 1;
  currentTime: string;
  idPrefix: string;
  sequence: number;
  generatedIds: string[];
  tenants: string[];
  customers: Customer[];
  properties: Property[];
  commandReceipts: RuntimeCommandReceiptCheckpoint[];
  messages: EventEnvelope[];
  bus: ServiceBusCheckpoint;
  policy: PolicyServiceCheckpoint;
  policyState: PolicyStateCheckpoint;
  finance: FinanceServiceCheckpoint;
};
export type RuntimeOptions = {
  now?: string;
  idPrefix?: string;
  busFactory?: (checkpoint?: ServiceBusCheckpoint) => ServiceBus;
  checkpoint?: InsuranceRuntimeCheckpoint;
};
export type PolicyLedger = FinanceLedger & {
  policy: Policy;
  quote: Quote;
  policyStateTimeline: PolicyStateProjection[];
  messages: EventEnvelope[];
  deliveries: DeliveryRecord[];
};
export type RuntimeSnapshot = {
  customers: Customer[];
  properties: Property[];
  policy: { quotes: Quote[]; policies: Policy[] };
  policyState: { timelines: Record<string, PolicyStateProjection[]> };
  finance: { ledgers: FinanceLedger[] };
  messages: EventEnvelope[];
  deliveries: DeliveryRecord[];
  pendingMessages: EventEnvelope[];
};
export class RuntimeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly recoverable = false,
  ) {
    super(message);
  }
}
export type InsuranceRuntime = ReturnType<typeof createInsuranceRuntime>;
type QuoteCreatedEnvelope = EventEnvelope<
  Extract<EventEnvelope["event"], { type: "policy.quote.created" }>
>;
type LifecycleChangedEnvelope = EventEnvelope<
  Extract<EventEnvelope["event"], { type: "policy.lifecycle.changed" }>
>;
const clone = <T>(value: T): T => structuredClone(value);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const required = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim())
    throw new RuntimeError("invalid_request", `${label} is required.`);
};
const validTime = (value: string) => {
  try {
    return assertUtcTimestamp(value);
  } catch {
    throw new RuntimeError("invalid_request", "A valid ISO-UTC timestamp is required.");
  }
};
const recordKey = (tenantId: string, commandId: string) => JSON.stringify([tenantId, commandId]);
const parseRecordKey = (value: string, label: string): [string, string] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RuntimeError("invalid_checkpoint", `Invalid ${label} checkpoint key.`);
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "string" ||
    typeof parsed[1] !== "string"
  )
    throw new RuntimeError("invalid_checkpoint", `Invalid ${label} checkpoint identity.`);
  return [parsed[0], parsed[1]];
};
const sameStrings = (left: string[], right: string[]) =>
  [...left].sort().join("\u0000") === [...right].sort().join("\u0000");

const invalidCheckpoint = (message: string): never => {
  throw new RuntimeError("invalid_checkpoint", message);
};
const validatePlan = (value: unknown) => {
  if (!isCommissionPlan(value)) {
    invalidCheckpoint("Invalid checkpoint commission plan.");
  }
};
const validateQuote = (value: Quote, label: string) => {
  required(value?.id, `${label} quote ID`);
  required(value?.customerId, `${label} customer ID`);
  required(value?.propertyId, `${label} property ID`);
  if (value.product !== "risk_secure" && value.product !== "risk_secure_plus")
    invalidCheckpoint(`Invalid ${label} quote product.`);
  if (!Number.isSafeInteger(value.premiumCents) || value.premiumCents <= 0)
    invalidCheckpoint(`Invalid ${label} quote premium.`);
  validatePlan(value.commissionPlan);
  validTime(value.createdAt);
  if (value.status !== "quoted" && value.status !== "bound")
    invalidCheckpoint(`Invalid ${label} quote status.`);
};
const validatePolicy = (value: Policy, label: string) => {
  required(value?.id, `${label} policy ID`);
  required(value?.quoteId, `${label} quote ID`);
  required(value?.customerId, `${label} customer ID`);
  required(value?.propertyId, `${label} property ID`);
  if (value.product !== "risk_secure" && value.product !== "risk_secure_plus")
    invalidCheckpoint(`Invalid ${label} policy product.`);
  if (!Number.isSafeInteger(value.premiumCents) || value.premiumCents <= 0)
    invalidCheckpoint(`Invalid ${label} policy premium.`);
  validatePlan(value.commissionPlan);
  validTime(value.boundAt);
  if (value.status !== "bound" && value.status !== "cancelled")
    invalidCheckpoint(`Invalid ${label} policy status.`);
};
const validatePolicyState = (value: PolicyStateProjection, label: string) => {
  required(value?.policyId, `${label} policy ID`);
  required(value?.sourcePolicyMessageId, `${label} source policy message ID`);
  if (value.lifecycle !== "bound" && value.lifecycle !== "cancelled")
    invalidCheckpoint(`Invalid ${label} lifecycle.`);
  if (!Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision > 2)
    invalidCheckpoint(`Invalid ${label} revision.`);
  if (value.product !== "risk_secure" && value.product !== "risk_secure_plus")
    invalidCheckpoint(`Invalid ${label} product.`);
  if (!Number.isSafeInteger(value.premiumCents) || value.premiumCents <= 0)
    invalidCheckpoint(`Invalid ${label} premium.`);
  validatePlan(value.commissionPlan);
};
const withoutStatus = <T extends { status: unknown }>(value: T) => {
  const { status: _status, ...facts } = value;
  return facts;
};
const exact = (left: unknown, right: unknown) => canonical(left) === canonical(right);
const checkpointString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) invalidCheckpoint(`Invalid ${label}.`);
  return value as string;
};
const checkpointAmount = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0)
    invalidCheckpoint(`Invalid ${label}.`);
  return value as number;
};
const validateRuntimeCommand = (value: unknown): RuntimeCommand => {
  if (!value || typeof value !== "object") invalidCheckpoint("Invalid runtime command receipt.");
  const command = value as RuntimeCommand;
  checkpointString(command.type, "runtime command type");
  checkpointString(command.tenantId, "runtime command tenant ID");
  checkpointString(command.commandId, "runtime command ID");
  checkpointString(command.correlationId, "runtime command correlation ID");
  if (command.schemaVersion !== 1) invalidCheckpoint("Invalid runtime command schema version.");
  if (command.occurredAt !== undefined) validTime(command.occurredAt);
  switch (command.type) {
    case "create_customer":
      checkpointString(command.name, "runtime customer name");
      checkpointString(command.email, "runtime customer email");
      if (command.customerId !== undefined)
        checkpointString(command.customerId, "runtime customer ID");
      break;
    case "create_property":
      checkpointString(command.customerId, "runtime property customer ID");
      checkpointString(command.addressLine1, "runtime property address");
      checkpointString(command.city, "runtime property city");
      checkpointString(command.state, "runtime property state");
      checkpointString(command.postalCode, "runtime property postal code");
      if (command.propertyId !== undefined)
        checkpointString(command.propertyId, "runtime property ID");
      break;
    case "create_quote":
      checkpointString(command.customerId, "runtime quote customer ID");
      checkpointString(command.propertyId, "runtime quote property ID");
      if (command.product !== "risk_secure" && command.product !== "risk_secure_plus")
        invalidCheckpoint("Invalid runtime quote product.");
      checkpointAmount(command.premiumCents, "runtime quote premium");
      validatePlan(command.commissionPlan);
      if (command.quoteId !== undefined) checkpointString(command.quoteId, "runtime quote ID");
      break;
    case "bind_quote":
      checkpointString(command.quoteId, "runtime bind quote ID");
      if (command.policyId !== undefined) checkpointString(command.policyId, "runtime policy ID");
      break;
    case "transition_policy":
      checkpointString(command.policyId, "runtime transition policy ID");
      if (command.lifecycle !== "cancelled")
        invalidCheckpoint("Invalid runtime policy transition.");
      break;
    case "deposit_recorded":
    case "premium_payment_settled":
    case "claim_payment_recorded":
      checkpointString(command.policyId, "runtime finance policy ID");
      checkpointAmount(command.amountCents, "runtime finance amount");
      break;
    case "refund_recorded":
      checkpointString(command.policyId, "runtime refund policy ID");
      if (
        !Array.isArray(command.allocations) ||
        command.allocations.length === 0 ||
        command.allocations.some(
          (allocation) =>
            !allocation ||
            typeof allocation.allocationId !== "string" ||
            !allocation.allocationId.trim() ||
            typeof allocation.financeEntryId !== "string" ||
            !allocation.financeEntryId.trim() ||
            !Number.isSafeInteger(allocation.amountCents) ||
            allocation.amountCents <= 0,
        )
      )
        invalidCheckpoint("Invalid runtime refund allocations.");
      break;
    case "commission_paid":
      checkpointString(command.policyId, "runtime commission policy ID");
      checkpointString(command.commissionEntryId, "runtime commission entry ID");
      break;
    default:
      invalidCheckpoint("Invalid runtime command type.");
  }
  return command;
};

function validateCheckpoint(
  input: InsuranceRuntimeCheckpoint,
  seed: RuntimeSeed,
  options: Pick<RuntimeOptions, "now" | "idPrefix">,
): InsuranceRuntimeCheckpoint {
  const checkpoint = clone(input);
  if (!checkpoint || typeof checkpoint !== "object" || checkpoint.version !== 1)
    throw new RuntimeError("invalid_checkpoint", "Invalid runtime checkpoint version.");
  if (
    !Array.isArray(checkpoint.tenants) ||
    !Array.isArray(checkpoint.customers) ||
    !Array.isArray(checkpoint.properties) ||
    !Array.isArray(checkpoint.generatedIds) ||
    !Array.isArray(checkpoint.commandReceipts) ||
    !Array.isArray(checkpoint.messages) ||
    checkpoint.bus?.version !== 1 ||
    checkpoint.policy?.version !== 1 ||
    checkpoint.policyState?.version !== 1 ||
    checkpoint.finance?.version !== 1
  )
    throw new RuntimeError("invalid_checkpoint", "Invalid runtime checkpoint collections.");
  if (!Number.isSafeInteger(checkpoint.sequence) || checkpoint.sequence < 0)
    throw new RuntimeError("invalid_checkpoint", "Invalid runtime checkpoint sequence.");
  validTime(checkpoint.currentTime);
  required(checkpoint.idPrefix, "Checkpoint ID prefix");
  const tenants = new Set<string>();
  for (const tenantId of checkpoint.tenants) {
    required(tenantId, "Checkpoint tenant ID");
    if (tenants.has(tenantId))
      throw new RuntimeError("invalid_checkpoint", "Duplicate checkpoint tenant.");
    tenants.add(tenantId);
  }
  if (tenants.size === 0)
    throw new RuntimeError("invalid_checkpoint", "Checkpoint must contain a tenant.");
  if (
    (seed.customers?.length ?? 0) ||
    (seed.properties?.length ?? 0) ||
    (seed.commands?.length ?? 0)
  )
    throw new RuntimeError(
      "invalid_checkpoint",
      "Checkpoint restore cannot merge seeded customers, properties, or commands.",
    );
  if (seed.tenants && !sameStrings(seed.tenants, checkpoint.tenants))
    throw new RuntimeError("invalid_checkpoint", "Checkpoint tenants conflict with seed tenants.");
  if (options.now && validTime(options.now) !== checkpoint.currentTime)
    throw new RuntimeError("invalid_checkpoint", "Checkpoint time conflicts with runtime options.");
  if (options.idPrefix && options.idPrefix !== checkpoint.idPrefix)
    throw new RuntimeError(
      "invalid_checkpoint",
      "Checkpoint ID prefix conflicts with runtime options.",
    );

  const customerKeys = new Set<string>();
  for (const customer of checkpoint.customers) {
    required(customer?.tenantId, "Checkpoint customer tenant ID");
    required(customer?.id, "Checkpoint customer ID");
    required(customer?.name, "Checkpoint customer name");
    required(customer?.email, "Checkpoint customer email");
    if (!tenants.has(customer.tenantId))
      throw new RuntimeError("invalid_checkpoint", "Checkpoint customer has an unknown tenant.");
    const key = recordKey(customer.tenantId, customer.id);
    if (customerKeys.has(key))
      throw new RuntimeError("invalid_checkpoint", "Duplicate checkpoint customer identity.");
    customerKeys.add(key);
  }
  const propertyKeys = new Set<string>();
  for (const property of checkpoint.properties) {
    required(property?.tenantId, "Checkpoint property tenant ID");
    required(property?.id, "Checkpoint property ID");
    required(property?.customerId, "Checkpoint property customer ID");
    required(property?.addressLine1, "Checkpoint property address");
    required(property?.city, "Checkpoint property city");
    required(property?.state, "Checkpoint property state");
    required(property?.postalCode, "Checkpoint property postal code");
    if (!tenants.has(property.tenantId))
      throw new RuntimeError("invalid_checkpoint", "Checkpoint property has an unknown tenant.");
    if (!customerKeys.has(recordKey(property.tenantId, property.customerId)))
      throw new RuntimeError(
        "invalid_checkpoint",
        "Checkpoint property references a customer outside its tenant.",
      );
    const key = recordKey(property.tenantId, property.id);
    if (propertyKeys.has(key))
      throw new RuntimeError("invalid_checkpoint", "Duplicate checkpoint property identity.");
    propertyKeys.add(key);
  }
  const receiptKeys = new Set<string>();
  const receiptCommands = new Map<string, RuntimeCommand>();
  for (const receipt of checkpoint.commandReceipts) {
    required(receipt?.tenantId, "Checkpoint command tenant ID");
    required(receipt?.commandId, "Checkpoint command ID");
    required(receipt?.fingerprint, "Checkpoint command fingerprint");
    if (!tenants.has(receipt.tenantId))
      throw new RuntimeError("invalid_checkpoint", "Checkpoint receipt has an unknown tenant.");
    if (
      !receipt.result ||
      (receipt.result.kind !== "void" && receipt.result.kind !== "value") ||
      (receipt.result.kind === "value" && !("value" in receipt.result))
    )
      throw new RuntimeError("invalid_checkpoint", "Checkpoint command result is invalid.");
    const key = recordKey(receipt.tenantId, receipt.commandId);
    if (receiptKeys.has(key))
      throw new RuntimeError("invalid_checkpoint", "Duplicate checkpoint command receipt.");
    let command: unknown;
    try {
      command = JSON.parse(receipt.fingerprint);
    } catch {
      invalidCheckpoint("Invalid checkpoint command receipt fingerprint.");
    }
    if (!command || typeof command !== "object" || canonical(command) !== receipt.fingerprint)
      invalidCheckpoint("Checkpoint command receipt fingerprint identity is inconsistent.");
    const runtimeCommand = validateRuntimeCommand(command);
    if (
      runtimeCommand.tenantId !== receipt.tenantId ||
      runtimeCommand.commandId !== receipt.commandId
    )
      invalidCheckpoint("Checkpoint command receipt fingerprint identity is inconsistent.");
    receiptKeys.add(key);
    receiptCommands.set(key, runtimeCommand);
  }
  const messageIds = new Set<string>();
  const messagesById = new Map<string, EventEnvelope>();
  for (const message of checkpoint.messages) {
    required(message?.messageId, "Checkpoint message ID");
    required(message?.tenantId, "Checkpoint message tenant ID");
    required(message?.correlationId, "Checkpoint message correlation ID");
    if (!tenants.has(message.tenantId))
      throw new RuntimeError("invalid_checkpoint", "Checkpoint message has an unknown tenant.");
    if (message.schemaVersion !== 1)
      invalidCheckpoint("Checkpoint message has an unsupported schema version.");
    validTime(message.occurredAt);
    if (messageIds.has(message.messageId))
      throw new RuntimeError("invalid_checkpoint", "Duplicate checkpoint message identity.");
    messageIds.add(message.messageId);
    const event = message.event as EventEnvelope["event"];
    switch (event.type) {
      case "policy.quote.created":
        validateQuote(event.quote, "message");
        if (event.quote.status !== "quoted")
          invalidCheckpoint("Quote-created checkpoint message must contain a quoted fact.");
        break;
      case "policy.lifecycle.changed":
        validatePolicy(event.policy, "message");
        if (
          (event.lifecycle !== "bound" && event.lifecycle !== "cancelled") ||
          event.policy.status !== event.lifecycle ||
          event.revision !== (event.lifecycle === "bound" ? 1 : 2)
        )
          invalidCheckpoint("Invalid lifecycle checkpoint message.");
        break;
      case "policy.state.changed":
        validatePolicyState(event.state, "message Policy State");
        break;
      case "finance.deposit.recorded":
      case "finance.premium.payment.settled":
      case "finance.claim.payment.recorded":
        required(event.commandId, "Checkpoint finance command ID");
        required(event.policyId, "Checkpoint finance policy ID");
        if (!Number.isSafeInteger(event.amountCents) || event.amountCents <= 0)
          invalidCheckpoint("Invalid checkpoint finance amount.");
        break;
      case "finance.refund.recorded":
        required(event.commandId, "Checkpoint refund command ID");
        required(event.policyId, "Checkpoint refund policy ID");
        if (
          !Array.isArray(event.allocations) ||
          event.allocations.length === 0 ||
          event.allocations.some(
            (allocation) =>
              !allocation ||
              typeof allocation.allocationId !== "string" ||
              !allocation.allocationId.trim() ||
              typeof allocation.financeEntryId !== "string" ||
              !allocation.financeEntryId.trim() ||
              !Number.isSafeInteger(allocation.amountCents) ||
              allocation.amountCents <= 0,
          )
        )
          invalidCheckpoint("Invalid checkpoint refund allocations.");
        break;
      case "finance.commission.paid":
        required(event.commandId, "Checkpoint commission command ID");
        required(event.policyId, "Checkpoint commission policy ID");
        required(event.commissionEntryId, "Checkpoint commission entry ID");
        break;
      default:
        invalidCheckpoint("Invalid checkpoint message event type.");
    }
    messagesById.set(message.messageId, message);
  }
  for (const message of checkpoint.bus.queue) {
    const published = messagesById.get(message.messageId);
    if (!published || !exact(message, published))
      throw new RuntimeError(
        "invalid_checkpoint",
        "Checkpoint queue does not match published message history.",
      );
  }
  for (const receipt of checkpoint.bus.completedReceipts) {
    if (!messageIds.has(receipt.messageId))
      throw new RuntimeError(
        "invalid_checkpoint",
        "Checkpoint bus receipt references an unknown published message.",
      );
  }
  for (const delivery of checkpoint.bus.deliveries) {
    const published = messagesById.get(delivery.messageId);
    if (!published)
      throw new RuntimeError(
        "invalid_checkpoint",
        "Checkpoint delivery references an unknown published message.",
      );
    if (published.event.type !== delivery.eventType)
      throw new RuntimeError(
        "invalid_checkpoint",
        "Checkpoint queue references an unknown message.",
      );
  }
  const policyQuotes = new Map<string, Quote>();
  const policyQuoteRows = new Map<string, (typeof checkpoint.policy.quotes)[number]["value"]>();
  for (const row of checkpoint.policy.quotes) {
    const [tenantId, quoteId] = parseRecordKey(row.key, "Policy quote");
    if (!tenants.has(tenantId))
      throw new RuntimeError(
        "invalid_checkpoint",
        "Policy quote checkpoint has an unknown tenant.",
      );
    validateQuote(row.value.quote as Quote, "Policy checkpoint");
    if (row.value.quote.id !== quoteId)
      invalidCheckpoint("Policy quote checkpoint key is inconsistent.");
    policyQuotes.set(row.key, row.value.quote as Quote);
    policyQuoteRows.set(row.key, row.value);
  }
  const policyRecords = new Map<string, Policy>();
  const policyRows = new Map<string, (typeof checkpoint.policy.policies)[number]["value"]>();
  for (const row of checkpoint.policy.policies) {
    const [tenantId, policyId] = parseRecordKey(row.key, "Policy");
    if (!tenants.has(tenantId))
      throw new RuntimeError("invalid_checkpoint", "Policy checkpoint has an unknown tenant.");
    validatePolicy(row.value.policy as Policy, "Policy checkpoint");
    if (
      row.value.policy.id !== policyId ||
      row.value.policy.status !== row.value.lifecycle ||
      !policyQuotes.has(recordKey(tenantId, row.value.policy.quoteId))
    )
      invalidCheckpoint("Policy checkpoint identity is inconsistent.");
    policyRecords.set(row.key, row.value.policy as Policy);
    policyRows.set(row.key, row.value);
  }
  const stateTimelines = new Map<string, PolicyStateProjection[]>();
  for (const row of checkpoint.policyState.timelines) {
    if (!tenants.has(row.tenantId))
      throw new RuntimeError(
        "invalid_checkpoint",
        "Policy State checkpoint has an unknown tenant.",
      );
    for (const state of row.states) validatePolicyState(state, "checkpoint Policy State");
    stateTimelines.set(recordKey(row.tenantId, row.policyId), row.states);
  }
  for (const row of checkpoint.finance.ledgers) {
    const [tenantId] = parseRecordKey(row.key, "Finance ledger");
    if (!tenants.has(tenantId))
      throw new RuntimeError("invalid_checkpoint", "Finance checkpoint has an unknown tenant.");
  }

  const policyReceipts = new Map(
    checkpoint.policy.commandReceipts.map((row) => [row.key, row.value] as const),
  );
  for (const row of checkpoint.policy.commandReceipts) {
    const [tenantId] = parseRecordKey(row.key, "Policy command receipt");
    if (!tenants.has(tenantId)) invalidCheckpoint("Policy command receipt has an unknown tenant.");
  }
  const financeReceipts = new Map(
    checkpoint.finance.commandReceipts.map((row) => [row.key, row.value]),
  );
  for (const row of checkpoint.finance.commandReceipts) {
    const [tenantId] = parseRecordKey(row.key, "Finance command receipt");
    if (!tenants.has(tenantId)) invalidCheckpoint("Finance command receipt has an unknown tenant.");
  }

  for (const [key, row] of policyQuoteRows) {
    const [tenantId, quoteId] = parseRecordKey(key, "Policy quote history");
    const created = checkpoint.messages.filter(
      (message): message is QuoteCreatedEnvelope =>
        message.tenantId === tenantId &&
        message.event.type === "policy.quote.created" &&
        message.event.quote.id === quoteId,
    );
    if (
      created.length !== 1 ||
      created[0].messageId !== row.createdMessageId ||
      created[0].correlationId !== row.correlationId ||
      !exact(withoutStatus(created[0].event.quote), withoutStatus(row.quote))
    )
      invalidCheckpoint("Policy quote record and published history are inconsistent.");
  }
  for (const [key, row] of policyRows) {
    const [tenantId, policyId] = parseRecordKey(key, "Policy lifecycle history");
    const lifecycle = checkpoint.messages
      .filter(
        (message): message is LifecycleChangedEnvelope =>
          message.tenantId === tenantId &&
          message.event.type === "policy.lifecycle.changed" &&
          message.event.policy.id === policyId,
      )
      .sort((left, right) => left.event.revision - right.event.revision);
    const quote =
      policyQuoteRows.get(recordKey(tenantId, row.policy.quoteId)) ??
      invalidCheckpoint("Policy lifecycle record references a missing quote.");
    if (lifecycle.length !== row.revision)
      invalidCheckpoint("Policy lifecycle record and published history are inconsistent.");
    for (let index = 0; index < lifecycle.length; index += 1) {
      const message = lifecycle[index];
      const previousMessageId =
        index === 0 ? quote.createdMessageId : lifecycle[index - 1].messageId;
      if (
        message.event.revision !== index + 1 ||
        message.event.lifecycle !== (index === 0 ? "bound" : "cancelled") ||
        message.causationId !== previousMessageId
      )
        invalidCheckpoint("Policy lifecycle revision history is inconsistent.");
    }
    const current = lifecycle.at(-1) ?? invalidCheckpoint("Policy lifecycle history is empty.");
    if (
      current.messageId !== row.lifecycleMessageId ||
      current.correlationId !== row.correlationId ||
      !exact(current.event.policy, row.policy)
    )
      invalidCheckpoint("Policy lifecycle record does not match its current published fact.");
  }
  for (const [key, states] of stateTimelines) {
    const [tenantId, policyId] = parseRecordKey(key, "Policy State history");
    const policy = policyRows.get(key);
    if (!policy || states.length !== policy.revision)
      invalidCheckpoint("Policy State timeline does not match its Policy record.");
    for (const state of states) {
      const source = messagesById.get(state.sourcePolicyMessageId);
      const projected = checkpoint.messages.filter(
        (message) =>
          message.tenantId === tenantId &&
          message.event.type === "policy.state.changed" &&
          message.event.state.policyId === policyId &&
          message.event.state.revision === state.revision,
      );
      if (
        !source ||
        source.tenantId !== tenantId ||
        source.event.type !== "policy.lifecycle.changed" ||
        source.event.policy.id !== policyId ||
        source.event.revision !== state.revision ||
        projected.length !== 1 ||
        projected[0].messageId !== `policy-state:${source.messageId}` ||
        projected[0].causationId !== source.messageId ||
        projected[0].correlationId !== source.correlationId ||
        !exact(projected[0].event, { type: "policy.state.changed", state })
      )
        invalidCheckpoint("Policy State timeline and published history are inconsistent.");
    }
  }

  for (const message of checkpoint.messages) {
    const event = message.event;
    if (event.type === "policy.quote.created") {
      const restoredQuote = policyQuotes.get(recordKey(message.tenantId, event.quote.id));
      if (!restoredQuote || !exact(withoutStatus(restoredQuote), withoutStatus(event.quote)))
        invalidCheckpoint("Quote message history contradicts Policy checkpoint facts.");
    } else if (event.type === "policy.lifecycle.changed") {
      const restoredPolicy = policyRecords.get(recordKey(message.tenantId, event.policy.id));
      if (!restoredPolicy || !exact(withoutStatus(restoredPolicy), withoutStatus(event.policy)))
        invalidCheckpoint("Lifecycle message history contradicts Policy checkpoint facts.");
    } else if (event.type === "policy.state.changed") {
      const timeline = stateTimelines.get(recordKey(message.tenantId, event.state.policyId));
      if (!timeline?.some((state) => exact(state, event.state)))
        invalidCheckpoint("Policy State message history contradicts its checkpoint timeline.");
    } else if (event.type.startsWith("finance.")) {
      const receipt = financeReceipts.get(recordKey(message.tenantId, event.commandId));
      if (!receipt || !exact(receipt.envelope, message))
        invalidCheckpoint("Finance message history contradicts its command receipt.");
    }
  }

  for (const [key, command] of receiptCommands) {
    const receipt =
      checkpoint.commandReceipts.find(
        (candidate) => recordKey(candidate.tenantId, candidate.commandId) === key,
      ) ?? invalidCheckpoint("Runtime command receipt is missing.");
    const value = receipt.result.kind === "value" ? receipt.result.value : undefined;
    switch (command.type) {
      case "create_customer": {
        const result = value as Customer | undefined;
        const restoredCustomer = result
          ? checkpoint.customers.find(
              (customer) => customer.tenantId === command.tenantId && customer.id === result.id,
            )
          : undefined;
        if (
          !result ||
          !restoredCustomer ||
          !exact(result, restoredCustomer) ||
          result.name !== command.name ||
          result.email !== command.email ||
          (command.customerId !== undefined && result.id !== command.customerId)
        )
          invalidCheckpoint("Runtime customer command receipt result is inconsistent.");
        break;
      }
      case "create_property": {
        const result = value as Property | undefined;
        const restoredProperty = result
          ? checkpoint.properties.find(
              (property) => property.tenantId === command.tenantId && property.id === result.id,
            )
          : undefined;
        if (
          !result ||
          !restoredProperty ||
          !exact(result, restoredProperty) ||
          result.customerId !== command.customerId ||
          result.addressLine1 !== command.addressLine1 ||
          result.city !== command.city ||
          result.state !== command.state ||
          result.postalCode !== command.postalCode ||
          (command.propertyId !== undefined && result.id !== command.propertyId)
        )
          invalidCheckpoint("Runtime property command receipt result is inconsistent.");
        break;
      }
      case "create_quote": {
        const result = value as Quote | undefined;
        const restoredQuote = result && policyQuotes.get(recordKey(command.tenantId, result.id));
        const policyReceipt = policyReceipts.get(key);
        let policyCommand: unknown;
        try {
          policyCommand = policyReceipt ? JSON.parse(policyReceipt.fingerprint) : undefined;
        } catch {
          invalidCheckpoint("Runtime quote command is inconsistent with its Policy receipt.");
        }
        if (
          !result ||
          !restoredQuote ||
          !policyReceipt ||
          !exact(policyCommand, command) ||
          !exact(policyReceipt.result, result) ||
          !exact(withoutStatus(result), withoutStatus(restoredQuote)) ||
          result.customerId !== command.customerId ||
          result.propertyId !== command.propertyId ||
          result.product !== command.product ||
          result.premiumCents !== command.premiumCents ||
          !exact(result.commissionPlan, command.commissionPlan) ||
          (command.quoteId !== undefined && result.id !== command.quoteId)
        )
          invalidCheckpoint("Runtime quote command receipt result is inconsistent.");
        break;
      }
      case "bind_quote": {
        const result = value as Policy | undefined;
        const restoredPolicy = result && policyRecords.get(recordKey(command.tenantId, result.id));
        const policyReceipt = policyReceipts.get(key);
        let policyCommand: unknown;
        try {
          policyCommand = policyReceipt ? JSON.parse(policyReceipt.fingerprint) : undefined;
        } catch {
          invalidCheckpoint("Runtime bind command is inconsistent with its Policy receipt.");
        }
        if (
          !result ||
          !restoredPolicy ||
          !policyReceipt ||
          !exact(policyCommand, command) ||
          !exact(policyReceipt.result, result) ||
          !exact(withoutStatus(result), withoutStatus(restoredPolicy)) ||
          result.quoteId !== command.quoteId ||
          (command.policyId !== undefined && result.id !== command.policyId)
        )
          invalidCheckpoint("Runtime bind command receipt result is inconsistent.");
        break;
      }
      case "transition_policy": {
        const policyReceipt = policyReceipts.get(key);
        let policyCommand: unknown;
        try {
          policyCommand = policyReceipt ? JSON.parse(policyReceipt.fingerprint) : undefined;
        } catch {
          invalidCheckpoint("Runtime transition command is inconsistent with its Policy receipt.");
        }
        const restoredPolicy = policyRecords.get(recordKey(command.tenantId, command.policyId));
        const policyRow = policyRows.get(recordKey(command.tenantId, command.policyId));
        if (
          receipt.result.kind !== "void" ||
          !policyReceipt ||
          !exact(policyCommand, command) ||
          policyReceipt.result !== undefined ||
          restoredPolicy?.status !== "cancelled" ||
          policyRow?.lifecycle !== "cancelled" ||
          policyRow.revision !== 2
        )
          invalidCheckpoint("Runtime transition receipt must contain a void result.");
        break;
      }
      default: {
        const financeReceipt = financeReceipts.get(recordKey(command.tenantId, command.commandId));
        const envelope = financeReceipt?.envelope;
        const event = envelope?.event;
        const expectedEventType = {
          deposit_recorded: "finance.deposit.recorded",
          premium_payment_settled: "finance.premium.payment.settled",
          claim_payment_recorded: "finance.claim.payment.recorded",
          refund_recorded: "finance.refund.recorded",
          commission_paid: "finance.commission.paid",
        }[command.type];
        if (
          !financeReceipt ||
          !envelope ||
          !event ||
          receipt.result.kind !== "value" ||
          !exact(value, envelope) ||
          envelope.tenantId !== command.tenantId ||
          envelope.correlationId !== command.correlationId ||
          event.type !== expectedEventType ||
          event.commandId !== command.commandId ||
          event.policyId !== command.policyId ||
          ((command.type === "deposit_recorded" ||
            command.type === "premium_payment_settled" ||
            command.type === "claim_payment_recorded") &&
            (!("amountCents" in event) || event.amountCents !== command.amountCents)) ||
          (command.type === "refund_recorded" &&
            (!("allocations" in event) || !exact(event.allocations, command.allocations))) ||
          (command.type === "commission_paid" &&
            (!("commissionEntryId" in event) ||
              event.commissionEntryId !== command.commissionEntryId))
        )
          invalidCheckpoint("Runtime finance command receipt result is inconsistent.");
      }
    }
  }
  const runtimePolicyReceiptKeys = new Set(
    [...receiptCommands]
      .filter(([, command]) =>
        ["create_quote", "bind_quote", "transition_policy"].includes(command.type),
      )
      .map(([key]) => key),
  );
  if (
    runtimePolicyReceiptKeys.size !== policyReceipts.size ||
    [...policyReceipts.keys()].some((key) => !runtimePolicyReceiptKeys.has(key))
  )
    invalidCheckpoint("Runtime and Policy command receipts are inconsistent.");
  const runtimeFinanceReceiptKeys = new Set(
    [...receiptCommands]
      .filter(([, command]) =>
        [
          "deposit_recorded",
          "premium_payment_settled",
          "claim_payment_recorded",
          "refund_recorded",
          "commission_paid",
        ].includes(command.type),
      )
      .map(([key]) => key),
  );
  if (
    runtimeFinanceReceiptKeys.size !== financeReceipts.size ||
    [...financeReceipts.keys()].some((key) => !runtimeFinanceReceiptKeys.has(key))
  )
    invalidCheckpoint("Runtime and Finance command receipts are inconsistent.");

  const escapedPrefix = checkpoint.idPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const generatedId = new RegExp(`^${escapedPrefix}-[a-z][a-z0-9-]*-(\\d+)$`);
  const suffixes = checkpoint.generatedIds.map((id) => {
    const match = typeof id === "string" ? id.match(generatedId) : null;
    return Number(
      match?.[1] ?? invalidCheckpoint("Runtime checkpoint contains an invalid generated identity."),
    );
  });
  const sortedSuffixes = [...suffixes].sort((a, b) => a - b);
  if (
    checkpoint.generatedIds.length !== checkpoint.sequence ||
    new Set(checkpoint.generatedIds).size !== checkpoint.generatedIds.length ||
    sortedSuffixes.some((suffix, index) => suffix !== index + 1)
  )
    invalidCheckpoint("Runtime checkpoint sequence does not match generated identities.");
  return checkpoint;
}

export function createInsuranceRuntime(seed: RuntimeSeed = {}, options: RuntimeOptions = {}) {
  const restored = options.checkpoint
    ? validateCheckpoint(options.checkpoint, seed, options)
    : undefined;
  const tenantValues = restored?.tenants ?? seed.tenants ?? ["test-tenant"];
  const tenants = new Set(tenantValues);
  const requireTenant = (tenantId: string) => {
    required(tenantId, "Tenant ID");
    if (!tenants.has(tenantId)) throw new RuntimeError("unknown_tenant", "Unknown tenant.", 403);
  };
  let sequence = restored?.sequence ?? 0;
  const generatedIds = clone(restored?.generatedIds ?? []);
  const idPrefix = restored?.idPrefix ?? options.idPrefix ?? "test";
  const ids = {
    next: (kind: string) => {
      const id = `${idPrefix}-${kind}-${++sequence}`;
      generatedIds.push(id);
      return id;
    },
  };
  const currentTime = restored?.currentTime ?? validTime(options.now ?? "2026-01-01T00:00:00.000Z");
  let commandTime = currentTime;
  const customers = clone(restored?.customers ?? seed.customers ?? []);
  const properties = clone(restored?.properties ?? seed.properties ?? []);
  for (const row of [...customers, ...properties]) requireTenant(row.tenantId);
  const messages: EventEnvelope[] = clone(restored?.messages ?? []);
  const transport = (options.busFactory ?? createInMemoryServiceBus)(restored?.bus);
  const bus: ServiceBus = {
    ...transport,
    publish(message) {
      transport.publish(message);
      messages.push(clone(message));
    },
  };
  const referenceData: PolicyReferenceData = {
    ownsProperty: ({ tenantId, customerId, propertyId }) =>
      customers.some((customer) => customer.tenantId === tenantId && customer.id === customerId) &&
      properties.some(
        (property) =>
          property.tenantId === tenantId &&
          property.id === propertyId &&
          property.customerId === customerId,
      ),
  };
  let policyPersistence: PolicyServicePersistencePort | undefined;
  let policyStatePersistence: PolicyStatePersistencePort | undefined;
  let financePersistence: FinancePersistencePort | undefined;
  const policy = createPolicyService({
    bus,
    clock: () => commandTime,
    ids,
    referenceData,
    registerPersistence: (port) => {
      policyPersistence = port;
    },
  });
  const policyState = createPolicyStateService({
    bus,
    registerPersistence: (port) => {
      policyStatePersistence = port;
    },
  });
  const finance = createFinanceService({
    bus,
    now: () => commandTime,
    registerPersistence: (port) => {
      financePersistence = port;
    },
  });
  if (!policyPersistence || !policyStatePersistence || !financePersistence)
    throw new RuntimeError("invalid_runtime", "Runtime persistence ports were not registered.");
  const registeredPolicyPersistence = policyPersistence;
  const registeredPolicyStatePersistence = policyStatePersistence;
  const registeredFinancePersistence = financePersistence;

  // Restore order is deliberate: the bus already owns pending delivery and receipts;
  // ordinary service construction installs subscribers; stores hydrate before runtime replay.
  if (restored) {
    registeredPolicyPersistence.hydrate(restored.policy);
    registeredPolicyStatePersistence.hydrate(restored.policyState);
    registeredFinancePersistence.hydrate(restored.finance);
  }
  const receipts = new Map<string, { fingerprint: string; result: StoredCommandResult }>();
  for (const receipt of restored?.commandReceipts ?? []) {
    receipts.set(recordKey(receipt.tenantId, receipt.commandId), {
      fingerprint: receipt.fingerprint,
      result: clone(receipt.result),
    });
  }
  const drain = () => {
    try {
      bus.drain();
    } catch (cause) {
      throw new RuntimeError(
        "delivery_pending",
        `Event delivery is pending: ${cause instanceof Error ? cause.message : String(cause)}`,
        409,
        true,
      );
    }
  };
  const createCustomer = (command: CreateCustomerCommand): Customer => {
    required(command.name, "Customer name");
    required(command.email, "Email");
    const row = {
      tenantId: command.tenantId,
      id: command.customerId ?? ids.next("customer"),
      name: command.name,
      email: command.email,
    };
    if (customers.some((customer) => customer.tenantId === row.tenantId && customer.id === row.id))
      throw new RuntimeError("customer_exists", "Customer already exists.", 409);
    customers.push(clone(row));
    return row;
  };
  const createProperty = (command: CreatePropertyCommand): Property => {
    for (const field of ["customerId", "addressLine1", "city", "state", "postalCode"] as const)
      required(command[field], field);
    if (
      !customers.some(
        (customer) => customer.tenantId === command.tenantId && customer.id === command.customerId,
      )
    )
      throw new RuntimeError("customer_not_found", "Unknown customer.", 404);
    const row = {
      tenantId: command.tenantId,
      id: command.propertyId ?? ids.next("property"),
      customerId: command.customerId,
      addressLine1: command.addressLine1,
      city: command.city,
      state: command.state,
      postalCode: command.postalCode,
    };
    if (properties.some((property) => property.tenantId === row.tenantId && property.id === row.id))
      throw new RuntimeError("property_exists", "Property already exists.", 409);
    properties.push(clone(row));
    return row;
  };
  const execute = (input: RuntimeCommand): unknown => {
    const command = clone(input);
    requireTenant(command.tenantId);
    required(command.commandId, "Command ID");
    required(command.correlationId, "Correlation ID");
    if (command.schemaVersion !== 1)
      throw new RuntimeError("invalid_schema", "Only command schema version 1 is supported.");
    if (command.type === "create_quote" && !referenceData.ownsProperty(command))
      throw new RuntimeError(
        "invalid_quote",
        "Property is not owned by the customer in this tenant.",
      );
    const fingerprint = canonical(command);
    const key = recordKey(command.tenantId, command.commandId);
    const previous = receipts.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new RuntimeError(
          "command_conflict",
          "Command ID was already used with different input.",
          409,
        );
      drain();
      return previous.result.kind === "void" ? undefined : clone(previous.result.value);
    }
    commandTime = validTime(command.occurredAt ?? currentTime);
    try {
      drain();
      let result: unknown;
      switch (command.type) {
        case "create_customer":
          result = createCustomer(command);
          break;
        case "create_property":
          result = createProperty(command);
          break;
        case "create_quote":
          result = policy.createQuote(command);
          break;
        case "bind_quote":
          result = policy.bindQuote(command);
          break;
        case "transition_policy":
          result = policy.transitionPolicy(command);
          break;
        case "deposit_recorded":
          result = finance.recordDeposit(command);
          break;
        case "premium_payment_settled":
          result = finance.settlePremiumPayment(command);
          break;
        case "claim_payment_recorded":
          result = finance.recordClaimPayment(command);
          break;
        case "refund_recorded":
          result = finance.recordRefund(command);
          break;
        case "commission_paid":
          result = finance.payCommission(command);
          break;
        default:
          throw new RuntimeError("invalid_command", "Unsupported runtime command.");
      }
      const stored: StoredCommandResult =
        result === undefined ? { kind: "void" } : { kind: "value", value: clone(result) };
      receipts.set(key, { fingerprint, result: stored });
      drain();
      return result === undefined ? undefined : clone(result);
    } finally {
      commandTime = currentTime;
    }
  };
  const tenantMessages = (tenantId: string) =>
    messages.filter((message) => message.tenantId === tenantId);
  const deliveryRecords = (selected: EventEnvelope[]) => {
    const ids = new Set(selected.map((message) => message.messageId));
    return bus.deliveryLog().filter((delivery) => ids.has(delivery.messageId));
  };
  const quotesFor = (tenantId: string) =>
    tenantMessages(tenantId).flatMap((message) => {
      const quote =
        message.event.type === "policy.quote.created"
          ? policy.getQuote(tenantId, message.event.quote.id)
          : undefined;
      return quote ? [quote] : [];
    });
  const policiesFor = (tenantId: string) => {
    const ids = new Set(
      tenantMessages(tenantId).flatMap((message) =>
        message.event.type === "policy.lifecycle.changed" ? [message.event.policy.id] : [],
      ),
    );
    return [...ids].flatMap((id) => {
      const found = policy.getPolicy(tenantId, id);
      return found ? [found] : [];
    });
  };
  const getLedger = (tenantId: string, policyId: string): PolicyLedger | undefined => {
    requireTenant(tenantId);
    const facts = policy.getPolicy(tenantId, policyId);
    const ledger = finance.getLedger(tenantId, policyId);
    if (!facts || !ledger) return undefined;
    const quote = policy.getQuote(tenantId, facts.quoteId);
    if (!quote) return undefined;
    const selected = tenantMessages(tenantId).filter((message) => {
      const event = message.event;
      if (event.type === "policy.quote.created") return event.quote.id === facts.quoteId;
      if (event.type === "policy.lifecycle.changed") return event.policy.id === policyId;
      if (event.type === "policy.state.changed") return event.state.policyId === policyId;
      return event.policyId === policyId;
    });
    const auditEntries: FinanceAuditEntry[] = selected.map((message) => ({
      sourceEventId: message.messageId,
      correlationId: message.correlationId,
      causationId: message.causationId,
      tenantId: message.tenantId,
      type: message.event.type,
      occurredAt: message.occurredAt,
      ...(message.event.type === "finance.commission.paid"
        ? { commissionEntryId: message.event.commissionEntryId }
        : {}),
    }));
    return clone({
      ...ledger,
      policy: facts,
      quote,
      commissionEntries: finance.getCommissionEntries(tenantId, policyId),
      auditEntries,
      policyStateTimeline: policyState.getPolicyStateTimeline(tenantId, policyId),
      messages: selected,
      deliveries: deliveryRecords(selected),
    });
  };
  const snapshot = (tenantId: string): RuntimeSnapshot => {
    requireTenant(tenantId);
    const policies = policiesFor(tenantId);
    const selected = tenantMessages(tenantId);
    return clone({
      customers: customers.filter((customer) => customer.tenantId === tenantId),
      properties: properties.filter((property) => property.tenantId === tenantId),
      policy: { quotes: quotesFor(tenantId), policies },
      policyState: {
        timelines: Object.fromEntries(
          policies.map((item) => [item.id, policyState.getPolicyStateTimeline(tenantId, item.id)]),
        ),
      },
      finance: {
        ledgers: policies.flatMap((item) => {
          const ledger = finance.getLedger(tenantId, item.id);
          return ledger
            ? [{ ...ledger, commissionEntries: finance.getCommissionEntries(tenantId, item.id) }]
            : [];
        }),
      },
      messages: selected,
      deliveries: deliveryRecords(selected),
      pendingMessages: bus.pendingMessages().filter((message) => message.tenantId === tenantId),
    });
  };
  for (const command of seed.commands ?? []) execute(command);
  return {
    requireTenant,
    execute,
    snapshot,
    getLedger,
    checkpoint(): InsuranceRuntimeCheckpoint {
      return clone({
        version: 1,
        currentTime,
        idPrefix,
        sequence,
        generatedIds,
        tenants: [...tenants].sort(),
        customers,
        properties,
        commandReceipts: [...receipts.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, receipt]) => {
            const [tenantId, commandId] = parseRecordKey(key, "runtime receipt");
            return {
              tenantId,
              commandId,
              fingerprint: receipt.fingerprint,
              result: receipt.result,
            };
          }),
        messages,
        bus: bus.checkpoint(),
        policy: registeredPolicyPersistence.checkpoint(),
        policyState: registeredPolicyStatePersistence.checkpoint(),
        finance: registeredFinancePersistence.checkpoint(),
      });
    },
    getQuote(tenantId: string, id: string) {
      requireTenant(tenantId);
      return clone(policy.getQuote(tenantId, id));
    },
    getPolicy(tenantId: string, id: string) {
      requireTenant(tenantId);
      return clone(policy.getPolicy(tenantId, id));
    },
  };
}
