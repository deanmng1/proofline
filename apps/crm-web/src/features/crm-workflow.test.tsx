import { onlineManager } from "@tanstack/react-query";
import { createMswHandlers, createTestApi, type TestSeed } from "@testbed/api-contracts";
import { ledgerSeed, renderWithProviders } from "@testbed/test-kit";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CustomerListPage } from "@/features/customers/customer-list-page";
import { PolicyDetailPage } from "@/features/policies/policy-detail-page";
import { QuoteForm } from "@/features/quotes/quote-form";
import { setActiveTenantId } from "@/lib/http";
import { server } from "@/test/server";
import { createInMemoryServiceBus } from "../../../../packages/service-bus/src";

function useTestApi(seed: TestSeed = ledgerSeed()) {
  setActiveTenantId("test-tenant");
  const api = createTestApi(seed, { now: "2026-01-01T00:00:00.000Z" });
  server.use(...createMswHandlers(api));
  return api;
}

describe("insurance CRM reference workflow", () => {
  beforeEach(() => {
    let sequence = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    );
  });
  test("lets an agent choose Risk Secure Plus, bind it once, and see the cash-first timing", async () => {
    useTestApi();
    const user = userEvent.setup();
    renderWithProviders(<QuoteForm />);

    await screen.findByRole("option", { name: /100 Market Street/i });
    await user.selectOptions(screen.getByLabelText("Policyholder"), "fixture-customer-1");
    await user.selectOptions(screen.getByLabelText("Insured property"), "fixture-property-1");
    await user.selectOptions(screen.getByLabelText("Product"), "risk_secure_plus");
    await user.clear(screen.getByLabelText("Premium in cents"));
    await user.type(screen.getByLabelText("Premium in cents"), "10000");
    await user.click(screen.getByRole("button", { name: "Create quote" }));

    expect(
      (await screen.findAllByText("Cash-first: 10% as premium is paid")).length,
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Bind quote" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "As earned — payable after 30 days",
    );
    expect(screen.getByRole("status")).toHaveTextContent("COM-002");
  });

  test("records a settled premium payment as an append-only ledger event", async () => {
    useTestApi();
    const user = userEvent.setup();
    renderWithProviders(<PolicyDetailPage policyId="fixture-policy-1" />);

    await screen.findByRole("heading", { name: "Policy fixture-policy-1" });
    expect(screen.getByRole("status", { name: "Policy State" })).toHaveTextContent("bound");
    expect(screen.getByRole("heading", { name: "Immutable event-driven history" })).toBeVisible();
    expect(
      within(screen.getByLabelText("Audit timeline")).getByText("policy quote created"),
    ).toBeVisible();
    expect(
      within(screen.getByLabelText("Audit timeline")).getByText("policy lifecycle changed"),
    ).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Finance event"), "premium_payment_settled");
    await user.clear(screen.getByLabelText("Amount in cents"));
    await user.type(screen.getByLabelText("Amount in cents"), "2500");
    await user.click(screen.getByRole("button", { name: "Record finance event" }));

    expect(await screen.findByText("premium payment")).toBeVisible();
    expect(screen.getByText("$25.00")).toBeVisible();
    expect(screen.getByText("$2.50")).toBeVisible();
    expect(screen.getByText("COM-002")).toBeVisible();
  });

  test("retries quote creation and binding with stable, independent command identities", async () => {
    const seed = ledgerSeed({ commands: [] });
    const api = useTestApi(seed);
    const requests = new Map<string, Record<string, unknown>[]>();
    server.use(
      http.post(/\/api\/quotes(?:\/[^/]+\/bind)?$/, async ({ request }) => {
        const path = new URL(request.url).pathname;
        const attempts = requests.get(path) ?? [];
        attempts.push((await request.clone().json()) as Record<string, unknown>);
        requests.set(path, attempts);
        const response = await api.handle(request);
        return attempts.length === 1 ? new HttpResponse(null, { status: 503 }) : response;
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<QuoteForm />);
    await screen.findByRole("option", { name: /100 Market Street/i });
    await user.selectOptions(screen.getByLabelText("Policyholder"), "fixture-customer-1");
    await user.selectOptions(screen.getByLabelText("Insured property"), "fixture-property-1");
    await user.click(screen.getByRole("button", { name: "Create quote" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Quote could not be created");
    await user.click(screen.getByRole("button", { name: "Create quote" }));
    await user.click(await screen.findByRole("button", { name: "Bind quote" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Quote could not be bound");
    await user.click(screen.getByRole("button", { name: "Retry bind quote" }));
    expect(await screen.findByRole("link", { name: "Review bound policy" })).toBeVisible();
    expect(requests.size).toBe(2);
    const commandIds = [];
    for (const attempts of requests.values()) {
      expect(attempts).toHaveLength(2);
      expect(attempts[1]).toEqual(attempts[0]);
      expect(attempts[0].commandId).not.toEqual(attempts[0].correlationId);
      commandIds.push(attempts[0].commandId);
    }
    expect(new Set(commandIds).size).toBe(2);
    const response = await api.handle(
      new Request("http://localhost/api/test/state", { headers: { "X-Tenant-Id": "test-tenant" } }),
    );
    const snapshot = await response.json();
    expect(snapshot.policy.quotes).toHaveLength(1);
    expect(snapshot.policy.policies).toHaveLength(1);
  });

  test("validates allocation rows and retries an accepted multi-allocation refund without duplicate entries", async () => {
    const seed = ledgerSeed();
    const api = useTestApi({
      ...seed,
      commands: [
        ...(seed.commands ?? []),
        {
          type: "deposit_recorded",
          schemaVersion: 1,
          tenantId: "test-tenant",
          policyId: "fixture-policy-1",
          commandId: "seed-deposit",
          correlationId: "seed-finance",
          amountCents: 2000,
        },
        {
          type: "premium_payment_settled",
          schemaVersion: 1,
          tenantId: "test-tenant",
          policyId: "fixture-policy-1",
          commandId: "seed-premium",
          correlationId: "seed-finance",
          amountCents: 4000,
        },
      ],
    });
    const attempts: Record<string, unknown>[] = [];
    server.use(
      http.post("/api/policies/fixture-policy-1/finance-events", async ({ request }) => {
        attempts.push((await request.clone().json()) as Record<string, unknown>);
        const response = await api.handle(request);
        return attempts.length === 1
          ? HttpResponse.json(
              { error: { code: "delivery_pending", message: "Retry delivery", recoverable: true } },
              { status: 409 },
            )
          : response;
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PolicyDetailPage policyId="fixture-policy-1" />);
    await screen.findByRole("heading", { name: "Policy fixture-policy-1" });
    await user.selectOptions(screen.getByLabelText("Finance event"), "refund_recorded");
    expect(screen.queryByLabelText("Amount in cents")).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Refund source 1"),
      screen.getByRole("option", { name: /Deposit.*2000/ }),
    );
    await user.type(screen.getByLabelText("Refund amount in cents 1"), "2500");
    expect(screen.getByRole("button", { name: "Record finance event" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("remaining");
    await user.clear(screen.getByLabelText("Refund amount in cents 1"));
    await user.type(screen.getByLabelText("Refund amount in cents 1"), "1000");
    await user.click(screen.getByRole("button", { name: "Add refund allocation" }));
    await user.selectOptions(
      screen.getByLabelText("Refund source 2"),
      within(screen.getByLabelText("Refund source 2")).getByRole("option", {
        name: /Deposit.*2000/,
      }),
    );
    await user.type(screen.getByLabelText("Refund amount in cents 2"), "1500");
    expect(screen.getByRole("button", { name: "Record finance event" })).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText("Refund source 2"),
      within(screen.getByLabelText("Refund source 2")).getByRole("option", {
        name: /Premium payment.*4000/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Add refund allocation" }));
    await user.click(screen.getByRole("button", { name: "Remove allocation 3" }));
    await user.click(screen.getByRole("button", { name: "Record finance event" }));
    await screen.findByText("Finance event could not be recorded.");
    await user.click(screen.getByRole("button", { name: "Record finance event" }));
    const commission = screen.getByRole("region", { name: "Commission history" });
    expect(await within(commission).findByText("-$1.50")).toBeVisible();
    expect(within(commission).getAllByText("refund adjustment")).toHaveLength(1);
    expect(
      within(screen.getByLabelText("Finance ledger entries")).getAllByText("refund", {
        exact: true,
      }),
    ).toHaveLength(2);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0].commandId).not.toEqual(attempts[0].correlationId);
    expect(attempts[0]).not.toHaveProperty("totalRefundedCents");
    expect(attempts[0].allocations).toEqual([
      { allocationId: expect.any(String), financeEntryId: expect.any(String), amountCents: 1000 },
      { allocationId: expect.any(String), financeEntryId: expect.any(String), amountCents: 1500 },
    ]);
  });

  test("retries an unchanged accepted refund after reconnect refreshes the remaining balance", async () => {
    const seed = ledgerSeed();
    const api = useTestApi({
      ...seed,
      commands: [
        ...(seed.commands ?? []),
        {
          type: "premium_payment_settled",
          schemaVersion: 1,
          tenantId: "test-tenant",
          policyId: "fixture-policy-1",
          commandId: "seed-premium",
          correlationId: "seed-finance",
          amountCents: 2000,
        },
      ],
    });
    const attempts: Record<string, unknown>[] = [];
    server.use(
      http.post("/api/policies/fixture-policy-1/finance-events", async ({ request }) => {
        attempts.push((await request.clone().json()) as Record<string, unknown>);
        const response = await api.handle(request);
        return attempts.length === 1 ? new HttpResponse(null, { status: 503 }) : response;
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PolicyDetailPage policyId="fixture-policy-1" />);
    await screen.findByRole("heading", { name: "Policy fixture-policy-1" });
    await user.selectOptions(screen.getByLabelText("Finance event"), "refund_recorded");
    await user.selectOptions(
      screen.getByLabelText("Refund source 1"),
      screen.getByRole("option", { name: "Premium payment — 2000 cents remaining" }),
    );
    await user.type(screen.getByLabelText("Refund amount in cents 1"), "1500");
    await user.click(screen.getByRole("button", { name: "Record finance event" }));
    await screen.findByText("Finance event could not be recorded.");

    act(() => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    await screen.findByRole("option", { name: "Premium payment — 500 cents remaining" });
    expect(screen.getByRole("button", { name: "Record finance event" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry finance event" })).toBeEnabled();

    // Edited input is a new submission and must still satisfy the updated balance.
    await user.clear(screen.getByLabelText("Refund amount in cents 1"));
    await user.type(screen.getByLabelText("Refund amount in cents 1"), "1600");
    expect(screen.getByRole("button", { name: "Retry finance event" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Record finance event" })).toBeDisabled();
    await user.clear(screen.getByLabelText("Refund amount in cents 1"));
    await user.type(screen.getByLabelText("Refund amount in cents 1"), "1500");
    await user.click(screen.getByRole("button", { name: "Retry finance event" }));

    await waitFor(() =>
      expect(screen.queryByText("Finance event could not be recorded.")).not.toBeInTheDocument(),
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(
      within(screen.getByLabelText("Finance ledger entries")).getAllByText("refund", {
        exact: true,
      }),
    ).toHaveLength(1);
    expect(
      within(screen.getByLabelText("Commission entries")).getAllByText("refund adjustment"),
    ).toHaveLength(1);
    expect(within(screen.getByLabelText("Commission entries")).getByText("-$1.50")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retry finance event" })).not.toBeInTheDocument();
  });

  test("shows an error panel when the customer contract fails", async () => {
    useTestApi();
    server.use(http.get("/api/customers", () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<CustomerListPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Customers unavailable");
  });

  test("shows an accessible error when customer creation is rejected", async () => {
    useTestApi();
    server.use(http.post("/api/customers", () => new HttpResponse(null, { status: 500 })));
    const user = userEvent.setup();
    renderWithProviders(<CustomerListPage />);

    await screen.findByLabelText("Customer name");
    await user.type(screen.getByLabelText("Customer name"), "Rejected Customer");
    await user.type(screen.getByLabelText("Customer email"), "rejected@example.test");
    await user.click(screen.getByRole("button", { name: "Add customer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Customer could not be created");
  });

  test("shows accessible quote and bind failures", async () => {
    useTestApi();
    const user = userEvent.setup();
    server.use(http.post("/api/quotes", () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<QuoteForm />);

    await screen.findByRole("option", { name: /100 Market Street/i });
    await user.selectOptions(screen.getByLabelText("Policyholder"), "fixture-customer-1");
    await user.selectOptions(screen.getByLabelText("Insured property"), "fixture-property-1");
    await user.click(screen.getByRole("button", { name: "Create quote" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Quote could not be created");
  });

  test("shows an accessible error when binding is rejected", async () => {
    useTestApi();
    const user = userEvent.setup();
    renderWithProviders(<QuoteForm />);

    await screen.findByRole("option", { name: /100 Market Street/i });
    await user.selectOptions(screen.getByLabelText("Policyholder"), "fixture-customer-1");
    await user.selectOptions(screen.getByLabelText("Insured property"), "fixture-property-1");
    await user.click(screen.getByRole("button", { name: "Create quote" }));
    await screen.findByRole("button", { name: "Bind quote" });
    server.use(
      http.post(/\/api\/quotes\/[^/]+\/bind$/, () => new HttpResponse(null, { status: 500 })),
    );
    await user.click(screen.getByRole("button", { name: "Bind quote" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Quote could not be bound");
  });

  test("releases a terminal bind retry so another quoted policy can bind", async () => {
    const api = useTestApi(ledgerSeed({ commands: [] }));
    const user = userEvent.setup();
    let rejectFirstBind = true;
    server.use(
      http.post(/\/api\/quotes\/[^/]+\/bind$/, ({ request }) => {
        if (rejectFirstBind) {
          rejectFirstBind = false;
          return new HttpResponse(null, { status: 409 });
        }
        return api.handle(request);
      }),
    );
    renderWithProviders(<QuoteForm />);

    await screen.findByRole("option", { name: /100 Market Street/i });
    await user.selectOptions(screen.getByLabelText("Policyholder"), "fixture-customer-1");
    await user.selectOptions(screen.getByLabelText("Insured property"), "fixture-property-1");
    await user.click(screen.getByRole("button", { name: "Create quote" }));
    await user.click(screen.getByRole("button", { name: "Create quote" }));

    const bindButtons = await screen.findAllByRole("button", { name: "Bind quote" });
    await user.click(bindButtons[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Quote could not be bound");
    expect(bindButtons[1]).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Dismiss bind retry" }));
    expect(screen.queryByRole("button", { name: "Retry bind quote" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Bind quote" })[1]).toBeEnabled();

    await user.click(screen.getAllByRole("button", { name: "Bind quote" })[1]);
    expect(await screen.findByRole("link", { name: "Review bound policy" })).toBeVisible();
  });

  test.each(["lost response", "pending delivery"])(
    "recovers accepted bind after quote refetch with %s",
    async (failure) => {
      setActiveTenantId("test-tenant");
      const api = createTestApi(ledgerSeed({ commands: [] }), {
        now: "2026-01-01T00:00:00.000Z",
        busFactory: () => {
          const bus = createInMemoryServiceBus();
          const subscribe = bus.subscribe.bind(bus);
          let fail = failure === "pending delivery";
          bus.subscribe = (consumerId, eventType, handler) =>
            subscribe(consumerId, eventType, (message) => {
              if (consumerId === "finance-policy-state" && fail) {
                fail = false;
                throw new Error("pending finance");
              }
              handler(message);
            });
          return bus;
        },
      });
      server.use(...createMswHandlers(api));
      const attempts: unknown[] = [];
      server.use(
        http.post(/\/api\/quotes\/[^/]+\/bind$/, async ({ request }) => {
          attempts.push(await request.clone().json());
          const response = await api.handle(request);
          return failure === "lost response" && attempts.length === 1
            ? new HttpResponse(null, { status: 503 })
            : response;
        }),
      );
      const user = userEvent.setup();
      renderWithProviders(<QuoteForm />);
      await screen.findByRole("option", { name: /100 Market Street/i });
      await user.selectOptions(screen.getByLabelText("Policyholder"), "fixture-customer-1");
      await user.selectOptions(screen.getByLabelText("Insured property"), "fixture-property-1");
      await user.click(screen.getByRole("button", { name: "Create quote" }));
      await user.click(await screen.findByRole("button", { name: "Bind quote" }));
      await screen.findByRole("alert");
      act(() => {
        onlineManager.setOnline(false);
        onlineManager.setOnline(true);
      });
      await within(screen.getByRole("list", { name: "Open quotes" })).findByText(
        "Written — payable when the policy binds",
      );
      await user.click(screen.getByRole("button", { name: "Retry bind quote" }));
      expect(await screen.findByRole("link", { name: "Review bound policy" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "Retry bind quote" })).not.toBeInTheDocument();
      expect(attempts).toHaveLength(2);
      expect(attempts[1]).toEqual(attempts[0]);
      const response = await api.handle(
        new Request("http://localhost/api/test/state", {
          headers: { "X-Tenant-Id": "test-tenant" },
        }),
      );
      const state = await response.json();
      expect(state.policy.policies).toHaveLength(1);
      expect(Object.values(state.policyState.timelines)).toEqual([
        expect.arrayContaining([expect.objectContaining({ revision: 1 })]),
      ]);
      expect(Object.values(state.policyState.timelines)[0]).toHaveLength(1);
      expect(state.finance.ledgers[0].commissionEntries).toHaveLength(1);
      expect(state.pendingMessages).toEqual([]);
      expect(state.messages.map((m: { event: { type: string } }) => m.event.type)).toEqual([
        "policy.quote.created",
        "policy.lifecycle.changed",
        "policy.state.changed",
      ]);
    },
  );
});
