import { createFinanceService } from "@testbed/finance-service";
import { createPolicyService } from "@testbed/policy-service";
import { createInMemoryServiceBus } from "@testbed/service-bus";
import { describe, expect, test } from "vitest";
import { createInsuranceRuntime } from "./runtime";
import { bindCommand, quoteCommand, runtimeSeed } from "./test-fixtures";

describe("UTC timestamp boundaries", () => {
  for (const timestamp of [
    "2026-01-01T12:00:00",
    "2026-01-01",
    "bad",
    "2026-02-30T00:00:00.000Z",
    "2026-01-01T24:00:00.000Z",
    "2026-01-01T12:00:00+00:00",
  ]) {
    test(`rejects_invalid_clock_command_and_envelope_${timestamp}`, () => {
      expect(() => createInsuranceRuntime(runtimeSeed, { now: timestamp })).toThrow(/timestamp/i);
      const runtime = createInsuranceRuntime(runtimeSeed);
      expect(() => runtime.execute({ ...quoteCommand, occurredAt: timestamp })).toThrow(
        /timestamp/i,
      );
      expect(runtime.snapshot("tenant-a").messages).toEqual([]);
      const bus = createInMemoryServiceBus();
      expect(() =>
        bus.publish({
          messageId: "bad",
          correlationId: "workflow",
          tenantId: "tenant-a",
          schemaVersion: 1,
          occurredAt: timestamp,
          event: {
            type: "finance.deposit.recorded",
            commandId: "bad",
            policyId: "policy",
            amountCents: 100,
          },
        }),
      ).toThrow(/timestamp/i);
      expect(bus.pendingMessages()).toEqual([]);
    });
  }

  test("policy_clock_rejection_leaves_each_command_retryable_without_partial_state", () => {
    const bus = createInMemoryServiceBus();
    let time = "2026-01-01T12:00:00";
    const service = createPolicyService({
      bus,
      clock: () => time,
      ids: { next: (prefix) => prefix },
      referenceData: { ownsProperty: () => true },
    });
    expect(() => service.createQuote(quoteCommand)).toThrow(/timestamp/i);
    expect(service.getQuote("tenant-a", "quote")).toBeUndefined();
    time = "2026-01-01T12:00:00.000Z";
    service.createQuote(quoteCommand);
    time = "2026-02-30T00:00:00.000Z";
    expect(() => service.bindQuote(bindCommand)).toThrow(/timestamp/i);
    expect(service.getQuote("tenant-a", "quote")?.status).toBe("quoted");
    time = "2026-01-01T12:00:00.000Z";
    service.bindQuote(bindCommand);
    const cancel = {
      commandId: "cancel",
      correlationId: "workflow",
      tenantId: "tenant-a",
      policyId: "policy",
      lifecycle: "cancelled" as const,
    };
    time = "bad";
    expect(() => service.transitionPolicy(cancel)).toThrow(/timestamp/i);
    time = "2026-01-01T12:00:00.000Z";
    service.transitionPolicy(cancel);
    expect(bus.pendingMessages()).toHaveLength(3);
  });

  test("finance_rejects_invalid_command_and_projection_clocks", () => {
    const bus = createInMemoryServiceBus();
    let time = "2026-01-01T00:00:00.000Z";
    const service = createFinanceService({ bus, now: () => time });
    bus.publish({
      messageId: "state",
      correlationId: "workflow",
      tenantId: "tenant-a",
      schemaVersion: 1,
      occurredAt: time,
      event: {
        type: "policy.state.changed",
        state: {
          policyId: "policy",
          lifecycle: "bound",
          revision: 1,
          product: "risk_secure",
          premiumCents: 10000,
          commissionPlan: quoteCommand.commissionPlan,
          sourcePolicyMessageId: "bound",
        },
      },
    });
    bus.drain();
    time = "2026-01-01T00:00:00";
    expect(() =>
      service.recordDeposit({
        commandId: "deposit",
        correlationId: "workflow",
        tenantId: "tenant-a",
        policyId: "policy",
        amountCents: 100,
      }),
    ).toThrow(/timestamp/i);
    expect(() => service.getCommissionEntries("tenant-a", "policy")).toThrow(/timestamp/i);
    expect(bus.pendingMessages()).toEqual([]);
    expect(service.getLedger("tenant-a", "policy")?.financeEntries).toEqual([]);
  });

  test("preserves_explicit_UTC_across_runtime_and_commission_hold_calculation", () => {
    const runtime = createInsuranceRuntime(runtimeSeed, { now: "2026-03-08T07:30:00.125Z" });
    runtime.execute({
      ...quoteCommand,
      commissionPlan: { ...quoteCommand.commissionPlan, holdPeriodDays: 1 },
    });
    runtime.execute(bindCommand);
    const ledger = runtime.getLedger("tenant-a", "policy");
    if (!ledger) throw new Error("Expected bound ledger");
    expect(ledger.policy.boundAt).toBe("2026-03-08T07:30:00.125Z");
    expect(ledger.commissionEntries[0].payableAt).toBe("2026-03-09T07:30:00.125Z");
  });
});
