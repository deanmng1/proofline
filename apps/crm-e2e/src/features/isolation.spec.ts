import type { Page } from "@playwright/test";
import type { ProoflineScenario } from "../fixtures/scenario";
import { expect, test } from "../fixtures/test";

async function guardedAuthenticatedPage(
  scenario: ProoflineScenario,
  observeFont: () => void,
): Promise<Page> {
  const context = await scenario.createContext();
  await context.route("https://fonts.googleapis.com/**", async (route) => {
    observeFont();
    await route.fallback();
  });
  const page = await context.newPage();
  await page.goto("/login");
  await page.evaluate(async () => {
    const response = await fetch("/api/auth/login", { method: "POST", body: "{}" });
    if (!response.ok) throw new Error("Isolation scenario login failed.");
    localStorage.setItem("admin-dashboard-template:session", JSON.stringify(await response.json()));
  });
  return page;
}

async function addCustomer(page: Page, name: string) {
  await page.goto("/app/crm/customers");
  await page.getByLabel("Customer name").fill(name);
  await page
    .getByLabel("Customer email")
    .fill(`${name.toLowerCase().replaceAll(" ", ".")}@example.test`);
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByLabel("Customers").getByText(name)).toBeVisible();
}

test("@policy isolates concurrent guarded browser journeys", async ({ scenarioFactory }) => {
  const scenarioA = scenarioFactory({ idPrefix: "alpha" });
  const scenarioB = scenarioFactory({ idPrefix: "bravo" });
  let fontRequestsA = 0;
  let fontRequestsB = 0;
  const [pageA, pageB] = await Promise.all([
    guardedAuthenticatedPage(scenarioA, () => {
      fontRequestsA += 1;
    }),
    guardedAuthenticatedPage(scenarioB, () => {
      fontRequestsB += 1;
    }),
  ]);

  expect(fontRequestsA).toBeGreaterThan(0);
  expect(fontRequestsB).toBeGreaterThan(0);
  for (const page of [pageA, pageB]) {
    expect(
      await page.evaluate(() =>
        navigator.serviceWorker
          .register("/mockServiceWorker.js")
          .then(() => "registered")
          .catch(() => "denied"),
      ),
    ).toBe("denied");
    expect(
      await page.evaluate(() =>
        fetch("https://isolation-bypass.invalid/private")
          .then(() => "opened")
          .catch(() => "denied"),
      ),
    ).toBe("denied");
  }
  await expect(() => scenarioA.assertNoUnexpectedRequests()).rejects.toThrow(
    /isolation-bypass\.invalid/,
  );
  await expect(() => scenarioB.assertNoUnexpectedRequests()).rejects.toThrow(
    /isolation-bypass\.invalid/,
  );
  expect((await scenarioA.inspect()).serviceWorkers).toBe(0);
  expect((await scenarioB.inspect()).serviceWorkers).toBe(0);

  await Promise.all([addCustomer(pageA, "Alpha Agent"), addCustomer(pageB, "Bravo Agent")]);

  await expect(pageA.getByLabel("Customers").getByText("Alpha Agent")).toBeVisible();
  await expect(pageA.getByText("Bravo Agent")).toHaveCount(0);
  await expect(pageB.getByLabel("Customers").getByText("Bravo Agent")).toBeVisible();
  await expect(pageB.getByText("Alpha Agent")).toHaveCount(0);
});
