import type { Page } from "@playwright/test";

export async function login(page: Page): Promise<void> {
  await page.goto("/");
  const overview = page.getByRole("heading", { name: /dashboard overview/i });
  const continueButton = page.getByRole("button", { name: /continue as/i });
  await Promise.race([overview.waitFor(), continueButton.waitFor()]);
  if (await overview.isVisible()) return;
  await continueButton.click();
  await page.waitForURL("**/app/overview");
}
