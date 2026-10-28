import { setupServer } from "msw/node";
import { describe, expect, test } from "vitest";
import {
  bindCommand,
  failFinanceOnce,
  quoteCommand,
  runtimeSeed,
} from "../../insurance-runtime/src/test-fixtures";
import type { PolicyLedger, TestApi, TestApiSnapshot } from "./contracts";
import { createMswHandlers } from "./handlers";
import { createTestApi } from "./test-api";

const seed = { ...runtimeSeed, commands: [quoteCommand, bindCommand] };
const request = (path: string, body?: unknown, tenant: string | null = "tenant-a") =>
  new Request(`http://test.local/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(tenant === null ? {} : { "X-Tenant-Id": tenant }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const post = (api: TestApi, body: unknown) =>
  api.handle(request("policies/policy/finance-events", body));
const finance = (commandId: string, type = "premium_payment_settled", amountCents = 2500) => ({
  commandId,
  correlationId: "workflow",
  type,
  amountCents,
});

describe("createTestApi", () => {
  test("creates_generated_quote_and_policy_once_and_rejects_changed_replay", async () => {
    const api = createTestApi(runtimeSeed);
    const body = {
      commandId: "new-quote",
      correlationId: "new-workflow",
      customerId: "customer",
      propertyId: "property",
      product: "risk_secure",
      premiumCents: 10000,
      commissionPlan: {
        timing: "on_bind",
        rateBasisPoints: 1000,
        holdPeriodDays: 0,
        reverseOnRefund: true,
      },
    };
    const created = await api.handle(request("quotes", body));
    expect(created.status).toBe(201);
    const quote = await created.json();
    expect(await (await api.handle(request("quotes", body))).json()).toEqual(quote);
    expect((await api.handle(request("quotes", { ...body, premiumCents: 20000 }))).status).toBe(
      409,
    );
    const bind = { commandId: "new-bind", correlationId: "new-workflow" };
    const policy = await (await api.handle(request(`quotes/${quote.id}/bind`, bind))).json();
    expect(await (await api.handle(request(`quotes/${quote.id}/bind`, bind))).json()).toEqual(
      policy,
    );
    const ledger: PolicyLedger = await (
      await api.handle(request(`policies/${policy.id}/ledger`))
    ).json();
    expect(ledger.commissionEntries).toHaveLength(1);
  });
  test("rejects_invalid_quote_plan_and_foreign_property_without_publishing", async () => {
    const api = createTestApi(runtimeSeed);
    const base = {
      commandId: "invalid-quote",
      correlationId: "workflow",
      customerId: "customer",
      propertyId: "property",
      product: "risk_secure",
      premiumCents: 10000,
      commissionPlan: {
        timing: "on_bind",
        rateBasisPoints: -1000,
        holdPeriodDays: 0,
        reverseOnRefund: true,
      },
    };
    const badPlan = await api.handle(request("quotes", base));
    expect(badPlan.status).toBe(400);
    expect(await badPlan.json()).toMatchObject({ error: { code: "invalid_quote" } });
    expect(
      (
        await api.handle(
          request("quotes", {
            ...base,
            propertyId: "foreign",
            commissionPlan: { ...base.commissionPlan, rateBasisPoints: 1000 },
          }),
        )
      ).status,
    ).toBe(400);
    const state: TestApiSnapshot = await (await api.handle(request("test/state"))).json();
    expect(state.messages).toEqual([]);
  });
  test("isolates state for API instances created from the same seed", async () => {
    const first = createTestApi(seed);
    const second = createTestApi(seed);
    expect((await post(first, finance("premium"))).status).toBe(201);
    const a: TestApiSnapshot = await (await first.handle(request("test/state"))).json();
    const b: TestApiSnapshot = await (await second.handle(request("test/state"))).json();
    expect(a.finance.ledgers[0].financeEntries).toHaveLength(1);
    expect(b.finance.ledgers[0].financeEntries).toHaveLength(0);
  });
  test("rejects_missing_or_cross_tenant_request_context", async () => {
    const api = createTestApi(seed);
    expect(
      (
        await api.handle(
          request("quotes/quote/bind", { commandId: "attack", correlationId: "workflow" }, null),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await api.handle(
          request(
            "quotes/quote/bind",
            { commandId: "attack", correlationId: "workflow" },
            "unknown",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (await api.handle(request("policies/policy/ledger", undefined, "tenant-b"))).status,
    ).toBe(404);
    expect(
      (
        await api.handle(
          request(
            "quotes/quote/bind",
            { commandId: "attack", correlationId: "workflow", tenantId: "tenant-a" },
            "tenant-b",
          ),
        )
      ).status,
    ).toBe(400);
    const state: TestApiSnapshot = await (await api.handle(request("test/state"))).json();
    expect(state.messages).toHaveLength(3);
  });
  test("replays_http_mutation_with_the_same_command_id", async () => {
    const api = createTestApi(seed);
    expect((await post(api, finance("premium"))).status).toBe(201);
    expect((await post(api, finance("premium"))).status).toBe(201);
    expect((await post(api, finance("premium", "premium_payment_settled", 3000))).status).toBe(409);
    const ledger: PolicyLedger = await (await api.handle(request("policies/policy/ledger"))).json();
    expect(ledger.financeEntries).toHaveLength(1);
  });
  test("binds_over_http_and_exposes_finance_initialized_through_policy_state", async () => {
    const api = createTestApi({ ...runtimeSeed, commands: [quoteCommand] });
    const body = { commandId: "bind-command", correlationId: "workflow", policyId: "policy" };
    expect((await api.handle(request("quotes/quote/bind", body))).status).toBe(201);
    expect((await api.handle(request("quotes/quote/bind", body))).status).toBe(201);
    const ledger: PolicyLedger = await (await api.handle(request("policies/policy/ledger"))).json();
    expect(ledger.commissionEntries).toHaveLength(1);
    expect(ledger.policyState).toMatchObject({ lifecycle: "bound", revision: 1 });
    expect(ledger.auditEntries.map((e) => e.type)).toEqual([
      "policy.quote.created",
      "policy.lifecycle.changed",
      "policy.state.changed",
    ]);
  });
  test("http_replay_recovers_pending_finance_delivery", async () => {
    const api = createTestApi(
      { ...runtimeSeed, commands: [quoteCommand] },
      { busFactory: failFinanceOnce },
    );
    const body = { commandId: "bind-command", correlationId: "workflow", policyId: "policy" };
    const pending = await api.handle(request("quotes/quote/bind", body));
    expect(pending.status).toBe(409);
    expect(await pending.json()).toMatchObject({
      error: { code: "delivery_pending", recoverable: true },
    });
    expect((await api.handle(request("quotes/quote/bind", body))).status).toBe(201);
    const state: TestApiSnapshot = await (await api.handle(request("test/state"))).json();
    expect(state.finance.ledgers[0].commissionEntries).toHaveLength(1);
    expect(state.pendingMessages).toEqual([]);
  });
  test("mixed_refund_allocations_reverse_only_settled_premium_commission", async () => {
    const api = createTestApi(seed);
    await post(api, finance("deposit", "deposit_recorded", 3000));
    const ledger: PolicyLedger = await (
      await post(api, finance("premium", "premium_payment_settled", 5000))
    ).json();
    const result = await post(api, {
      commandId: "refund",
      correlationId: "workflow",
      type: "refund_recorded",
      allocations: [
        {
          allocationId: "deposit-refund",
          financeEntryId: ledger.financeEntries[0].id,
          amountCents: 1000,
        },
        {
          allocationId: "premium-refund",
          financeEntryId: ledger.financeEntries[1].id,
          amountCents: 2000,
        },
      ],
    });
    expect(result.status).toBe(201);
    const refunded: PolicyLedger = await result.json();
    expect(
      refunded.financeEntries.filter((e) => e.kind === "refund").map((e) => e.amountCents),
    ).toEqual([-1000, -2000]);
    expect(
      refunded.commissionEntries
        .filter((e) => e.kind === "refund_adjustment")
        .map((e) => e.amountCents),
    ).toEqual([-200]);
  });
  test("requires_independent_command_and_correlation_identities_before_mutation", async () => {
    const api = createTestApi(seed);
    expect((await post(api, { type: "deposit_recorded", amountCents: 100 })).status).toBe(400);
    expect(
      (await post(api, { commandId: "deposit", type: "deposit_recorded", amountCents: 100 }))
        .status,
    ).toBe(400);
    expect((await post(api, finance("deposit", "deposit_recorded", -1))).status).toBe(400);
    expect(
      (await post(api, { ...finance("refund", "refund_recorded"), totalRefundedCents: 100 }))
        .status,
    ).toBe(400);
  });
  test("uses the identical contract through MSW handlers", async () => {
    const server = setupServer(...createMswHandlers(createTestApi(seed)));
    server.listen({ onUnhandledRequest: "error" });
    try {
      expect((await fetch(request("policies/policy/ledger"))).status).toBe(200);
    } finally {
      server.close();
    }
  });
  test("returns a deliberate error for an unknown route", async () => {
    const response = await createTestApi(seed).handle(request("not-a-route"));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "route_not_found" } });
  });
});
