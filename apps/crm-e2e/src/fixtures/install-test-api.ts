import type { Page, Route } from "@playwright/test";
import type { TestApi } from "@testbed/api-contracts";

const session = {
  user: {
    id: "e2e-owner",
    name: "E2E Owner",
    email: "e2e.owner@example.test",
    role: "Owner",
    organization: "Testbed",
  },
  isAuthenticated: true,
  accessToken: "e2e-access-token",
  refreshToken: "e2e-refresh-token",
  expiresAt: 4_102_444_800_000,
};

async function fulfillTestApiRequest(route: Route, testApi: TestApi): Promise<void> {
  const request = route.request();
  const url = new URL(request.url());
  if (
    !/^\/api\/(?:customers|properties|quotes|policies|tenants|test\/state)(?:\/|$)/.test(
      url.pathname,
    )
  ) {
    await route.continue();
    return;
  }

  const method = request.method();
  const response = await testApi.handle(
    new Request(request.url(), {
      method,
      headers: request.headers(),
      body: method === "GET" || method === "HEAD" ? undefined : (request.postData() ?? undefined),
    }),
  );
  let body = await response.text();
  if (response.ok && url.pathname === "/api/tenants") {
    const names: Record<string, string> = {
      tn_northstar: "Northstar",
      tn_aurora: "Aurora Labs",
    };
    body = JSON.stringify(
      (JSON.parse(body) as Array<Record<string, unknown>>).map((tenant) => ({
        ...tenant,
        name: names[String(tenant.id)] ?? tenant.name,
      })),
    );
  }
  if (response.status === 404) {
    let code: string | undefined;
    try {
      code = (JSON.parse(body) as { error?: { code?: string } }).error?.code;
    } catch {
      code = undefined;
    }
    if (code === "route_not_found") {
      await route.abort("failed");
      throw new Error(`Unexpected Test API request: ${method} ${url.pathname}`);
    }
  }
  await route.fulfill({
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers),
    body,
  });
}

/** Prepares a page to use Playwright routing instead of the browser MSW worker. */
export async function prepareTestApiPage(
  page: Page,
  testApi: TestApi,
): Promise<() => Promise<void>> {
  await page.addInitScript((authenticatedSession) => {
    crypto.randomUUID = () => {
      const sequence = Number(window.sessionStorage.getItem("test-command-sequence") ?? "0") + 1;
      window.sessionStorage.setItem("test-command-sequence", String(sequence));
      return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
    };
    (window as Window & { __CRM_TEST_API__?: boolean }).__CRM_TEST_API__ = true;
    window.localStorage.setItem(
      "admin-dashboard-template:session",
      JSON.stringify(authenticatedSession),
    );
  }, session);

  const handler = (route: Route) => fulfillTestApiRequest(route, testApi);
  await page.route("**/api/**", handler);

  return async () => {
    await page.unroute("**/api/**", handler);
    await page
      .evaluate(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
      })
      .catch(() => undefined);
  };
}
