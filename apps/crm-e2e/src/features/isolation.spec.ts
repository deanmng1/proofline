import { createTestApi } from "@testbed/api-contracts";
import { prepareTestApiPage } from "../fixtures/install-test-api";
import { expect, test } from "../fixtures/test";

async function addCustomer(page: Parameters<typeof prepareTestApiPage>[0], name: string) {
  await page.goto("/app/crm/customers");
  await page.getByLabel("Customer name").fill(name);
  await page
    .getByLabel("Customer email")
    .fill(`${name.toLowerCase().replaceAll(" ", ".")}@example.test`);
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByLabel("Customers").getByText(name)).toBeVisible();
}

test("@policy isolates concurrent browser journeys", async ({ browser }) => {
  const [contextA, contextB] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [pageA, pageB] = await Promise.all([contextA.newPage(), contextB.newPage()]);
  const removeRouteA = await prepareTestApiPage(pageA, createTestApi({}, { idPrefix: "alpha" }));
  const removeRouteB = await prepareTestApiPage(pageB, createTestApi({}, { idPrefix: "bravo" }));

  try {
    await Promise.all([addCustomer(pageA, "Alpha Agent"), addCustomer(pageB, "Bravo Agent")]);

    await expect(pageA.getByLabel("Customers").getByText("Alpha Agent")).toBeVisible();
    await expect(pageA.getByText("Bravo Agent")).toHaveCount(0);
    await expect(pageB.getByLabel("Customers").getByText("Bravo Agent")).toBeVisible();
    await expect(pageB.getByText("Alpha Agent")).toHaveCount(0);
  } finally {
    await Promise.all([removeRouteA(), removeRouteB()]);
    await Promise.all([contextA.close(), contextB.close()]);
  }
});
