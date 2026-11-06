import { act, renderHook, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "@/features/auth/auth-context";
import { getUsersRequest } from "@/features/users/users-api";
import { defaultSession, usersPayload } from "@/mocks/data";
import { server } from "@/test/server";
import { renderApp } from "@/test/test-app";

describe("auth & session", () => {
  it("retries a 401 with a refreshed token and resolves the request", async () => {
    window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));
    let userCalls = 0;
    let refreshCalls = 0;
    const userAuthorizations: (string | null)[] = [];
    let refreshAuthorization: string | null = null;
    const refreshedSession = { ...defaultSession, accessToken: "refreshed" };
    server.use(
      http.get("/api/users", ({ request }) => {
        userCalls += 1;
        userAuthorizations.push(request.headers.get("Authorization"));
        if (userCalls === 1) {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json(usersPayload);
      }),
      http.post("/api/auth/refresh", ({ request }) => {
        refreshCalls += 1;
        refreshAuthorization = request.headers.get("Authorization");
        return HttpResponse.json(refreshedSession);
      }),
    );

    // Count one logical HTTP request independently of page remounts after token refresh.
    const { result, unmount } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      ),
    });
    try {
      await act(async () => {
        expect(await getUsersRequest()).toEqual(usersPayload);
      });
      expect(refreshCalls).toBe(1);
      expect(userCalls).toBe(2);
      expect(userAuthorizations).toEqual([
        `Bearer ${defaultSession.accessToken}`,
        "Bearer refreshed",
      ]);
      expect(refreshAuthorization).toBe(`Bearer ${defaultSession.accessToken}`);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.session).toEqual(refreshedSession);
      expect(
        JSON.parse(window.localStorage.getItem("admin-dashboard-template:session") ?? "null"),
      ).toEqual(refreshedSession);
    } finally {
      unmount();
    }
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
