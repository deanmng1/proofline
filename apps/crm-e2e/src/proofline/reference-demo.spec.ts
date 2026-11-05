import { expect, test } from "../fixtures/reference-demo";
import { logout, navigateInsurance, openInitialPath, revisitProtectedPath } from "../helpers";
import { createCustomerAndProperty, createQuoteAndBind, recordFinance } from "./workflow-steps";

test.use({ trace: "on", video: "on" });

test(
  "walks_the_isolated_reference_demo_through_login_crm_and_logout",
  { tag: "@proofline-demo" },
  async ({ page, demo }, testInfo) => {
    await openInitialPath(page, demo.url);
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("button", { name: /continue as avery stone/i }).click();
    await expect(page).toHaveURL(/\/app\/crm\/customers$/);
    await createCustomerAndProperty(page, {
      name: "Demo Policyholder",
      email: "demo@example.test",
      address: "42 Demo Lane",
    });
    await navigateInsurance(page, "Quotes and policies");
    const protectedPath = await createQuoteAndBind(page, {
      customer: "Demo Policyholder",
      address: "42 Demo Lane",
    });
    await recordFinance(page);
    await page.screenshot({
      path: testInfo.outputPath("demo-protected-policy.png"),
      fullPage: true,
    });
    await demo.assertDeniedEgress(page);
    await logout(page);
    await revisitProtectedPath(page, `${demo.origin}${protectedPath}`);
    await expect(page).toHaveURL(/\/login$/);
    await demo.assertReplayDenied(page);
  },
);
