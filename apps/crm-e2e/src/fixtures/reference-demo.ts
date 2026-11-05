import { test as base, expect, type Page } from "@playwright/test";
// @ts-expect-error Reference-only Node launcher is measured by the app's unit coverage.
import { launchBuiltDemo } from "../../../crm-web/scripts/demo.mjs";

type Demo = {
  origin: string;
  url: string;
  assertDeniedEgress: (page: Page) => Promise<void>;
  assertReplayDenied: (page: Page) => Promise<void>;
};

export const test = base.extend<{ demo: Demo }>({
  demo: async ({ browser }, use) => {
    const launch = launchBuiltDemo();
    try {
      const running = await launch.ready;
      const outsider = await browser.newPage();
      try {
        expect((await outsider.goto(running.origin))?.status()).toBe(403);
        expect(
          (await outsider.goto(`${running.origin}/?__proofline_capability=wrong`))?.status(),
        ).toBe(403);
      } finally {
        await outsider.close();
      }
      await use({
        ...running,
        assertDeniedEgress: async (page) => {
          expect(
            await page.evaluate(async () => {
              const violation = new Promise<string>((resolve) => {
                window.addEventListener(
                  "securitypolicyviolation",
                  (event) => {
                    if (event.blockedURI === "https://proofline-egress.invalid/denied")
                      resolve(event.effectiveDirective);
                  },
                  { once: true },
                );
                window.setTimeout(() => resolve("missing CSP denial"), 1000);
              });
              await fetch("https://proofline-egress.invalid/denied").catch(() => undefined);
              return violation;
            }),
          ).toBe("connect-src");
        },
        assertReplayDenied: async (page) => {
          expect((await page.goto(running.url))?.status()).toBe(409);
        },
      });
    } finally {
      launch.stop();
      expect((await launch.completion).code).toBe(0);
    }
  },
  context: async ({ browser, demo }, use, testInfo) => {
    const context = await browser.newContext({
      serviceWorkers: "allow",
      recordVideo: { dir: testInfo.outputPath("video") },
    });
    const responses: { url: string; status: number; method: string }[] = [];
    const pageErrors: string[] = [];
    context.on("response", (response) => {
      responses.push({
        url: response.url(),
        status: response.status(),
        method: response.request().method(),
      });
    });
    context.on("page", (page) => page.on("pageerror", (error) => pageErrors.push(error.message)));
    try {
      await use(context);
      expect(
        (await context.cookies(demo.origin)).some(
          (cookie) =>
            cookie.name === "__proofline_session" &&
            cookie.httpOnly &&
            cookie.sameSite === "Strict",
        ),
      ).toBe(true);
      expect(context.serviceWorkers()).toHaveLength(1);
      expect(
        responses.some(
          (response) =>
            response.url.endsWith("/api/auth/login") &&
            response.method === "POST" &&
            response.status === 200,
        ),
      ).toBe(true);
      expect(
        responses.some(
          (response) => response.url.endsWith("/api/auth/logout") && response.status === 200,
        ),
      ).toBe(true);
      expect(responses.every((response) => new URL(response.url).origin === demo.origin)).toBe(
        true,
      );
      expect(pageErrors).toEqual([]);
    } finally {
      try {
        await testInfo.attach("demo-observed-responses", {
          body: JSON.stringify(responses, null, 2),
          contentType: "application/json",
        });
      } finally {
        await context.close();
      }
    }
  },
});

export { expect } from "@playwright/test";
