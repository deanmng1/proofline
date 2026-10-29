import { expect, test } from "../fixtures/test";
import { login, logout, navigateInsurance, revisitProtectedPath } from "../helpers";

test("runs_the_cross_browser_invariant_smoke @proofline-smoke", async ({ scenario }) => {
  const page = await scenario.newPage();
  await login(page, "/app/crm/customers");
  await page.getByLabel("Customer name").fill("Cross Browser Customer");
  await page.getByLabel("Customer email").fill("cross.browser@example.test");
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByLabel("Customers").getByText("Cross Browser Customer")).toBeVisible();
  await navigateInsurance(page, "Quotes and policies");
  await logout(page);
  await revisitProtectedPath(page, "/app/crm/customers");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Customer and property intake" })).toHaveCount(0);
  expect((await scenario.inspect()).state.customers).toHaveLength(1);
});
