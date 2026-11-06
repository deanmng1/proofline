import { startWorkerScenarioServer } from "./scenario-server";
import { expect, test } from "./test";

test("blocks_worker_startup_in_pages_and_nested_frames", { tag: "@egress" }, async ({
  scenario,
}) => {
  const page = await scenario.newPage();
  await page.goto("/login");
  const requests: string[] = [];
  page.context().on("request", (request) => {
    if (request.url().includes("proofline-worker-conformance")) requests.push(request.url());
  });
  // Parser-executed scripts exercise initialization before application startup in every realm.
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.name = "boundary-frame";
    frame.srcdoc = `<script>window.workerStartup = (() => { try { new Worker('/proofline-worker-conformance.js'); return 'started'; } catch (error) { return String(error); } })();</script><iframe name="boundary-nested" srcdoc="<script>try { new SharedWorker('/proofline-worker-conformance.js'); window.workerStartup = 'started'; } catch (error) { window.workerStartup = String(error); }</script>"></iframe>`;
    document.body.append(frame);
  });
  await expect.poll(() => page.frames().length).toBe(3);
  for (const frame of page.frames()) {
    const result = await frame.evaluate(() => {
      const attempts: string[] = [];
      for (const name of ["Worker", "SharedWorker"] as const) {
        const Constructor = globalThis[name];
        for (const candidate of [Constructor, Constructor.prototype.constructor]) {
          try {
            const worker = new candidate("/proofline-worker-conformance.js");
            worker.terminate?.();
            worker.port?.close();
            attempts.push("started");
          } catch (error) {
            attempts.push(String(error));
          }
        }
      }
      return attempts;
    });
    expect(result).toHaveLength(4);
    for (const denial of result) expect(denial).toContain("PROOFLINE_UNSUPPORTED_PLANE");
    if (frame !== page.mainFrame())
      expect(
        await frame.evaluate(() => (window as unknown as { workerStartup: string }).workerStartup),
      ).toContain("PROOFLINE_UNSUPPORTED_PLANE");
  }
  expect(requests).toEqual([]);
  await scenario.assertNoUnexpectedRequests();
});

test("bootstrap_blocks_workers_before_its_first_page", { tag: "@egress" }, async ({ browser }) => {
  let diagnostic = "not observed";
  const server = await startWorkerScenarioServer(browser, 998, {
    async createBootstrapContext() {
      const context = await browser.newContext({ serviceWorkers: "block" });
      const newPage = context.newPage.bind(context);
      context.newPage = async () => {
        const page = await newPage();
        diagnostic = await page.evaluate(() => {
          try {
            new Worker("data:text/javascript,");
            return "started";
          } catch (error) {
            return String(error);
          }
        });
        return page;
      };
      return context;
    },
  });
  try {
    expect(diagnostic).toContain("PROOFLINE_UNSUPPORTED_PLANE");
  } finally {
    await server.stop();
  }
});

test("preserves_page_fetch_and_websocket_fake_and_denial_routes", { tag: "@egress" }, async ({
  scenarioFactory,
}) => {
  const scenario = scenarioFactory({
    permittedOrigins: [
      "http://127.0.0.1:45731",
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ],
  });
  const page = await scenario.newPage();
  await page.goto("/login");
  const result = await page.evaluate(async () => {
    const allowedFetch = await fetch("http://127.0.0.1:45731/provider").then(
      (response) => response.status,
    );
    const deniedFetch = await fetch("http://127.0.0.1:45732/undeclared").then(
      () => "opened",
      () => "denied",
    );
    const socketClose = (url: string) =>
      new Promise<number>((resolve) => {
        const socket = new WebSocket(url);
        socket.onclose = (event) => resolve(event.code);
      });
    return {
      allowedFetch,
      deniedFetch,
      allowedSocket: await socketClose("ws://127.0.0.1:45731/provider"),
      deniedSocket: await socketClose("ws://127.0.0.1:45732/undeclared"),
    };
  });
  expect(result).toEqual({
    allowedFetch: 204,
    deniedFetch: "denied",
    allowedSocket: 1000,
    deniedSocket: 1008,
  });
  const inspection = await scenario.inspect();
  expect(
    inspection.providerRequests
      .map((request) => request.url)
      .filter((url) => url.startsWith("http://127.0.0.1:")),
  ).toEqual(["http://127.0.0.1:45731/provider"]);
  expect(inspection.unexpectedRequests.map((request) => request.plane)).toEqual([
    "page",
    "websocket",
  ]);
  await expect(() => scenario.assertNoUnexpectedRequests()).rejects.toThrow(
    /plane=page[\s\S]*plane=websocket/,
  );
});
