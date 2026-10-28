import { setupServer } from "msw/node";
import { describe, expect, test } from "vitest";

import type { TestSeed } from "./contracts";
import { createMswHandlers } from "./handlers";
import { createTestApi } from "./test-api";

const seed: TestSeed = {
  events: [
    {
      type: "quote_created",
      sourceEventId: "quote-created-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      quote: {
        id: "quote-1",
        customerId: "customer-1",
        propertyId: "property-1",
        product: "risk_secure_plus",
        premiumCents: 10_000,
        commissionPlan: {
          timing: "as_earned",
          rateBasisPoints: 1_000,
          holdPeriodDays: 30,
          reverseOnRefund: true,
        },
      },
    },
    {
      type: "quote_bound",
      sourceEventId: "quote-bound-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      quoteId: "quote-1",
      policyId: "policy-1",
    },
  ],
};

async function readJson<T>(response: Response): Promise<T> {
  expect(response.headers.get("content-type")).toContain("application/json");
  return response.json() as Promise<T>;
}

describe("createTestApi", () => {
  test("isolates state for API instances created from the same seed", async () => {
    const first = createTestApi(seed, { now: "2026-01-02T00:00:00.000Z" });
    const second = createTestApi(seed, { now: "2026-01-02T00:00:00.000Z" });

    const mutation = await first.handle(
      new Request("http://test.local/api/policies/policy-1/finance-events", {
        method: "POST",
        body: JSON.stringify({ type: "premium_payment_settled", amountCents: 2_500 }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(mutation.status).toBe(201);

    const firstState = await readJson<{ domain: { financeEntries: unknown[] } }>(
      await first.handle(new Request("http://test.local/api/test/state")),
    );
    const secondState = await readJson<{ domain: { financeEntries: unknown[] } }>(
      await second.handle(new Request("http://test.local/api/test/state")),
    );

    expect(firstState.domain.financeEntries).toHaveLength(1);
    expect(secondState.domain.financeEntries).toEqual([]);
  });

  test("returns a deliberate error for an unknown route", async () => {
    const api = createTestApi(seed);

    const response = await api.handle(new Request("http://test.local/api/not-a-route"));

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({
      error: {
        code: "route_not_found",
        message: "No Test API route matches GET /api/not-a-route.",
      },
    });
  });

  test("includes quote and bind audit events in a policy ledger", async () => {
    const api = createTestApi(seed);

    const ledger = await readJson<{ auditEntries: Array<{ type: string }> }>(
      await api.handle(new Request("http://test.local/api/policies/policy-1/ledger")),
    );

    expect(ledger.auditEntries.map((entry) => entry.type)).toEqual([
      "quote_created",
      "quote_bound",
    ]);
  });

  test("uses the identical contract through MSW handlers", async () => {
    const server = setupServer(...createMswHandlers(createTestApi(seed)));
    server.listen({ onUnhandledRequest: "error" });

    try {
      const response = await fetch("http://test.local/api/policies/policy-1/ledger");

      expect(response.status).toBe(200);
      await expect(readJson<{ policy: { id: string } }>(response)).resolves.toMatchObject({
        policy: { id: "policy-1" },
      });
    } finally {
      server.close();
    }
  });
});
