import { expect, test } from "../fixtures/test";

test("@crm-worker starts the CRM with browser Test API handlers", async ({ page }) => {
  await page.goto("/app/crm/customers");
  await expect(page.getByRole("heading", { name: "Customer and property intake" })).toBeVisible();
  await page.getByLabel("Customer name").fill("Browser CRM Customer");
  await page.getByLabel("Customer email").fill("browser.crm@example.test");
  await page.getByRole("button", { name: "Add customer" }).click();

  await expect(page.getByLabel("Customers").getByText("Browser CRM Customer")).toBeVisible();
});
