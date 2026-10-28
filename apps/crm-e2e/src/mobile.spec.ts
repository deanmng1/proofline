import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("mobile continuity", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("navigates through the grouped mobile nav", async ({ page }) => {
    await login(page);

    await page.getByRole("button", { name: /open navigation/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    for (const group of ["Dashboard", "Apps", "Pages", "Settings"]) {
      await expect(dialog.getByRole("paragraph").filter({ hasText: group })).toBeVisible();
    }

    await dialog.getByRole("button", { name: /people/i }).click();
    await dialog.getByRole("link", { name: "Users" }).click();
    await page.waitForURL("**/app/users");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/access control/i);
  });

  test("renders roster cards and opens invite dialog", async ({ page }) => {
    await login(page);
    await page.goto("/app/users");

    await expect(page.getByRole("searchbox", { name: /search users/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /invite user/i })).toBeVisible();

    await page.getByRole("button", { name: /^invite user$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /invite a user/i })).toBeVisible();
    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(dialog).toBeHidden();
  });

  test("command palette is reachable from the compact search button", async ({ page }) => {
    await login(page);
    await page
      .getByRole("button", { name: /search data/i })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("switches the workspace from the mobile navigation dialog", async ({ page }) => {
    await login(page);

    await page.getByRole("button", { name: /open navigation/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: /switch workspace/i }).click();
    await page.getByRole("menuitemradio", { name: /aurora labs/i }).click();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: /open navigation/i }).click();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: /switch workspace/i }),
    ).toHaveAccessibleName(/aurora labs/i);
  });
});
