import { expect, test } from "../fixtures/test";

test("@quote @policy @finance creates, binds, and funds a Risk Secure Plus policy", async ({
  page,
}) => {
  await page.goto("/app/crm/customers");
  await expect(page.getByRole("heading", { name: "Customer and property intake" })).toBeVisible();

  await page.getByLabel("Customer name").fill("Taylor Agent");
  await page.getByLabel("Customer email").fill("taylor.agent@example.test");
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByLabel("Customers").getByText("Taylor Agent")).toBeVisible();

  await page.getByLabel("Policyholder").selectOption({ label: "Taylor Agent" });
  await page.getByLabel("Street address").fill("12 Cypress Way");
  await page.getByLabel("City").fill("Austin");
  await page.getByLabel("State").fill("TX");
  await page.getByLabel("Postal code").fill("78701");
  await page.getByRole("button", { name: "Add property" }).click();
  await expect(page.getByLabel("Insured properties").getByText("12 Cypress Way")).toBeVisible();

  await page.goto("/app/crm/quotes");
  await page.getByLabel("Policyholder").selectOption({ label: "Taylor Agent" });
  await page.getByLabel("Insured property").selectOption({ label: "12 Cypress Way, Austin" });
  await page.getByLabel("Product").selectOption("risk_secure_plus");
  await page.getByLabel("Premium in cents").fill("10000");
  await page.getByRole("button", { name: "Create quote" }).click();
  await expect(page.getByText("Cash-first: 10% as premium is paid").last()).toBeVisible();

  await page.getByRole("button", { name: "Bind quote" }).click();
  const bindStatus = page
    .getByRole("status")
    .filter({ hasText: "As earned — payable after 30 days" });
  await expect(bindStatus).toContainText("As earned — payable after 30 days");
  await expect(bindStatus).toContainText("COM-002");
  await page.getByRole("link", { name: "Review bound policy" }).click();

  await expect(page.getByRole("heading", { name: /Policy test-policy/i })).toBeVisible();
  await expect(page.getByRole("status", { name: "Policy State" })).toHaveText(
    "Policy State: bound",
  );
  await expect(page.getByRole("heading", { name: "Immutable event-driven history" })).toBeVisible();
  await page.getByLabel("Finance event").selectOption("premium_payment_settled");
  await page.getByLabel("Amount in cents").fill("10000");
  await page.getByRole("button", { name: "Record finance event" }).click();

  await expect(
    page.getByLabel("Finance ledger entries").getByText("premium payment"),
  ).toBeVisible();
  await expect(page.getByLabel("Finance ledger entries").getByText("$100.00")).toBeVisible();
  await expect(page.getByLabel("Commission entries").getByText("$10.00")).toBeVisible();
  await expect(page.getByLabel("Commission entries").getByText("earned")).toBeVisible();
});
