import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type delay, HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { defaultSession, tenantsPayload } from "@/mocks/data";
import { createHandlers, handlers } from "@/mocks/handlers";
import { server } from "@/test/server";
import { renderApp } from "@/test/test-app";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const membershipUrl = "http://localhost:3000/api/tenants";
const authorization = `Bearer ${defaultSession.accessToken}`;
const sessionKey = "admin-dashboard-template:session";

const recordRequests = () => {
  const requests: Request[] = [];
  const record = ({ request }: { request: Request }) => requests.push(request);
  server.events.on("request:start", record);
  return {
    requests,
    stop: () => server.events.removeListener("request:start", record),
  };
};

const heldJsonResponse = (payload: typeof tenantsPayload | typeof defaultSession) => {
  const started = deferred<Request>();
  const release = deferred<void>();
  const delivered = deferred<void>();
  let pendingRequest: Request | undefined;
  const recordResponse = ({ request }: { request: Request }) => {
    if (request.url === pendingRequest?.url && request.method === pendingRequest.method) {
      delivered.resolve();
    }
  };
  server.events.on("response:mocked", recordResponse);
  return {
    started: started.promise,
    release: () => release.resolve(),
    resolver: async ({ request }: { request: Request }) => {
      pendingRequest = request;
      started.resolve(request);
      await release.promise;
      return HttpResponse.json(payload);
    },
    finish: async () => {
      release.resolve();
      try {
        if (pendingRequest) await delivered.promise;
      } finally {
        server.events.removeListener("response:mocked", recordResponse);
      }
    },
  };
};

const protectedRequests = (requests: Request[]) =>
  requests.filter((request) => {
    const path = new URL(request.url).pathname;
    return path.startsWith("/api/") && !/^\/api\/(auth|tenants)(\/|$)/.test(path);
  });

const expectProtectedHeaders = (requests: Request[]) => {
  const protectedCalls = protectedRequests(requests);
  expect(protectedCalls.some((request) => request.url.endsWith("/api/dashboard/overview"))).toBe(
    true,
  );
  for (const request of protectedCalls) {
    expect(request.headers.get("Authorization")).toBe(authorization);
    expect(request.headers.get("X-Tenant-Id")).toBe(tenantsPayload[0].id);
  }
};

