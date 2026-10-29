import { expect, test } from "./test";

test("compatibility_document_fakes_fonts_and_denies_every_browser_egress_plane", {
  tag: "@egress",
}, async ({ page, compatibilityScenario }) => {
  let fontRequests = 0;
  await page.context().route("https://fonts.googleapis.com/**", async (route) => {
    fontRequests += 1;
    await route.fallback();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /dashboard overview/i })).toBeVisible();
  expect(fontRequests).toBeGreaterThan(0);

  const results = await page.evaluate(async () => {
    const deniedFetch = await fetch("https://compatibility.invalid/private?secret=value")
      .then(() => "opened")
      .catch(() => "denied");
    const worker = await new Promise<string>((resolve) => {
      const instance = new Worker(
        URL.createObjectURL(
          new Blob(
            [
              `fetch("https://compatibility-worker.invalid/private", {headers:{"X-Proofline-Plane":"worker"}}).then(() => postMessage("opened")).catch(() => postMessage("denied"))`,
            ],
            { type: "text/javascript" },
          ),
        ),
      );
      instance.onmessage = (event) => resolve(String(event.data));
    });
    const websocket = await new Promise<string>((resolve) => {
      const socket = new WebSocket("wss://compatibility-socket.invalid/private");
      socket.onopen = () => resolve("opened");
      socket.onerror = () => resolve("denied");
      socket.onclose = () => resolve("denied");
      setTimeout(() => resolve("denied"), 1000);
    });
    const serviceWorker = await navigator.serviceWorker
      .register("/mockServiceWorker.js")
      .then(() => "opened")
      .catch(() => "denied");
    return { deniedFetch, worker, websocket, serviceWorker };
  });
  expect(results).toEqual({
    deniedFetch: "denied",
    worker: "denied",
    websocket: "denied",
    serviceWorker: "denied",
  });
  expect((await compatibilityScenario.inspect()).serviceWorkers).toBe(0);
  await expect(() => compatibilityScenario.assertNoUnexpectedRequests()).rejects.toThrow(
    /plane=page[\s\S]*plane=worker[\s\S]*plane=websocket/,
  );
});
