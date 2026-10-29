import type {
  CommissionEntry,
  DeepReadonly,
  EventEnvelope,
  FinanceEntry,
  PolicyStateProjection,
  RefundAllocation,
  ServiceEvent,
} from "@testbed/domain";
import {
  assertCommissionPlan,
  assertUtcTimestamp,
  createAccrualEntry,
  createPaymentEntry,
  createRefundAdjustmentEntry,
  immutableSnapshot,
  projectCommissionEntries,
  refundCommissionAdjustmentCents,
} from "@testbed/domain";
import type { ServiceBus } from "@testbed/service-bus";

type FinanceEvent = Extract<ServiceEvent, { type: `finance.${string}` }>;
export type FinanceCommand = {
  commandId: string;
  correlationId: string;
  tenantId: string;
  policyId: string;
};
export type AmountCommand = FinanceCommand & { amountCents: number };
export type RefundCommand = FinanceCommand & { allocations: RefundAllocation[] };
export type CommissionPaymentCommand = FinanceCommand & { commissionEntryId: string };
export type LedgerEntry = FinanceEntry & {
  tenantId: string;
  allocationId?: string;
  refundsFinanceEntryId?: string;
};
export type FinanceAuditEntry = {
  sourceEventId: string;
  correlationId: string;
  causationId?: string;
  tenantId: string;
  type: ServiceEvent["type"];
  occurredAt: string;
  commissionEntryId?: string;
};
export type FinanceLedger = {
  policyState: PolicyStateProjection;
  financeEntries: LedgerEntry[];
  commissionEntries: CommissionEntry[];
  auditEntries: FinanceAuditEntry[];
};
export type FinanceService = {
  recordDeposit(
    command: AmountCommand,
  ): EventEnvelope<Extract<FinanceEvent, { type: "finance.deposit.recorded" }>>;
  settlePremiumPayment(
    command: AmountCommand,
  ): EventEnvelope<Extract<FinanceEvent, { type: "finance.premium.payment.settled" }>>;
  recordClaimPayment(
    command: AmountCommand,
  ): EventEnvelope<Extract<FinanceEvent, { type: "finance.claim.payment.recorded" }>>;
  recordRefund(
    command: RefundCommand,
  ): EventEnvelope<Extract<FinanceEvent, { type: "finance.refund.recorded" }>>;
  payCommission(
    command: CommissionPaymentCommand,
  ): EventEnvelope<Extract<FinanceEvent, { type: "finance.commission.paid" }>>;
  getLedger(tenantId: string, policyId: string): FinanceLedger | undefined;
  getCommissionEntries(tenantId: string, policyId: string): CommissionEntry[];
};

type FinanceCommandReceipt = {
  fingerprint: string;
  envelope: EventEnvelope<FinanceEvent>;
  applied: boolean;
};

export type FinanceServiceCheckpoint = {
  version: 1;
  ledgers: { key: string; value: FinanceLedger }[];
  commandReceipts: { key: string; value: FinanceCommandReceipt }[];
};

export type FinancePersistencePort = {
  checkpoint(): FinanceServiceCheckpoint;
  hydrate(checkpoint: FinanceServiceCheckpoint): void;
};

const key = (...parts: string[]) => JSON.stringify(parts);
const commandFingerprint = (event: DeepReadonly<FinanceEvent>, correlationId: string) =>
  JSON.stringify({ event, correlationId });
const assertRequired = (value: string, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
};
const assertCents = (value: number) => {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error("Amount must be positive safe integer cents.");
};
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const snapshot = <T>(value: T): T => freeze(structuredClone(value));
const audit = (message: EventEnvelope): FinanceAuditEntry => ({
  sourceEventId: message.messageId,
  correlationId: message.correlationId,
  causationId: message.causationId,
  tenantId: message.tenantId,
  type: message.event.type,
  occurredAt: message.occurredAt,
});

