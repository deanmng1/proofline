import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("signs in through the mock auth flow", async ({ page }) => {
  await login(page);

  await expect(page.getByRole("heading", { name: /dashboard overview/i })).toBeVisible();
});

test("signs in through the password form", async ({ page }) => {
  await page.goto("/login");

  await page.getByRole("button", { name: /switch or remove account/i }).click();
  await page.getByLabel(/email/i).fill("avery@northstar.app");
  await page.getByLabel(/password/i).fill("supersecret");
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await expect(page.getByRole("heading", { name: /dashboard overview/i })).toBeVisible();
});
