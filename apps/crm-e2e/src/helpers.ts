import { expect, type Page } from "@playwright/test";

export async function login(
  page: Page,
  initialPath = "/app/overview",
  email = "avery@northstar.app",
): Promise<void> {
  await page.goto(initialPath);
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("button", { name: /switch or remove account/i }).click();
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill("proofline-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(
    new RegExp(`${initialPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
  );
}

export async function navigateInsurance(
  page: Page,
  link: "Customer intake" | "Quotes and policies",
) {
  const targetPath = link === "Customer intake" ? "/app/crm/customers" : "/app/crm/quotes";
  if (new URL(page.url()).pathname === targetPath) return;
  const nav = page.getByRole("navigation", { name: "Navigation" });
  const target = nav.getByRole("link", { name: link });
  if (!(await target.isVisible()))
    await nav.getByRole("button", { name: "Insurance workflow" }).click();
  await target.click();
  await expect(page).toHaveURL(
    link === "Customer intake" ? /\/app\/crm\/customers$/ : /\/app\/crm\/quotes$/,
  );
}

export async function logout(page: Page, name = "Avery Stone") {
  await page.getByRole("button").filter({ hasText: name }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

export async function openUserSettings(page: Page, name = "Avery Stone") {
  await page.getByRole("button").filter({ hasText: name }).click();
  await page.getByRole("menuitem", { name: /user settings/i }).click();
  await expect(page).toHaveURL(/\/app\/settings\/user$/);
}
