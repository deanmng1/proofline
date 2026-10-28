import { expect, test } from "@playwright/test";

test("@crm-worker starts the CRM with browser Test API handlers", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "admin-dashboard-template:session",
      JSON.stringify({
        user: {
          id: "browser-owner",
          name: "Browser Owner",
          email: "browser.owner@example.test",
          role: "Owner",
          organization: "Testbed",
        },
        isAuthenticated: true,
        accessToken: "browser-access-token",
        refreshToken: "browser-refresh-token",
        expiresAt: 4_102_444_800_000,
      }),
    );
  });

  await page.goto("/app/crm/customers");
  await expect(page.getByRole("heading", { name: "Customer and property intake" })).toBeVisible();
  await page.getByLabel("Customer name").fill("Browser CRM Customer");
  await page.getByLabel("Customer email").fill("browser.crm@example.test");
  await page.getByRole("button", { name: "Add customer" }).click();

  await expect(page.getByLabel("Customers").getByText("Browser CRM Customer")).toBeVisible();
});
