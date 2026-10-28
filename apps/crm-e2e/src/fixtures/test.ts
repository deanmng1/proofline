import { test as base, expect } from "@playwright/test";
import type { TestApi, TestSeed } from "@testbed/api-contracts";
import { createTestApi } from "@testbed/api-contracts";

import { prepareTestApiPage } from "./install-test-api";

type CrmFixtures = {
  seed: TestSeed;
  testApi: TestApi;
};

export const test = base.extend<CrmFixtures>({
  seed: [{}, { option: true }],
  testApi: async ({ seed }, use) => {
    await use(createTestApi(seed, { now: "2026-01-01T00:00:00.000Z" }));
  },
  page: async ({ page, testApi }, use) => {
    const removeRoute = await prepareTestApiPage(page, testApi);
    try {
      await use(page);
    } finally {
      await removeRoute();
      await page.context().clearCookies();
    }
  },
});

export { expect };
