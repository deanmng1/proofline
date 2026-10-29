import { expect, test } from "../fixtures/test";
import { login, logout, navigateInsurance } from "../helpers";
import { createCustomerAndProperty, createQuoteAndBind, recordFinance } from "./workflow-steps";

test("completes_the_unauthenticated_deep_link_to_policy_finance_logout_journey", {
  tag: "@proofline-golden",
}, async ({ scenario }) => {
  const page = await scenario.newPage();
  await login(page, "/app/crm/customers");
  await expect(page.getByRole("heading", { name: "Customer and property intake" })).toBeVisible();
  await createCustomerAndProperty(page, {
    name: "Taylor Flagship",
    email: "taylor.flagship@example.test",
    address: "12 Cypress Way",
  });
  await navigateInsurance(page, "Customer intake");
  const policyPath = await createQuoteAndBind(page, {
    customer: "Taylor Flagship",
    address: "12 Cypress Way",
  });
  await expect(page.getByLabel("Commission entries")).toContainText("$12.50");
  await recordFinance(page, "1000");
  await logout(page);
  await page.goto(policyPath);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(/Policy /)).toHaveCount(0);

  const inspection = await scenario.inspect();
  expect(inspection.state.customers).toHaveLength(1);
  expect(inspection.state.properties).toHaveLength(1);
  expect(inspection.state.policy.quotes).toHaveLength(1);
  expect(inspection.state.policy.policies).toHaveLength(1);
  const policy = inspection.state.policy.policies[0];
  expect(inspection.state.policyState.timelines[policy.id]).toHaveLength(1);
  expect(inspection.state.finance.ledgers).toHaveLength(1);
  expect(inspection.state.finance.ledgers[0].financeEntries).toHaveLength(1);
  expect(inspection.state.finance.ledgers[0].commissionEntries).toHaveLength(1);
  expect(inspection.state.pendingMessages).toEqual([]);
});
