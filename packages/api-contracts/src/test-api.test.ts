import { setupServer } from "msw/node";
import { describe, expect, test } from "vitest";
import { createInsuranceRuntime } from "../../insurance-runtime/src/runtime";
import {
  bindCommand,
  failFinanceOnce,
  quoteCommand,
  runtimeSeed,
} from "../../insurance-runtime/src/test-fixtures";
import type {
  PolicyLedger,
  TestApi,
  TestApiAuthorityClaims,
  TestApiAuthorityPort,
  TestApiOptions,
  TestApiSnapshot,
} from "./contracts";
import { createMswHandlers } from "./handlers";
import { createBearerAuthority, createTestApi } from "./test-api";

const seed = { ...runtimeSeed, commands: [quoteCommand, bindCommand] };
const request = (path: string, body?: unknown, tenant: string | null = "tenant-a") =>
  new Request(`http://test.local/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-authority",
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
const defaultAuthority = createBearerAuthority({
  "test-authority": {
    subject: "contract-test",
    role: "Owner",
    tenantIds: ["tenant-a", "tenant-b"],
  },
});
const createAuthorizedTestApi = (
  seed: Parameters<typeof createTestApi>[0] = {},
  options: Omit<TestApiOptions, "authority"> & { authority?: TestApiAuthorityPort } = {},
) => createTestApi(seed, { authority: defaultAuthority, ...options });

describe("createTestApi", () => {
  test("rejects_role_and_cross_tenant_mutations_through_the_test_api", async () => {
    const tokens = new Map<string, TestApiAuthorityClaims>([
      ["owner-a", { subject: "owner", role: "Owner", tenantIds: ["tenant-a"] }],
      ["viewer-a", { subject: "viewer", role: "Viewer", tenantIds: ["tenant-a"] }],
    ]);
    const api = createAuthorizedTestApi(
      { tenants: ["tenant-a", "tenant-b"] },
      {
        authority: {
          authorize(input) {
            const claims = input.bearerToken ? tokens.get(input.bearerToken) : undefined;
            if (!claims) return { allowed: false, code: "unauthenticated" };
            if (!claims.tenantIds.includes(input.tenantId))
              return { allowed: false, code: "cross_tenant" };
            if (input.mutation && claims.role === "Viewer")
              return { allowed: false, code: "role_forbidden" };
            return { allowed: true, claims };
          },
        },
      },
    );
    const authorityRequest = (token: string, tenantId: string, commandId: string) =>
      new Request("http://test.local/api/customers", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "X-Tenant-Id": tenantId,
        },
        body: JSON.stringify({
          commandId,
          correlationId: "authority-contract",
          name: "Authorized",
          email: "authorized@example.test",
        }),
      });
    expect((await api.handle(authorityRequest("owner-a", "tenant-a", "authorized"))).status).toBe(
      201,
    );
    const inspect = () =>
      api.handle(
        new Request("http://test.local/api/test/state", {
          headers: { authorization: "Bearer owner-a", "X-Tenant-Id": "tenant-a" },
        }),
      );
    const beforeDenials = await (await inspect()).text();
    expect(
      (await api.handle(authorityRequest("viewer-a", "tenant-a", "viewer-denied"))).status,
    ).toBe(403);
    expect(
      (await api.handle(authorityRequest("owner-a", "tenant-b", "tenant-denied"))).status,
    ).toBe(403);
    expect(await (await inspect()).text()).toBe(beforeDenials);
    expect(
      (
        await api.handle(
          new Request("http://test.local/api/customers", {
            headers: { authorization: "Bearer invalid", "X-Tenant-Id": "tenant-a" },
          }),
        )
      ).status,
    ).toBe(401);
  });

  test("authority_denial_does_not_drain_pending_recovery", async () => {
    const api = createAuthorizedTestApi(
      { ...runtimeSeed, commands: [quoteCommand] },
      {
        busFactory: failFinanceOnce,
        authority: createBearerAuthority({
          owner: { subject: "owner", role: "Owner", tenantIds: ["tenant-a"] },
          viewer: { subject: "viewer", role: "Viewer", tenantIds: ["tenant-a"] },
        }),
      },
    );
    const bind = (token: string) =>
      api.handle(
        new Request("http://test.local/api/quotes/quote/bind", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "X-Tenant-Id": "tenant-a",
          },
          body: JSON.stringify({
            commandId: "authority-bind",
            correlationId: "authority-recovery",
            policyId: "authority-policy",
          }),
        }),
      );
    const inspect = () =>
      api.handle(
        new Request("http://test.local/api/test/state", {
          headers: { authorization: "Bearer owner", "X-Tenant-Id": "tenant-a" },
        }),
      );

    expect((await bind("owner")).status).toBe(409);
    const pending = await (await inspect()).text();
    expect((await bind("viewer")).status).toBe(403);
    expect(await (await inspect()).text()).toBe(pending);
    expect((await bind("owner")).status).toBe(201);
    const recovered: TestApiSnapshot = await (await inspect()).json();
    expect(recovered.pendingMessages).toEqual([]);
    expect(recovered.policy.policies).toHaveLength(1);
    expect(recovered.finance.ledgers[0].commissionEntries).toHaveLength(1);
  });
  test("unclassified_operations_fail_before_authority_or_runtime_access", async () => {
    let authorityCalls = 0;
    const api = createAuthorizedTestApi(
      { ...runtimeSeed, commands: [quoteCommand] },
      {
        busFactory: failFinanceOnce,
        authority: {
          authorize(input) {
            authorityCalls += 1;
            return {
              allowed: true,
              claims: { subject: "owner", role: "Owner", tenantIds: [input.tenantId] },
            };
          },
        },
      },
    );
    const bind = () =>
      api.handle(
        request("quotes/quote/bind", {
          commandId: "future-operation-bind",
          correlationId: "future-operation-recovery",
          policyId: "future-operation-policy",
        }),
      );
    const inspect = () => api.handle(request("test/state"));

    expect((await bind()).status).toBe(409);
    const pending = await (await inspect()).text();
    const beforeFutureRequests = authorityCalls;
    for (const tenant of ["tenant-a", "unknown-tenant"]) {
      const response = await api.handle(
        request(
          "future/drain",
          { commandId: "future", correlationId: "future-operation-recovery" },
          tenant,
        ),
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: "route_not_found" } });
    }
    expect(authorityCalls).toBe(beforeFutureRequests);
    expect(await (await inspect()).text()).toBe(pending);
    expect((await bind()).status).toBe(201);
  });
  test("replays_lost_customer_and_property_responses_without_duplicate_entities", async () => {
    const api = createAuthorizedTestApi({ tenants: ["tenant-a"] });
    const customerBody = {
      commandId: "customer-command",
      correlationId: "intake-workflow",
      name: "Alex",
      email: "alex@example.test",
    };
    const firstCustomer = await (await api.handle(request("customers", customerBody))).json();
    expect(await (await api.handle(request("customers", customerBody))).json()).toEqual(
      firstCustomer,
    );
    expect(
      (await api.handle(request("customers", { ...customerBody, email: "changed@example.test" })))
        .status,
    ).toBe(409);
    const propertyBody = {
      commandId: "property-command",
      correlationId: "intake-workflow",
      customerId: firstCustomer.id,
      addressLine1: "1 Main",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
    };
    const firstProperty = await (await api.handle(request("properties", propertyBody))).json();
    expect(await (await api.handle(request("properties", propertyBody))).json()).toEqual(
      firstProperty,
    );
    expect(
      (await api.handle(request("properties", { ...propertyBody, postalCode: "99999" }))).status,
    ).toBe(409);
    const state: TestApiSnapshot = await (await api.handle(request("test/state"))).json();
    expect(state.customers).toEqual([firstCustomer]);
    expect(state.properties).toEqual([firstProperty]);
  });

  test("requires_command_and_correlation_identity_for_customer_and_property_intake", async () => {
    const api = createAuthorizedTestApi({ tenants: ["tenant-a"] });
    const customer = await api.handle(
      request("customers", { name: "Alex", email: "alex@example.test" }),
    );
    expect(customer.status).toBe(400);
    expect(await customer.json()).toMatchObject({ error: { code: "invalid_request" } });
    const property = await api.handle(
      request("properties", {
        customerId: "customer",
        addressLine1: "1 Main",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
      }),
    );
    expect(property.status).toBe(400);
    expect(await property.json()).toMatchObject({ error: { code: "invalid_request" } });
    const state: TestApiSnapshot = await (await api.handle(request("test/state"))).json();
    expect(state.customers).toEqual([]);
    expect(state.properties).toEqual([]);
  });

  test("rejects_foreign_quote_references_before_retrying_pending_finance_delivery", async () => {
    const api = createAuthorizedTestApi(
      { ...runtimeSeed, commands: [quoteCommand] },
      { busFactory: failFinanceOnce },
    );
    const bind = { commandId: "bind-command", correlationId: "workflow", policyId: "policy" };
    expect((await api.handle(request("quotes/quote/bind", bind))).status).toBe(409);
    const pending: TestApiSnapshot = await (await api.handle(request("test/state"))).json();
    expect(pending.pendingMessages).toHaveLength(1);
    expect(pending.finance.ledgers).toEqual([]);

    const rejected = await api.handle(
      request(
        "quotes",
        {
          commandId: "foreign-quote",
          correlationId: "foreign-workflow",
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
        },
        "tenant-b",
      ),
    );
    expect(rejected.status).toBe(400);
    expect(await (await api.handle(request("test/state"))).json()).toEqual(pending);

    expect((await api.handle(request("quotes/quote/bind", bind))).status).toBe(201);
    const recovered: TestApiSnapshot = await (await api.handle(request("test/state"))).json();
    expect(recovered.pendingMessages).toEqual([]);
    expect(recovered.finance.ledgers[0].commissionEntries).toHaveLength(1);
  });
  test("creates_generated_quote_and_policy_once_and_rejects_changed_replay", async () => {
    const api = createAuthorizedTestApi(runtimeSeed);
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
    const api = createAuthorizedTestApi(runtimeSeed);
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
    const first = createAuthorizedTestApi(seed);
    const second = createAuthorizedTestApi(seed);
    expect((await post(first, finance("premium"))).status).toBe(201);
    const a: TestApiSnapshot = await (await first.handle(request("test/state"))).json();
    const b: TestApiSnapshot = await (await second.handle(request("test/state"))).json();
    expect(a.finance.ledgers[0].financeEntries).toHaveLength(1);
    expect(b.finance.ledgers[0].financeEntries).toHaveLength(0);
  });
  test("rejects_missing_or_cross_tenant_request_context", async () => {
    const api = createAuthorizedTestApi(seed);
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
    const api = createAuthorizedTestApi(seed);
    expect((await post(api, finance("premium"))).status).toBe(201);
    expect((await post(api, finance("premium"))).status).toBe(201);
    expect((await post(api, finance("premium", "premium_payment_settled", 3000))).status).toBe(409);
    const ledger: PolicyLedger = await (await api.handle(request("policies/policy/ledger"))).json();
    expect(ledger.financeEntries).toHaveLength(1);
  });
  test("binds_over_http_and_exposes_finance_initialized_through_policy_state", async () => {
    const api = createAuthorizedTestApi({ ...runtimeSeed, commands: [quoteCommand] });
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
  test("exposes_cancelled_lifecycle_in_policy_list_detail_and_ledger", async () => {
    const api = createAuthorizedTestApi(seed);
    const cancelled = await api.handle(
      request("policies/policy/lifecycle", {
        commandId: "cancel",
        correlationId: "cancellation-workflow",
        lifecycle: "cancelled",
      }),
    );
    expect(cancelled.status).toBe(201);
    expect(await cancelled.json()).toMatchObject({
      policy: { id: "policy", status: "cancelled" },
      policyState: { lifecycle: "cancelled", revision: 2 },
    });
    expect(await (await api.handle(request("policies"))).json()).toEqual([
      expect.objectContaining({ id: "policy", status: "cancelled" }),
    ]);
    expect(await (await api.handle(request("policies/policy"))).json()).toMatchObject({
      id: "policy",
      status: "cancelled",
    });

    const runtime = createInsuranceRuntime(seed);
    runtime.execute({
      type: "transition_policy",
      schemaVersion: 1,
      tenantId: "tenant-a",
      commandId: "restore-cancel",
      correlationId: "restore-workflow",
      policyId: "policy",
      lifecycle: "cancelled",
    });
    const restored = createAuthorizedTestApi({}, { checkpoint: runtime.checkpoint() });
    expect(await (await restored.handle(request("policies"))).json()).toEqual([
      expect.objectContaining({ id: "policy", status: "cancelled" }),
    ]);
    expect(await (await restored.handle(request("policies/policy"))).json()).toMatchObject({
      id: "policy",
      status: "cancelled",
    });
  });
  test("http_replay_recovers_pending_finance_delivery", async () => {
    const api = createAuthorizedTestApi(
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
    const api = createAuthorizedTestApi(seed);
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
    const api = createAuthorizedTestApi(seed);
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
    const server = setupServer(...createMswHandlers(createAuthorizedTestApi(seed)));
    server.listen({ onUnhandledRequest: "error" });
    try {
      expect((await fetch(request("policies/policy/ledger"))).status).toBe(200);
    } finally {
      server.close();
    }
  });
  test("returns a deliberate error for an unknown route", async () => {
    const response = await createAuthorizedTestApi(seed).handle(request("not-a-route"));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "route_not_found" } });
  });
});
