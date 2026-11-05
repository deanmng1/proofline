import { randomBytes, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import path from "node:path";
import { test as base, expect } from "@playwright/test";
import { createOrders } from "../../client/orders.mjs";
import { blockUnsupportedBrowserWorkers } from "../../tools/proofline/browser-runtime-boundary.mjs";
import { startTestAppServer } from "../../tools/proofline/serve-test-app.mjs";
import { installApi } from "./api.mjs";

export const test = base.extend({
  workerServer: [
    async ({ browser }, use) => {
      const capability = randomBytes(32).toString("base64url");
      const server = await startTestAppServer({
        directory: path.resolve("dist/work-orders-test"),
        capability,
      });
      let bootstrap;
      try {
        bootstrap = await browser.newContext({ serviceWorkers: "block" });
        await bootstrap.addInitScript(blockUnsupportedBrowserWorkers);
        await bootstrap.route("**/*", (route) =>
          new URL(route.request().url()).origin === server.origin
            ? route.continue()
            : route.abort("blockedbyclient"),
        );
        await bootstrap.routeWebSocket(/.*/, (socket) =>
          socket.close({ code: 1008, reason: "Bootstrap websocket denied" }),
        );
        const page = await bootstrap.newPage();
        await page.goto(`${server.origin}/?__proofline_capability=${capability}`);
        const cookies = await bootstrap.cookies();
        await bootstrap.close();
        bootstrap = null;
        await use({ origin: server.origin, cookies });
      } finally {
        if (bootstrap) await bootstrap.close();
        await server.close();
      }
    },
    { scope: "worker" },
  ],
  scenario: async ({ browser, workerServer }, use, testInfo) => {
    const runtime = createOrders();
    const contexts = [];
    const unexpected = [];
    const expectedDenials = [];
    const metrics = { mutations: 0 };
    const id = randomUUID();
    const scenario = {
      id,
      origin: workerServer.origin,
      snapshot: () => runtime.snapshot(),
      mutations: () => metrics.mutations,
      acknowledgeDenials() {
        const denied = unexpected.splice(0);
        expectedDenials.push(...denied);
        return denied;
      },
      async createContext() {
        const context = await browser.newContext({
          serviceWorkers: "block",
          recordVideo: { dir: testInfo.outputPath("videos") },
        });
        contexts.push(context);
        await context.addInitScript(blockUnsupportedBrowserWorkers);
        await context.addCookies(workerServer.cookies);
        await context.route("**/*", (route) => {
          const request = route.request();
          if (new URL(request.url()).origin === workerServer.origin) return route.continue();
          unexpected.push({
            scenario: id,
            method: request.method(),
            url: request.url(),
            trace: testInfo.outputDir,
          });
          return route.abort("blockedbyclient");
        });
        if (typeof context.routeWebSocket !== "function")
          throw new Error("Unsupported fail-closed browser WebSocket plane");
        await context.routeWebSocket(/.*/, (socket) => {
          unexpected.push({
            scenario: id,
            method: "WEBSOCKET",
            url: socket.url(),
            trace: testInfo.outputDir,
          });
          socket.close({ code: 1008, reason: "Undeclared websocket" });
        });
        await installApi(context, runtime, metrics);
        const page = await context.newPage();
        return { context, page };
      },
      async reset() {
        const errors = [];
        for (const context of contexts) {
          try {
            const videos = context
              .pages()
              .map((page) => page.video())
              .filter(Boolean);
            await context.close();
            for (const video of videos) {
              const file = await video.path();
              if (testInfo.status !== testInfo.expectedStatus)
                await testInfo.attach("scenario-video", { path: file, contentType: "video/webm" });
              else rmSync(file, { force: true });
            }
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length) throw new AggregateError(errors, "Scenario cleanup failed");
      },
      assertNoUnexpectedRequests() {
        if (unexpected.length)
          throw new Error(`Unexpected requests: ${JSON.stringify(unexpected)}`);
      },
    };
    try {
      await use(scenario);
    } finally {
      try {
        await scenario.reset();
      } finally {
        await testInfo.attach("network-and-route-diagnostics", {
          body: JSON.stringify({
            scenario: id,
            origin: workerServer.origin,
            unexpected,
            expectedDenials,
            metrics,
          }),
          contentType: "application/json",
        });
        scenario.assertNoUnexpectedRequests();
      }
    }
  },
});
export { expect };