export function createFinanceService({
  bus,
  now,
  registerPersistence,
}: {
  bus: ServiceBus;
  now: () => string;
  registerPersistence?: (port: FinancePersistencePort) => void;
}): FinanceService {
  const ledgers = new Map<string, FinanceLedger>();
  const commandReceipts = new Map<string, FinanceCommandReceipt>();
  const requireLedger = (tenantId: string, policyId: string) => {
    const ledger = ledgers.get(key(tenantId, policyId));
    if (!ledger)
      throw new Error("Finance requires an initialized Policy State for this tenant and policy.");
    return ledger;
  };

  // Build a new ledger locally so invalid allocations or commission math cannot partly commit.
  const applyFinance = (message: EventEnvelope<FinanceEvent>): FinanceLedger => {
    assertRequired(message.tenantId, "Tenant ID");
    assertRequired(message.messageId, "Message ID");
    assertRequired(message.event.commandId, "Command ID");
    assertRequired(message.correlationId, "Correlation ID");
    assertUtcTimestamp(message.occurredAt);
    const event = message.event;
    const previous = requireLedger(message.tenantId, event.policyId);
    const ledger: FinanceLedger = {
      ...previous,
      financeEntries: [...previous.financeEntries],
      commissionEntries: [...previous.commissionEntries],
      auditEntries: [...previous.auditEntries],
    };
    const policy = { id: event.policyId, commissionPlan: ledger.policyState.commissionPlan };
    const entry = (kind: LedgerEntry["kind"], amountCents: number): LedgerEntry => ({
      id: `finance-entry:${message.messageId}`,
      sourceEventId: message.messageId,
      tenantId: message.tenantId,
      policyId: event.policyId,
      kind,
      amountCents,
      occurredAt: message.occurredAt,
    });
    if (event.type === "finance.refund.recorded") {
      if (!Array.isArray(event.allocations) || event.allocations.length === 0)
        throw new Error("Refund allocations are required.");
      const allocationIds = new Set<string>();
      for (const allocation of event.allocations) {
        assertRequired(allocation.allocationId, "Allocation ID");
        if (allocationIds.has(allocation.allocationId))
          throw new Error("Allocation IDs must be unique within a command.");
        allocationIds.add(allocation.allocationId);
        assertCents(allocation.amountCents);
        const source = ledger.financeEntries.find((e) => e.id === allocation.financeEntryId);
        if (
          !source ||
          source.tenantId !== message.tenantId ||
          source.policyId !== event.policyId ||
          (source.kind !== "deposit" && source.kind !== "premium_payment")
        ) {
          throw new Error(
            "Refund source must be a deposit or settled premium in this tenant and policy.",
          );
        }
        const refunded = ledger.financeEntries
          .filter((e) => e.refundsFinanceEntryId === source.id)
          .reduce((sum, e) => sum - e.amountCents, 0);
        if (allocation.amountCents > source.amountCents - refunded)
          throw new Error("Refund exceeds the source's remaining refundable balance.");
        ledger.financeEntries.push({
          ...entry("refund", -allocation.amountCents),
          id: `finance-entry:${key(message.messageId, allocation.allocationId)}`,
          allocationId: allocation.allocationId,
          refundsFinanceEntryId: source.id,
        });

        if (source.kind !== "premium_payment" || !policy.commissionPlan.reverseOnRefund) continue;
        const accrual = ledger.commissionEntries.find(
          (e) =>
            e.kind === "accrual" &&
            (policy.commissionPlan.timing === "on_bind" ||
              e.sourceEventId === source.sourceEventId),
        );
        if (!accrual) throw new Error("Refunded premium has no originating commission accrual.");
        const priorAdjustments = ledger.commissionEntries
          .filter((e) => e.reversesCommissionEntryId === accrual.id)
          .reduce((sum, e) => sum + e.amountCents, 0);
        let refundedPremium = refunded + allocation.amountCents;
        if (policy.commissionPlan.timing === "on_bind") {
          // Written commission is capped at the bound premium, including overpayments.
          let remaining = ledger.policyState.premiumCents;
          for (const refund of ledger.financeEntries) {
            if (!refund.refundsFinanceEntryId) continue;
            const original = ledger.financeEntries.find(
              (e) => e.id === refund.refundsFinanceEntryId,
            );
            if (original?.kind === "premium_payment")
              remaining -= Math.min(remaining, -refund.amountCents);
          }
          refundedPremium = ledger.policyState.premiumCents - remaining;
        }
        const adjustment = refundCommissionAdjustmentCents(
          policy.commissionPlan,
          refundedPremium,
          priorAdjustments,
        );
        if (adjustment !== 0)
          ledger.commissionEntries.push({
            ...createRefundAdjustmentEntry(
              policy,
              message.messageId,
              adjustment,
              message.occurredAt,
              accrual.id,
            ),
            id: `commission:${key(message.messageId, allocation.allocationId, accrual.id)}`,
          });
      }
    } else if (event.type === "finance.commission.paid") {
      const payable = projectCommissionEntries(ledger.commissionEntries, message.occurredAt).find(
        (e) => e.id === event.commissionEntryId,
      );
      if (!payable || payable.kind === "payment")
        throw new Error("Unknown commission accrual or adjustment.");
      if (payable.status === "paid") throw new Error("Commission is already paid.");
      if (payable.status !== "payable") throw new Error("Commission is not yet payable.");
      ledger.commissionEntries.push(
        createPaymentEntry(payable, message.messageId, message.occurredAt),
      );
    } else {
      assertCents(event.amountCents);
      if (event.type === "finance.deposit.recorded")
        ledger.financeEntries.push(entry("deposit", event.amountCents));
      if (event.type === "finance.claim.payment.recorded")
        ledger.financeEntries.push(entry("claim_payment", -event.amountCents));
      if (event.type === "finance.premium.payment.settled") {
        ledger.financeEntries.push(entry("premium_payment", event.amountCents));
        if (policy.commissionPlan.timing === "as_earned")
          ledger.commissionEntries.push(
            createAccrualEntry(policy, message.messageId, event.amountCents, message.occurredAt),
          );
      }
    }
    ledger.auditEntries.push({
      ...audit(message),
      ...(event.type === "finance.commission.paid"
        ? { commissionEntryId: event.commissionEntryId }
        : {}),
    });
    return ledger;
  };

  bus.subscribe("finance-policy-state", "policy.state.changed", (message) => {
    const state = message.event.state;
    const ledgerKey = key(message.tenantId, state.policyId);
    const previous = ledgers.get(ledgerKey);
    if (previous && state.revision <= previous.policyState.revision) return;
    assertRequired(message.tenantId, "Tenant ID");
    assertRequired(state.policyId, "Policy ID");
    assertCents(state.premiumCents);
    assertCommissionPlan(state.commissionPlan);
    assertUtcTimestamp(message.occurredAt);
    if (!Number.isSafeInteger(state.revision) || state.revision < 1)
      throw new Error("Policy State revision must be a positive integer.");
    if (!previous && (state.revision !== 1 || state.lifecycle !== "bound"))
      throw new Error("Finance must initialize from the bound Policy State revision.");
    const ledger: FinanceLedger = previous
      ? {
          ...previous,
          policyState: state,
          auditEntries: [...previous.auditEntries, audit(message)],
        }
      : {
          policyState: state,
          financeEntries: [],
          commissionEntries: [],
          auditEntries: [audit(message)],
        };
    if (!previous && state.commissionPlan.timing === "on_bind")
      ledger.commissionEntries.push(
        createAccrualEntry(
          { id: state.policyId, commissionPlan: state.commissionPlan },
          message.messageId,
          state.premiumCents,
          message.occurredAt,
        ),
      );
    ledgers.set(ledgerKey, snapshot(ledger));
  });

  const consume = (message: EventEnvelope<FinanceEvent>) => {
    assertRequired(message.event.commandId, "Command ID");
    const receiptKey = key(message.tenantId, message.event.commandId);
    const fingerprint = commandFingerprint(message.event, message.correlationId);
    const receipt = commandReceipts.get(receiptKey);
    if (
      receipt &&
      (receipt.fingerprint !== fingerprint || receipt.envelope.messageId !== message.messageId)
    )
      throw new Error("Command ID was already used with different input or source message.");
    if (receipt?.applied) return;
    const ledger = applyFinance(message);
    ledgers.set(key(message.tenantId, message.event.policyId), snapshot(ledger));
    commandReceipts.set(receiptKey, { fingerprint, envelope: snapshot(message), applied: true });
  };
  bus.subscribe("finance-ledger", "finance.deposit.recorded", consume);
  bus.subscribe("finance-ledger", "finance.premium.payment.settled", consume);
  bus.subscribe("finance-ledger", "finance.refund.recorded", consume);
  bus.subscribe("finance-ledger", "finance.claim.payment.recorded", consume);
  bus.subscribe("finance-ledger", "finance.commission.paid", consume);

  const publish = <T extends FinanceEvent>(command: FinanceCommand, event: T): EventEnvelope<T> => {
    assertRequired(command.commandId, "Command ID");
    assertRequired(command.correlationId, "Correlation ID");
    assertRequired(command.tenantId, "Tenant ID");
    assertRequired(command.policyId, "Policy ID");
    const receiptKey = key(command.tenantId, command.commandId);
    const fingerprint = commandFingerprint(event, command.correlationId);
    const receipt = commandReceipts.get(receiptKey);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint)
        throw new Error("Command ID was already used with different input.");
      return snapshot(receipt.envelope) as EventEnvelope<T>;
    }
    const ledger = requireLedger(command.tenantId, command.policyId);
    const message: EventEnvelope<T> = immutableSnapshot({
      messageId: `finance:${key(command.tenantId, command.commandId)}`,
      correlationId: command.correlationId,
      causationId: ledger.auditEntries.filter((e) => e.type === "policy.state.changed").at(-1)
        ?.sourceEventId,
      tenantId: command.tenantId,
      schemaVersion: 1,
      occurredAt: now(),
      event,
    });
    applyFinance(message);
    bus.publish(message);
    commandReceipts.set(receiptKey, { fingerprint, envelope: message, applied: false });
    return message;
  };

  const persistence: FinancePersistencePort = {
    checkpoint: () => ({
      version: 1,
      ledgers: [...ledgers.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([entryKey, value]) => ({ entryKey, value: structuredClone(value) }))
        .map(({ entryKey, value }) => ({ key: entryKey, value })),
      commandReceipts: [...commandReceipts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([entryKey, value]) => ({ key: entryKey, value: structuredClone(value) })),
    }),
    hydrate(checkpoint) {
      const restored = structuredClone(checkpoint);
      if (
        restored?.version !== 1 ||
        !Array.isArray(restored.ledgers) ||
        !Array.isArray(restored.commandReceipts)
      )
        throw new Error("Invalid Finance checkpoint.");
      const nextLedgers = new Map<string, FinanceLedger>();
      for (const row of restored.ledgers) {
        let parsed: unknown;
        try {
          parsed = typeof row?.key === "string" ? JSON.parse(row.key) : undefined;
        } catch {
          throw new Error("Invalid Finance checkpoint ledger key.");
        }
        if (
          !Array.isArray(parsed) ||
          parsed.length !== 2 ||
          typeof parsed[0] !== "string" ||
          typeof parsed[1] !== "string" ||
          !row.value ||
          row.value.policyState.policyId !== parsed[1] ||
          !Array.isArray(row.value.financeEntries) ||
          !Array.isArray(row.value.commissionEntries) ||
          !Array.isArray(row.value.auditEntries)
        )
          throw new Error("Invalid Finance checkpoint ledger identity.");
        if (nextLedgers.has(row.key)) throw new Error("Duplicate Finance checkpoint ledger.");
        const tenantId = parsed[0];
        const policyId = parsed[1];
        const state = row.value.policyState;
        if (
          (state.lifecycle !== "bound" && state.lifecycle !== "cancelled") ||
          !Number.isSafeInteger(state.revision) ||
          state.revision < 1 ||
          (state.product !== "risk_secure" && state.product !== "risk_secure_plus") ||
          !Number.isSafeInteger(state.premiumCents) ||
          state.premiumCents <= 0 ||
          typeof state.sourcePolicyMessageId !== "string" ||
          !state.sourcePolicyMessageId.trim()
        )
          throw new Error("Invalid Finance checkpoint Policy State.");
        assertCommissionPlan(state.commissionPlan);
        if (
          row.value.financeEntries.some(
            (entry) =>
              entry.tenantId !== tenantId ||
              entry.policyId !== policyId ||
              typeof entry.id !== "string" ||
              !entry.id.trim() ||
              typeof entry.sourceEventId !== "string" ||
              !entry.sourceEventId.trim() ||
              !["deposit", "premium_payment", "refund", "claim_payment"].includes(entry.kind) ||
              !Number.isSafeInteger(entry.amountCents) ||
              entry.amountCents === 0 ||
              ((entry.kind === "deposit" || entry.kind === "premium_payment") &&
                entry.amountCents < 0) ||
              ((entry.kind === "refund" || entry.kind === "claim_payment") &&
                entry.amountCents > 0) ||
              (() => {
                try {
                  assertUtcTimestamp(entry.occurredAt);
                  return false;
                } catch {
                  return true;
                }
              })(),
          )
        )
          throw new Error("Invalid or cross-tenant Finance checkpoint ledger entry.");
        if (
          new Set(row.value.financeEntries.map((entry) => entry.id)).size !==
          row.value.financeEntries.length
        )
          throw new Error("Duplicate Finance checkpoint ledger entry.");
        if (
          row.value.commissionEntries.some((entry) => {
            try {
              assertUtcTimestamp(entry.earnedAt);
              assertUtcTimestamp(entry.payableAt);
              if (entry.paidAt) assertUtcTimestamp(entry.paidAt);
            } catch {
              return true;
            }
            return (
              entry.policyId !== policyId ||
              typeof entry.id !== "string" ||
              !entry.id.trim() ||
              typeof entry.sourceEventId !== "string" ||
              !entry.sourceEventId.trim() ||
              !["accrual", "refund_adjustment", "payment"].includes(entry.kind) ||
              !["earned", "payable", "paid"].includes(entry.status) ||
              !Number.isSafeInteger(entry.amountCents) ||
              entry.amountCents === 0
            );
          })
        )
          throw new Error("Invalid Finance checkpoint commission entry.");
        if (
          new Set(row.value.commissionEntries.map((entry) => entry.id)).size !==
          row.value.commissionEntries.length
        )
          throw new Error("Duplicate Finance checkpoint commission entry.");
        const auditIds = new Set<string>();
        const allowedAuditTypes = new Set<ServiceEvent["type"]>([
          "policy.state.changed",
          "finance.deposit.recorded",
          "finance.premium.payment.settled",
          "finance.refund.recorded",
          "finance.claim.payment.recorded",
          "finance.commission.paid",
        ]);
        for (const entry of row.value.auditEntries) {
          if (
            entry.tenantId !== tenantId ||
            typeof entry.sourceEventId !== "string" ||
            !entry.sourceEventId.trim() ||
            typeof entry.correlationId !== "string" ||
            !entry.correlationId.trim() ||
            !allowedAuditTypes.has(entry.type) ||
            auditIds.has(entry.sourceEventId)
          )
            throw new Error("Invalid or cross-tenant Finance checkpoint audit entry.");
          assertUtcTimestamp(entry.occurredAt);
          auditIds.add(entry.sourceEventId);
        }
        if (!row.value.auditEntries.some((entry) => entry.type === "policy.state.changed"))
          throw new Error("Finance checkpoint is missing its Policy State audit entry.");
        nextLedgers.set(row.key, snapshot(row.value));
      }
      const nextReceipts = new Map<string, FinanceCommandReceipt>();
      for (const row of restored.commandReceipts) {
        let parsed: unknown;
        try {
          parsed = typeof row?.key === "string" ? JSON.parse(row.key) : undefined;
        } catch {
          throw new Error("Invalid Finance checkpoint command receipt key.");
        }
        if (
          !Array.isArray(parsed) ||
          parsed.length !== 2 ||
          typeof parsed[0] !== "string" ||
          typeof parsed[1] !== "string" ||
          !row.value ||
          typeof row.value.fingerprint !== "string" ||
          typeof row.value.applied !== "boolean" ||
          row.value.envelope.tenantId !== parsed[0] ||
          row.value.envelope.event.commandId !== parsed[1] ||
          row.value.envelope.messageId !== `finance:${key(parsed[0], parsed[1])}` ||
          row.value.fingerprint !==
            commandFingerprint(row.value.envelope.event, row.value.envelope.correlationId)
        )
          throw new Error("Invalid Finance checkpoint command receipt fingerprint or identity.");
        if (nextReceipts.has(row.key)) throw new Error("Duplicate Finance checkpoint receipt.");
        assertUtcTimestamp(row.value.envelope.occurredAt);
        const ledger = nextLedgers.get(key(parsed[0], row.value.envelope.event.policyId));
        if (!ledger) throw new Error("Finance checkpoint receipt references a missing ledger.");
        const wasApplied = ledger.auditEntries.some(
          (entry) => entry.sourceEventId === row.value.envelope.messageId,
        );
        if (wasApplied !== row.value.applied)
          throw new Error("Finance checkpoint receipt applied state contradicts its ledger.");
        nextReceipts.set(row.key, snapshot(row.value));
      }
      ledgers.clear();
      commandReceipts.clear();
      for (const [entryKey, value] of nextLedgers) ledgers.set(entryKey, value);
      for (const [entryKey, value] of nextReceipts) commandReceipts.set(entryKey, value);
    },
  };
  registerPersistence?.(persistence);

  return {
    recordDeposit: (command) =>
      publish(command, {
        type: "finance.deposit.recorded",
        commandId: command.commandId,
        policyId: command.policyId,
        amountCents: command.amountCents,
      }),
    settlePremiumPayment: (command) =>
      publish(command, {
        type: "finance.premium.payment.settled",
        commandId: command.commandId,
        policyId: command.policyId,
        amountCents: command.amountCents,
      }),
    recordClaimPayment: (command) =>
      publish(command, {
        type: "finance.claim.payment.recorded",
        commandId: command.commandId,
        policyId: command.policyId,
        amountCents: command.amountCents,
      }),
    recordRefund: (command) =>
      publish(command, {
        type: "finance.refund.recorded",
        commandId: command.commandId,
        policyId: command.policyId,
        allocations: command.allocations,
      }),
    payCommission: (command) =>
      publish(command, {
        type: "finance.commission.paid",
        commandId: command.commandId,
        policyId: command.policyId,
        commissionEntryId: command.commissionEntryId,
      }),
    getLedger(tenantId, policyId) {
      const ledger = ledgers.get(key(tenantId, policyId));
      return ledger ? snapshot(ledger) : undefined;
    },
    getCommissionEntries(tenantId, policyId) {
      return snapshot(
        projectCommissionEntries(
          requireLedger(tenantId, policyId).commissionEntries,
          assertUtcTimestamp(now()),
        ),
      );
    },
  };
}
