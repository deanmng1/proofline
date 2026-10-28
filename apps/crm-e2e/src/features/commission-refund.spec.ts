import { ledgerSeed } from "@testbed/test-kit";

import { expect, test } from "../fixtures/test";

const seededLedger = ledgerSeed();

test.describe("commission corrections", () => {
  test.use({
    seed: {
      ...seededLedger,
      events: [
        ...seededLedger.events,
        {
          type: "premium_payment_settled",
          sourceEventId: "fixture-event-premium-payment",
          occurredAt: "2026-01-01T00:00:00.000Z",
          policyId: "fixture-policy-1",
          amountCents: 4_000,
        },
      ],
    },
  });

  test("@commission records a compensating negative refund entry", async ({ page }) => {
    await page.goto("/app/crm/policies/fixture-policy-1");
    await expect(page.getByRole("heading", { name: "Policy fixture-policy-1" })).toBeVisible();

    await page.getByLabel("Finance event").selectOption("refund_recorded");
    await page.getByLabel("Amount in cents").fill("4000");
    await page.getByRole("button", { name: "Record finance event" }).click();

    await expect(
      page.getByLabel("Finance ledger entries").getByText("refund", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Finance ledger entries").getByText("-$40.00")).toBeVisible();
    await expect(
      page.getByLabel("Commission entries").getByText("refund adjustment"),
    ).toBeVisible();
    await expect(page.getByLabel("Commission entries").getByText("-$4.00")).toBeVisible();
  });
});
