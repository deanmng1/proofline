import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { TENANT_STORAGE_KEY } from "@/features/tenants/tenant-context";
import { defaultSession } from "@/mocks/data";
import { server } from "@/test/server";
import { renderApp } from "@/test/test-app";

describe("multi-tenancy", () => {
  it("authorizes the first membership request from a seeded session", async () => {
    window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));
    let authorization: string | null = null;
    server.use(
      http.get("/api/tenants", ({ request }) => {
        authorization = request.headers.get("Authorization");
        return HttpResponse.json([
          { id: "tenant-a", name: "Tenant A", slug: "tenant-a", plan: "scale", status: "active" },
        ]);
      }),
    );

    renderApp({ initialEntries: ["/app/overview"] });

    await waitFor(() => expect(authorization).toBe(`Bearer ${defaultSession.accessToken}`));
    expect(await screen.findByText(/dashboard overview/i)).toBeInTheDocument();
  });

  it("loads tenant memberships only after authenticated login", async () => {
    const user = userEvent.setup();
    let tenantRequests = 0;
    server.use(
      http.get("/api/tenants", () => {
        tenantRequests += 1;
        return HttpResponse.json([
          { id: "tenant-a", name: "Tenant A", slug: "tenant-a", plan: "scale", status: "active" },
        ]);
      }),
    );
    renderApp({ initialEntries: ["/login"] });
    await screen.findByRole("button", { name: /continue as/i });
    expect(tenantRequests).toBe(0);
    await user.click(screen.getByRole("button", { name: /continue as/i }));
    await waitFor(() => expect(tenantRequests).toBe(1));
    expect(await screen.findByText(/dashboard overview/i)).toBeInTheDocument();
  });

  it("switches the active workspace and persists the choice", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));
    window.localStorage.removeItem(TENANT_STORAGE_KEY);
    renderApp({ initialEntries: ["/app/overview"] });

    await screen.findByText(/dashboard overview/i, {}, { timeout: 3000 });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /switch workspace/i })).toBeEnabled(),
    );

    await user.click(screen.getByRole("button", { name: /switch workspace/i }));
    await user.click(await screen.findByRole("menuitemradio", { name: /aurora labs/i }));

    await waitFor(() => {
      expect(window.localStorage.getItem(TENANT_STORAGE_KEY)).toBe('"tn_aurora"');
    });
    expect(screen.getByRole("button", { name: /switch workspace/i })).toBeInTheDocument();
  });

  it("scopes API requests with the X-Tenant-Id header", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));
    window.localStorage.setItem(TENANT_STORAGE_KEY, '"tn_aurora"');

    let captured: string | null = null;
    server.use(
      http.get("/api/users", ({ request }) => {
        captured = request.headers.get("X-Tenant-Id");
        return HttpResponse.json([]);
      }),
    );

    renderApp({ initialEntries: ["/app/users"] });
    await screen.findByText(/access control and roster visibility/i, {}, { timeout: 3000 });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /switch workspace/i })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: /switch workspace/i }));
    await user.click(await screen.findByRole("menuitemradio", { name: /northstar/i }));

    await waitFor(() => expect(captured).toBe("tn_northstar"));
  });
});
