import type { RequestHandler } from "msw";
import { HttpResponse, http } from "msw";

import type { TestApi } from "./contracts";

async function toMswResponse(response: Response): Promise<HttpResponse<string>> {
  return new HttpResponse(await response.text(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Use a fresh handler set for each test API. Tests may prepend explicit one-off
 * overrides with `server.use(...)`; the test harness resets those after each test.
 */
export function createMswHandlers(api: TestApi): RequestHandler[] {
  return [http.all(/\/api\/.*/, async ({ request }) => toMswResponse(await api.handle(request)))];
}
