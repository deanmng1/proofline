import { customerFixture, propertyFixture } from "@testbed/test-kit";
import { expect, test } from "../fixtures/test";
import { login, revisitProtectedPath } from "../helpers";
import { bindWorkflowEvidence } from "./workflow-matrix";
import {
  createCustomerAndProperty,
  createQuote,
  createQuoteAndBind,
  recordFinance,
} from "./workflow-steps";

test("recovers_an_accepted_bind_without_duplicate_policy_or_ledger", {
  tag: "@proofline-recovery",
}, async ({ scenarioFactory }) => {
  const customer = customerFixture({ id: "recovery-customer", name: "Recovery Customer" });
  const property = propertyFixture({
    id: "recovery-property",
    customerId: customer.id,
    addressLine1: "77 Replay Road",
  });
  const scenario = scenarioFactory({
    seed: { tenants: ["test-tenant"], customers: [customer], properties: [property] },
  });
  const page = await scenario.newPage();
  await login(page, "/app/crm/quotes");
  await createQuote(page, { customer: customer.name, address: property.addressLine1 });
  scenario.faultOnce({ operation: "quote.bind", outcome: "response-lost" });
  await page.getByLabel("Open quotes").getByRole("button", { name: "Bind quote" }).click();
  await expect(page.getByRole("alert")).toContainText(
    /could not confirm whether the quote was bound/i,
  );
  await expect(page.getByRole("button", { name: "Bind quote", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry bind quote" }).click();
  const policyLink = page.getByRole("link", { name: "Review bound policy" });
  await expect(policyLink).toBeVisible();
  await policyLink.click();
  await expect(page.getByRole("status", { name: "Policy State" })).toHaveText(
    "Policy State: bound",
  );
  await expect(page.getByLabel("Commission entries")).toContainText("$12.50");

  const state = (await scenario.inspect()).state;
  expect(state.policy.policies).toHaveLength(1);
  const policy = state.policy.policies[0];
  expect(policy.quoteId).toBe(state.policy.quotes[0].id);
  expect(state.policyState.timelines[policy.id]).toHaveLength(1);
  expect(state.finance.ledgers).toHaveLength(1);
  expect(state.finance.ledgers[0].commissionEntries).toHaveLength(1);
  expect(state.pendingMessages).toEqual([]);
});

test("denies_cross_tenant_read_and_mutation_in_a_shared_runtime", {
  tag: "@proofline-authority",
}, async ({ scenarioFactory }) => {
  const identityA = {
    id: "tenant-a-owner",
    role: "Owner" as const,
    tenantIds: ["tenant-a"],
    name: "Alice A",
    email: "alice.a@example.test",
  };
  const identityB = {
    id: "tenant-b-owner",
    role: "Owner" as const,
    tenantIds: ["tenant-b"],
    name: "Bob B",
    email: "bob.b@example.test",
  };
  const scenario = scenarioFactory({ tenants: ["tenant-a", "tenant-b"], identity: identityA });
  const contextA = await scenario.createContext(identityA);
  const contextB = await scenario.createContext(identityB);
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await login(pageA, "/app/crm/customers", identityA.email);
  await login(pageB, "/app/crm/customers", identityB.email);

  await createCustomerAndProperty(pageA, {
    name: "Alice Tenant A",
    email: "customer.a@example.test",
    address: "1 Authority Ave",
  });
  const policyA = await createQuoteAndBind(pageA, {
    customer: "Alice Tenant A",
    address: "1 Authority Ave",
  });
  await recordFinance(pageA, "1100");
  await createCustomerAndProperty(pageB, {
    name: "Bob Tenant B",
    email: "customer.b@example.test",
    address: "2 Boundary Blvd",
  });
  const policyB = await createQuoteAndBind(pageB, {
    customer: "Bob Tenant B",
    address: "2 Boundary Blvd",
  });
  await recordFinance(pageB, "2200");
  await expect(pageA.getByText("Bob Tenant B")).toHaveCount(0);
  await expect(pageB.getByText("Alice Tenant A")).toHaveCount(0);

  const beforeA = (await scenario.inspect({ tenantId: "tenant-a" })).state;
  const beforeB = (await scenario.inspect({ tenantId: "tenant-b" })).state;
  const foreignPolicyB = beforeB.policy.policies[0].id;
  await revisitProtectedPath(pageA, policyB);
  await expect(pageA.getByText("Policy unavailable")).toBeVisible();
  await expect(pageA.getByText(foreignPolicyB)).toHaveCount(0);

  const attempts = [
    { method: "GET" as const, path: "/api/customers" },
    { method: "GET" as const, path: "/api/properties" },
    { method: "GET" as const, path: "/api/quotes" },
    { method: "GET" as const, path: "/api/policies" },
    { method: "GET" as const, path: `/api/policies/${foreignPolicyB}` },
    { method: "GET" as const, path: `/api/policies/${foreignPolicyB}/ledger` },
    { method: "GET" as const, path: "/api/test/state" },
    { method: "POST" as const, path: "/api/customers", body: {} },
    { method: "POST" as const, path: "/api/quotes", body: {} },
    { method: "POST" as const, path: `/api/quotes/${beforeB.policy.quotes[0].id}/bind`, body: {} },
    { method: "POST" as const, path: `/api/policies/${foreignPolicyB}/finance-events`, body: {} },
  ];
  for (const attempt of attempts)
    await expect(
      scenario.request(contextA, { ...attempt, tenantId: "tenant-b" }),
    ).resolves.toMatchObject({ status: 403, body: { error: { code: "cross_tenant" } } });
  await expect(
    scenario.request(contextA, { method: "GET", path: "/api/customers", tenantId: "tenant-a" }),
  ).resolves.toMatchObject({ status: 200 });
  expect((await scenario.inspect({ tenantId: "tenant-a" })).state).toEqual(beforeA);
  expect((await scenario.inspect({ tenantId: "tenant-b" })).state).toEqual(beforeB);
  expect(policyA).toContain("/app/crm/policies/");
});

test("denies_crm_navigation_and_direct_routes_for_viewer", { tag: "@proofline-authority" }, async ({
  scenarioFactory,
}) => {
  const viewer = {
    id: "proofline-viewer",
    role: "Viewer" as const,
    tenantIds: ["test-tenant"],
    name: "Vera Viewer",
    email: "vera.viewer@example.test",
  };
  const scenario = scenarioFactory({ identity: viewer });
  const page = await scenario.newPage();
  await login(page, "/app/overview", viewer.email);
  await expect(page.getByText("Insurance CRM")).toHaveCount(0);
  for (const path of ["/app/crm/customers", "/app/crm/quotes", "/app/crm/policies/guard-policy"]) {
    await revisitProtectedPath(page, path);
    await expect(page).toHaveURL(/\/app\/overview$/);
    await expect(
      page.getByText(/customer and property intake|quote and bind coverage|policy guard-policy/i),
    ).toHaveCount(0);
  }
  const crmOperations = (await scenario.inspect()).requestJournal.filter(
    (entry) => entry.operation !== "tenant.list",
  );
  expect(crmOperations).toEqual([]);
});

bindWorkflowEvidence({
  rowId: "recoverable-bind",
  file: "apps/crm-e2e/src/proofline/recovery-and-authority.spec.ts",
  title: "recovers_an_accepted_bind_without_duplicate_policy_or_ledger",
  line: 12,
  tag: "@proofline-recovery",
  ruleIds: ["UI-001", "POL-001", "API-002"],
});
bindWorkflowEvidence({
  rowId: "tenant-isolation",
  file: "apps/crm-e2e/src/proofline/recovery-and-authority.spec.ts",
  title: "denies_cross_tenant_read_and_mutation_in_a_shared_runtime",
  line: 52,
  tag: "@proofline-authority",
  ruleIds: ["TEN-001", "API-001"],
});
bindWorkflowEvidence({
  rowId: "role-denied-navigation",
  file: "apps/crm-e2e/src/proofline/recovery-and-authority.spec.ts",
  title: "denies_crm_navigation_and_direct_routes_for_viewer",
  line: 132,
  tag: "@proofline-authority",
  ruleIds: ["AUTH-001", "API-001"],
});
