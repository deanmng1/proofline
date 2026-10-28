import * as domain from "@testbed/domain";
import { describe, expect, test } from "vitest";
import { createInsuranceRuntime } from "./runtime";
import { bindCommand, failFinanceOnce, quoteCommand, runtimeSeed } from "./test-fixtures";

describe("insurance runtime", () => {
  test("rejects_foreign_quote_references_without_draining_another_tenants_pending_delivery", () => {
    const runtime = createInsuranceRuntime(runtimeSeed, { busFactory: failFinanceOnce });
    runtime.execute(quoteCommand);
    expect(() => runtime.execute(bindCommand)).toThrow("pending");
    const pending = runtime.snapshot("tenant-a");
    expect(pending.pendingMessages).toHaveLength(1);
    expect(pending.finance.ledgers).toEqual([]);

    expect(() =>
      runtime.execute({
        ...quoteCommand,
        tenantId: "tenant-b",
        commandId: "foreign-quote",
      }),
    ).toThrow("Property is not owned by the customer in this tenant.");

    expect(runtime.snapshot("tenant-a")).toEqual(pending);
    expect(runtime.snapshot("tenant-b").messages).toEqual([]);
    runtime.execute(bindCommand);
    expect(runtime.snapshot("tenant-a").pendingMessages).toEqual([]);
    expect(runtime.getLedger("tenant-a", "policy")?.commissionEntries).toHaveLength(1);
  });
  test("same_command_ids_and_entity_ids_are_independent_across_tenants", () => {
    const runtime = createInsuranceRuntime({
      tenants: ["tenant-a", "tenant-b"],
      customers: ["tenant-a", "tenant-b"].map((tenantId) => ({
        ...runtimeSeed.customers[0],
        tenantId,
      })),
      properties: ["tenant-a", "tenant-b"].map((tenantId) => ({
        ...runtimeSeed.properties[0],
        tenantId,
      })),
    });
    for (const tenantId of ["tenant-a", "tenant-b"]) {
      runtime.execute({ ...quoteCommand, tenantId });
      runtime.execute({ ...bindCommand, tenantId });
    }
    expect(runtime.getLedger("tenant-a", "policy")?.commissionEntries).toHaveLength(1);
    expect(runtime.getLedger("tenant-b", "policy")?.commissionEntries).toHaveLength(1);
    expect(runtime.snapshot("tenant-a").messages.every((m) => m.tenantId === "tenant-a")).toBe(
      true,
    );
    expect(runtime.snapshot("tenant-b").messages.every((m) => m.tenantId === "tenant-b")).toBe(
      true,
    );
  });
  test("bind_chain_is_idempotent_across_all_consumers", () => {
    const runtime = createInsuranceRuntime(runtimeSeed);
    runtime.execute(quoteCommand);
    runtime.execute(bindCommand);
    runtime.execute(bindCommand);
    const state = runtime.snapshot("tenant-a");
    expect(state.policy.policies).toHaveLength(1);
    expect(state.policyState.timelines.policy).toHaveLength(1);
    expect(state.finance.ledgers[0].commissionEntries).toHaveLength(1);
    expect(state.messages.map((m) => m.event.type)).toEqual([
      "policy.quote.created",
      "policy.lifecycle.changed",
      "policy.state.changed",
    ]);
    expect(state.messages.every((m) => m.correlationId === "workflow")).toBe(true);
    expect(state.messages[2].causationId).toBe(state.messages[1].messageId);
    expect(state.deliveries.map((d) => d.consumerId)).toEqual([
      "policy-state",
      "finance-policy-state",
    ]);
    expect(runtime).not.toHaveProperty("bus");
    expect(runtime).not.toHaveProperty("policyService");
    state.policy.policies[0].premiumCents = 1;
    expect(runtime.getLedger("tenant-a", "policy")?.policy.premiumCents).toBe(10_000);
  });
  test("fresh_runtimes_do_not_share_bus_or_ledger_state", () => {
    const seed = { ...runtimeSeed, commands: [quoteCommand, bindCommand] };
    const first = createInsuranceRuntime(seed);
    const second = createInsuranceRuntime(seed);
    first.execute({
      type: "deposit_recorded",
      schemaVersion: 1,
      tenantId: "tenant-a",
      commandId: "deposit",
      correlationId: "workflow",
      policyId: "policy",
      amountCents: 100,
    });
    expect(first.getLedger("tenant-a", "policy")?.financeEntries).toHaveLength(1);
    expect(second.getLedger("tenant-a", "policy")?.financeEntries).toHaveLength(0);
    expect(second.snapshot("tenant-a").messages).toHaveLength(3);
    expect(first.snapshot("tenant-b").messages).toEqual([]);
  });
  test("legacy_reducer_is_not_exported_or_used_by_the_runtime", () => {
    expect(domain).not.toHaveProperty("applyEvent");
    expect(domain).not.toHaveProperty("emptyDomainState");
    const runtime = createInsuranceRuntime({
      ...runtimeSeed,
      commands: [quoteCommand, bindCommand],
    });
    expect(runtime.getLedger("tenant-a", "policy")?.policyState.lifecycle).toBe("bound");
    expect(runtime.snapshot("tenant-a")).not.toHaveProperty("domain");
  });
  test("retries_pending_finance_delivery_without_duplicate_policy_or_commission_records", () => {
    const runtime = createInsuranceRuntime(runtimeSeed, { busFactory: failFinanceOnce });
    runtime.execute(quoteCommand);
    expect(() => runtime.execute(bindCommand)).toThrow("pending");
    expect(runtime.snapshot("tenant-a").pendingMessages).toHaveLength(1);
    expect(runtime.getLedger("tenant-a", "policy")).toBeUndefined();
    runtime.execute(bindCommand);
    const state = runtime.snapshot("tenant-a");
    expect(state.policy.policies).toHaveLength(1);
    expect(state.policyState.timelines.policy).toHaveLength(1);
    expect(state.finance.ledgers[0].commissionEntries).toHaveLength(1);
    expect(state.pendingMessages).toEqual([]);
    expect(state.deliveries.map((d) => d.status)).toEqual(["completed", "failed", "completed"]);
  });
  test("cancellation_is_terminal_and_replay_does_not_restore_bound_state", () => {
    const runtime = createInsuranceRuntime({
      ...runtimeSeed,
      commands: [quoteCommand, bindCommand],
    });
    const cancel = {
      type: "transition_policy" as const,
      schemaVersion: 1 as const,
      tenantId: "tenant-a",
      commandId: "cancel",
      correlationId: "workflow",
      policyId: "policy",
      lifecycle: "cancelled" as const,
    };
    runtime.execute(cancel);
    runtime.execute(bindCommand);
    runtime.execute(cancel);
    expect(runtime.getLedger("tenant-a", "policy")?.policyState.lifecycle).toBe("cancelled");
    expect(runtime.snapshot("tenant-a").policyState.timelines.policy).toHaveLength(2);
    expect(() => runtime.execute({ ...cancel, commandId: "cancel-again" })).toThrow();
  });
});
