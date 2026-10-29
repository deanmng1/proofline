import { test as base, expect, type Page } from "@playwright/test";
import type { TestSeed } from "@testbed/api-contracts";

import { createScenario, type ProoflineScenario, type ScenarioOptions } from "./scenario";
import { startWorkerScenarioServer, type WorkerScenarioServer } from "./scenario-server";

type CrmFixtures = {
  seed: TestSeed;
  scenarioOptions: Omit<Partial<ScenarioOptions>, "browser" | "workerServer">;
  scenario: ProoflineScenario;
  compatibilityScenario: ProoflineScenario;
  scenarioFactory: (
    options?: Omit<Partial<ScenarioOptions>, "browser" | "workerServer">,
  ) => ProoflineScenario;
  unauthenticatedPage: Page;
};
type CrmWorkerFixtures = { workerServer: WorkerScenarioServer };

export const test = base.extend<CrmFixtures, CrmWorkerFixtures>({
  workerServer: [
    async ({ browser }, use, workerInfo) => {
      const server = await startWorkerScenarioServer(browser, workerInfo.workerIndex);
      try {
        await use(server);
      } finally {
        await server.stop();
      }
    },
    { scope: "worker" },
  ],
  seed: [{}, { option: true }],
  scenarioOptions: [{}, { option: true }],
  compatibilityScenario: async ({ scenarioFactory, scenarioOptions, seed }, use) => {
    const tenants = [
      ...new Set(["test-tenant", "tn_northstar", "tn_aurora", ...(seed.tenants ?? [])]),
    ];
    await use(
      scenarioFactory({
        seed: { ...seed, tenants },
        tenants,
        identity: {
          id: "compatibility-owner",
          role: "Owner",
          tenantIds: tenants,
          name: "Avery Stone",
          email: "avery@northstar.app",
        },
        ...scenarioOptions,
        startAuthenticated: true,
      }),
    );
  },
  context: async ({ compatibilityScenario }, use) => {
    await use(await compatibilityScenario.createContext());
  },
  unauthenticatedPage: async ({ scenarioFactory }, use) => {
    await use(await scenarioFactory().newPage());
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
  scenarioFactory: async ({ browser, workerServer }, use) => {
    const created = new Set<ProoflineScenario>();
    const scenarioIds = new Set<string>();
    const runtimeIds = new Set<string>();
    let bodyError: unknown;
    try {
      await use((options = {}) => {
        const scenario = createScenario({
          browser,
          workerServer,
          permittedOrigins: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
          ...options,
        });
        if (scenarioIds.has(scenario.id) || runtimeIds.has(scenario.runtimeId)) {
          void scenario.reset();
          throw new Error(
            "Proofline scenario and runtime identities must be unique within a test.",
          );
        }
        scenarioIds.add(scenario.id);
        runtimeIds.add(scenario.runtimeId);
        created.add(scenario);
        return scenario;
      });
    } catch (error) {
      bodyError = error;
    }
    const cleanup = await Promise.allSettled(
      [...created].map(async (scenario) => {
        const errors: unknown[] = [];
        await scenario.assertNoUnexpectedRequests().catch((error) => errors.push(error));
        await scenario.reset().catch((error) => errors.push(error));
        if (errors.length)
          throw new AggregateError(errors, `Scenario ${scenario.id} egress or cleanup failed.`);
      }),
    );
    const cleanupErrors = cleanup
      .filter((result) => result.status === "rejected")
      .map((result) => (result as PromiseRejectedResult).reason);
    if (bodyError || cleanupErrors.length)
      throw new AggregateError(
        [...(bodyError ? [bodyError] : []), ...cleanupErrors],
        "Scenario factory or cleanup failed.",
      );
  },
  scenario: async ({ scenarioFactory, scenarioOptions, seed }, use) => {
    const scenario = scenarioFactory({ seed, ...scenarioOptions });
    let bodyError: unknown;
    try {
      await use(scenario);
    } catch (error) {
      bodyError = error;
    }
    let requestError: unknown;
    try {
      await scenario.assertNoUnexpectedRequests();
    } catch (error) {
      requestError = error;
    }
    let resetError: unknown;
    try {
      await scenario.reset();
    } catch (error) {
      resetError = error;
    }
    const errors = [bodyError, requestError, resetError].filter((error) => error !== undefined);
    if (errors.length)
      throw new AggregateError(errors, "Scenario body, egress, or cleanup failed.");
  },
});

export { expect };