describe("mock handler response policy", () => {
  it("holds an injected membership response until explicitly released", async () => {
    const started = deferred<void>();
    const release = deferred<void>();
    const durations: unknown[] = [];
    server.use(
      ...createHandlers(async (duration) => {
        durations.push(duration);
        started.resolve();
        await release.promise;
      }),
    );
    const recorded = recordRequests();
    let settled = false;
    const responsePromise = fetch(membershipUrl, {
      headers: { Authorization: authorization },
    }).then((response) => {
      settled = true;
      return response;
    });
    try {
      await started.promise;
      expect(settled).toBe(false);
      expect(durations).toEqual([200]);
      expect(recorded.requests).toHaveLength(1);
      expect(recorded.requests[0].headers.get("Authorization")).toBe(authorization);
      release.resolve();
      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("application/json");
      expect(await response.json()).toEqual(tenantsPayload);
    } finally {
      release.resolve();
      await responsePromise;
      recorded.stop();
    }
  });

  it("preserves tenant updates across immediate handler factories", async () => {
    const durations: unknown[] = [];
    const immediate: typeof delay = async (duration) => {
      durations.push(duration);
    };
    server.use(...createHandlers(immediate));
    const tenant = tenantsPayload[0];
    const updated = { ...tenant, name: "Explicit fixture workspace" };
    const url = `${membershipUrl}/${tenant.id}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ name: updated.name }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual(updated);
    server.use(...createHandlers(immediate));
    const read = await fetch(url, { headers: { Authorization: authorization } });
    expect(read.status).toBe(200);
    expect(read.headers.get("Content-Type")).toContain("application/json");
    expect(await read.json()).toEqual(updated);
    expect(durations).toEqual([240, 160]);
  });

  it("preserves membership responses from default and browser handler factories", async () => {
    const recorded = recordRequests();
    try {
      for (const defaults of [createHandlers(), handlers]) {
        server.use(...defaults);
        const response = await fetch(membershipUrl, {
          headers: { Authorization: authorization },
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain("application/json");
        expect(await response.json()).toEqual(tenantsPayload);
      }
      expect(recorded.requests).toHaveLength(2);
      for (const request of recorded.requests) {
        expect(request.method).toBe("GET");
        expect(request.url).toBe(membershipUrl);
        expect(request.headers.get("Authorization")).toBe(authorization);
      }
    } finally {
      recorded.stop();
    }
  });

  it("keeps a custom response pending alongside immediate server defaults", async () => {
    const response = await fetch(membershipUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual(tenantsPayload);
    const customPayload = [tenantsPayload[1]];
    const held = heldJsonResponse(customPayload);
    server.use(http.get("/api/tenants", held.resolver));
    let settled = false;
    const responsePromise = fetch(membershipUrl).then((result) => {
      settled = true;
      return result;
    });
    try {
      await held.started;
      expect(settled).toBe(false);
      held.release();
      const customResponse = await responsePromise;
      expect(customResponse.status).toBe(200);
      expect(customResponse.headers.get("Content-Type")).toContain("application/json");
      expect(await customResponse.json()).toEqual(customPayload);
    } finally {
      await held.finish();
      await responsePromise;
    }
  });

  it("keeps protected UI and data pending until membership delivery", async () => {
    window.localStorage.setItem(sessionKey, JSON.stringify(defaultSession));
    const held = heldJsonResponse(tenantsPayload);
    const recorded = recordRequests();
    server.use(http.get("/api/tenants", held.resolver));
    const view = renderApp({ initialEntries: ["/app/overview"] });
    try {
      const membership = await held.started;
      expect(membership.headers.get("Authorization")).toBe(authorization);
      expect(screen.getByRole("status")).toHaveTextContent("Loading workspace");
      expect(screen.queryByText(/dashboard overview/i)).not.toBeInTheDocument();
      expect(protectedRequests(recorded.requests)).toEqual([]);
      await act(async () => held.finish());
      expect(await screen.findByText(/dashboard overview/i)).toBeInTheDocument();
      await waitFor(() => expectProtectedHeaders(recorded.requests));
    } finally {
      await act(async () => held.finish());
      view.unmount();
      recorded.stop();
    }
  });

  it("keeps membership and protected requests pending until login delivery", async () => {
    const user = userEvent.setup();
    const held = heldJsonResponse(defaultSession);
    const recorded = recordRequests();
    server.use(http.post("/api/auth/login", held.resolver));
    const view = renderApp({ initialEntries: ["/login"] });
    try {
      await user.click(await screen.findByRole("button", { name: /continue as/i }));
      const login = await held.started;
      expect(login.method).toBe("POST");
      expect(login.headers.get("Authorization")).toBeNull();
      expect(window.localStorage.getItem(sessionKey)).toBeNull();
      expect(recorded.requests.map((request) => new URL(request.url).pathname)).toEqual([
        "/api/auth/login",
      ]);
      expect(screen.queryByText(/dashboard overview/i)).not.toBeInTheDocument();
      await act(async () => held.finish());
      expect(await screen.findByText(/dashboard overview/i)).toBeInTheDocument();
      const membership = recorded.requests.find((request) => request.url.endsWith("/api/tenants"));
      expect(membership?.headers.get("Authorization")).toBe(authorization);
      await waitFor(() => expectProtectedHeaders(recorded.requests));
      expect(JSON.parse(window.localStorage.getItem(sessionKey) ?? "null")).toEqual(defaultSession);
    } finally {
      await act(async () => held.finish());
      view.unmount();
      recorded.stop();
    }
  });
});
