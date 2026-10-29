import { expect, type Page } from "@playwright/test";
import { navigateInsurance } from "../helpers";

export async function createCustomerAndProperty(
  page: Page,
  input: { name: string; email: string; address: string; city?: string },
) {
  await page.getByLabel("Customer name").fill(input.name);
  await page.getByLabel("Customer email").fill(input.email);
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByLabel("Customers").getByText(input.name)).toBeVisible();
  await page.getByLabel("Policyholder").selectOption({ label: input.name });
  await page.getByLabel("Street address").fill(input.address);
  await page.getByLabel("City").fill(input.city ?? "Austin");
  await page.getByLabel("State").fill("TX");
  await page.getByLabel("Postal code").fill("78701");
  await page.getByRole("button", { name: "Add property" }).click();
  await expect(page.getByLabel("Insured properties").getByText(input.address)).toBeVisible();
}

export async function createQuote(
  page: Page,
  input: { customer: string; address: string; product?: "risk_secure" | "risk_secure_plus" },
) {
  await navigateInsurance(page, "Quotes and policies");
  const policyholder = page.getByLabel("Policyholder");
  const property = page.getByLabel("Insured property");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await policyholder.selectOption({ label: input.customer });
    await expect(policyholder).not.toHaveValue("");
    await property.selectOption({ label: `${input.address}, Austin` });
    await expect(property).not.toHaveValue("");
    if ((await policyholder.inputValue()) !== "") break;
  }
  await expect(policyholder).not.toHaveValue("");
  await page.getByLabel("Product").selectOption(input.product ?? "risk_secure");
  await page.getByLabel("Premium in cents").fill("10000");
  await expect(page.getByRole("button", { name: "Create quote" })).toBeEnabled();
  await page.getByRole("button", { name: "Create quote" }).click();
  const quote = page.getByLabel("Open quotes").getByRole("listitem").last();
  await expect(quote).toContainText(
    input.product === "risk_secure_plus" ? "Risk Secure Plus" : "Risk Secure",
  );
  return quote;
}

export async function bindLatestQuote(page: Page) {
  const quote = page.getByLabel("Open quotes").getByRole("listitem").last();
  await quote.getByRole("button", { name: "Bind quote" }).click();
  const policyLink = page.getByRole("link", { name: "Review bound policy" });
  await expect(policyLink).toBeVisible();
  const href = await policyLink.getAttribute("href");
  if (!href) throw new Error("Bound policy link did not expose a route.");
  await policyLink.click();
  await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  await expect(page.getByRole("status", { name: "Policy State" })).toHaveText(
    "Policy State: bound",
  );
  await expect(page.getByRole("heading", { name: "Immutable event-driven history" })).toBeVisible();
  return href;
}

export async function createQuoteAndBind(
  page: Page,
  input: { customer: string; address: string; product?: "risk_secure" | "risk_secure_plus" },
) {
  await createQuote(page, input);
  return bindLatestQuote(page);
}

export async function recordFinance(page: Page, amountCents = "1000") {
  await page.getByLabel("Finance event").selectOption("deposit_recorded");
  await page.getByLabel("Amount in cents").fill(amountCents);
  await page.getByRole("button", { name: "Record finance event" }).click();
  await expect(page.getByLabel("Finance ledger entries").getByText("deposit")).toBeVisible();
}
