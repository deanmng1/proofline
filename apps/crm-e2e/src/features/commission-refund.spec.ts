import { ledgerSeed } from "@testbed/test-kit";

import { expect, test } from "../fixtures/test";

const seededLedger = ledgerSeed();

test.describe("commission corrections", () => {
  test.use({
    seed: {
      ...seededLedger,
      commands: [
        ...(seededLedger.commands ?? []),
        {
          type: "deposit_recorded",
          schemaVersion: 1,
          tenantId: "test-tenant",
          commandId: "fixture-command-deposit",
          correlationId: "fixture-finance-workflow",
          policyId: "fixture-policy-1",
          amountCents: 2000,
        },
        {
          type: "premium_payment_settled",
          schemaVersion: 1,
          tenantId: "test-tenant",
          commandId: "fixture-command-premium-payment",
          correlationId: "fixture-finance-workflow",
          occurredAt: "2026-01-01T00:00:00.000Z",
          policyId: "fixture-policy-1",
          amountCents: 4_000,
        },
      ],
    },
  });

  test("@commission @finance @refund allocations reverse only selected settled premium commission", async ({
    page,
  }) => {
    await page.goto("/app/crm/policies/fixture-policy-1");
    await expect(page.getByRole("heading", { name: "Policy fixture-policy-1" })).toBeVisible();

    await page.getByLabel("Finance event").selectOption("refund_recorded");
    await page
      .getByLabel("Refund source 1")
      .selectOption({ label: "Deposit — 2000 cents remaining" });
    await page.getByLabel("Refund amount in cents 1").fill("1000");
    await page.getByRole("button", { name: "Record finance event" }).click();
    await expect(page.getByLabel("Finance ledger entries").getByText("-$10.00")).toBeVisible();
    await expect(page.getByLabel("Commission entries").getByText("refund adjustment")).toHaveCount(
      0,
    );

    await page
      .getByLabel("Refund source 1")
      .selectOption({ label: "Deposit — 1000 cents remaining" });
    await page.getByLabel("Refund amount in cents 1").fill("1000");
    await page.getByRole("button", { name: "Add refund allocation" }).click();
    await page
      .getByLabel("Refund source 2")
      .selectOption({ label: "Premium payment — 4000 cents remaining" });
    await page.getByLabel("Refund amount in cents 2").fill("1500");
    await page.getByRole("button", { name: "Record finance event" }).click();

    await expect(
      page.getByLabel("Finance ledger entries").getByText("refund", { exact: true }),
    ).toHaveCount(3);
    await expect(page.getByLabel("Finance ledger entries").getByText("-$15.00")).toBeVisible();
    await expect(
      page.getByLabel("Commission entries").getByText("refund adjustment"),
    ).toBeVisible();
    await expect(page.getByLabel("Commission entries").getByText("-$1.50")).toBeVisible();
    await expect(page.getByLabel("Commission entries").getByText("$4.00")).toBeVisible();
  });
});
