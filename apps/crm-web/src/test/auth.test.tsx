import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { defaultSession, usersPayload } from "@/mocks/data";
import { server } from "@/test/server";
import { renderApp } from "@/test/test-app";

describe("auth & session", () => {
  it("retries a 401 with a refreshed token and resolves the request", async () => {
    window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));
    let userCalls = 0;
    let refreshCalls = 0;
    server.use(
      http.get("/api/users", () => {
        userCalls += 1;
        if (userCalls === 1) {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json(usersPayload);
      }),
      http.post("/api/auth/refresh", () => {
        refreshCalls += 1;
        return HttpResponse.json({ ...defaultSession, accessToken: "refreshed" });
      }),
    );

    renderApp({ initialEntries: ["/app/users"] });
    await screen.findByText(/access control and roster visibility/i, {}, { timeout: 3000 });

    await waitFor(() => expect(refreshCalls).toBe(1));
    expect(userCalls).toBe(2);
  });

  it("silently refreshes an expired session on load", async () => {
    let refreshCalls = 0;
    server.use(
      http.post("/api/auth/refresh", () => {
        refreshCalls += 1;
        return HttpResponse.json({ ...defaultSession, accessToken: "refreshed" });
      }),
    );

    const expired = { ...defaultSession, expiresAt: Date.now() - 1000 };
    window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(expired));

    renderApp({ initialEntries: ["/app/overview"] });
    await screen.findByText(/dashboard overview/i, {}, { timeout: 3000 });

    await waitFor(() => expect(refreshCalls).toBe(1));
  });
});
