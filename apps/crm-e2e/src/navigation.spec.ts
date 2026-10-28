import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("navigates between module pages", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: /people/i }).click();
  await page.getByRole("link", { name: /users/i }).click();
  await expect(page).toHaveURL(/.*\/app\/users/);
  await expect(
    page.getByRole("heading", { name: /access control and roster visibility/i }),
  ).toBeVisible();
});

test("switches the active workspace", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: /switch workspace/i }).click();
  await page.getByRole("menuitemradio", { name: /aurora labs/i }).click();

  await page.getByRole("button", { name: /switch workspace/i }).click();
  await expect(page.getByRole("menuitemradio", { name: /aurora labs/i })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("switches the UI language from user settings", async ({ page }) => {
  await login(page);

  await page.goto("/app/settings/user");
  await page.getByRole("radio", { name: /español/i }).click();

  await expect(page.getByRole("link", { name: /visión general/i }).first()).toBeVisible();
});

test("selects a palette from user settings", async ({ page }) => {
  await login(page);

  await page.goto("/app/settings/user");
  await page.getByRole("radio", { name: /midnight ops/i }).click();
  await expect(page.getByRole("radio", { name: /midnight ops/i })).toBeChecked();
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "midnight-ops");
});
