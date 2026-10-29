import { readdir, readFile } from "node:fs/promises";
import type { ProoflineScenario, ScenarioOptions } from "./scenario";
import { startWorkerScenarioServer, type WorkerScenarioServer } from "./scenario-server";
import { expect, test } from "./test";

type IsolationEvidence = {
  type: "worker" | "scenario";
  runId: string;
  workerIndex: number;
  port: number;
  scenarioId?: string;
  runtimeId?: string;
  marker?: string;
};

async function distinctWorkerProof(directory: string, runId: string): Promise<IsolationEvidence[]> {
  const deadline = Date.now() + 5000;
  do {
    const files = await readdir(directory).catch(() => []);
    const evidence = await Promise.all(
      files.map(
        async (file) =>
          JSON.parse(await readFile(`${directory}/${file}`, "utf8")) as IsolationEvidence,
      ),
    );
    if (evidence.some((entry) => entry.runId !== runId))
      throw new Error("Proofline scenario evidence contains a stale run id.");
    const workers = new Set(evidence.map((entry) => entry.workerIndex));
    const ports = new Set(
      evidence.filter((entry) => entry.type === "worker").map((entry) => entry.port),
    );
    const scenarios = evidence.filter((entry) => entry.type === "scenario");
    if (
      workers.size >= 2 &&
      ports.size >= 2 &&
      new Set(scenarios.map((entry) => entry.workerIndex)).size >= 2 &&
      new Set(scenarios.map((entry) => entry.scenarioId)).size >= 2 &&
      new Set(scenarios.map((entry) => entry.runtimeId)).size >= 2 &&
      new Set(scenarios.map((entry) => entry.marker)).size >= 2
    )
      return evidence;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw new Error(
    "Expected distinct runtime state and OS-assigned ports from two Playwright workers.",
  );
}

async function createRuntimeMarker(page: import("@playwright/test").Page, marker: string) {
  await page.goto("/login");
  const status = await page.evaluate(async (value) => {
    const session = await fetch("/api/auth/login", { method: "POST", body: "{}" }).then(
      (response) => response.json() as Promise<{ accessToken: string }>,
    );
    return fetch("/api/customers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        "X-Tenant-Id": "test-tenant",
      },
      body: JSON.stringify({
        commandId: `${value}-command`,
        correlationId: value,
        name: value,
        email: `${value}@example.test`,
      }),
    }).then((response) => response.status);
  }, marker);
  expect(status).toBe(201);
}

async function assertScenarioIsolation(
  scenario: ProoflineScenario,
  scenarioFactory: (
    options?: Omit<Partial<ScenarioOptions>, "browser" | "workerServer">,
  ) => ProoflineScenario,
  workerServer: WorkerScenarioServer,
  marker: string,
) {
  const page = await scenario.newPage();
  await page.goto("/login");
  expect(await page.evaluate(() => localStorage.getItem("proofline-isolation"))).toBeNull();
  expect((await scenario.inspect()).state.customers).toEqual([]);
  await createRuntimeMarker(page, marker);
  await page.evaluate((value) => localStorage.setItem("proofline-isolation", value), marker);
  expect(await page.evaluate(() => localStorage.getItem("proofline-isolation"))).toBe(marker);
  expect(new URL(workerServer.origin).port).toMatch(/^\d+$/);
  expect(workerServer.port).toBe(Number(new URL(workerServer.origin).port));
  const isolated = scenarioFactory({ idPrefix: `${marker}-isolated` });
  const isolatedPage = await isolated.newPage();
  await isolatedPage.goto("/login");
  expect(await isolatedPage.evaluate(() => localStorage.getItem("proofline-isolation"))).toBeNull();
  expect(isolated.runtimeId).not.toBe(scenario.runtimeId);
  expect(isolated.id).not.toBe(scenario.id);
  expect((await isolated.inspect()).state.customers).toEqual([]);
  await createRuntimeMarker(isolatedPage, `${marker}-isolated`);
  expect((await scenario.inspect()).state.customers.map((customer) => customer.name)).toEqual([
    marker,
  ]);
  expect((await isolated.inspect()).state.customers.map((customer) => customer.name)).toEqual([
    `${marker}-isolated`,
  ]);
  await workerServer.recordScenario({
    scenarioId: scenario.id,
    runtimeId: scenario.runtimeId,
    marker,
  });
  const evidence = await distinctWorkerProof(workerServer.evidenceDirectory, workerServer.runId);
  expect(evidence.some((entry) => entry.port === workerServer.port)).toBe(true);
}

test("starts_unauthenticated_and_logs_in_through_routed_auth", { tag: "@scenario" }, async ({
  scenario,
}) => {
  const page = await scenario.newPage();
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("button", { name: /switch or remove account/i }).click();
  await page.getByLabel(/email/i).fill("avery@northstar.app");
  await page.getByLabel(/password/i).fill("proofline-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/app\/overview$/);
  expect((await scenario.inspect()).contexts[0]?.authenticated).toBe(true);
});

test("rotates_refresh_tokens_and_revokes_the_context_on_logout", { tag: "@authority" }, async ({
  scenario,
}) => {
  const page = await scenario.newPage();
  await page.goto("/login");
  const result = await page.evaluate(async () => {
    const wrong = await fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ method: "password", email: "wrong@example.test" }),
    });
    const login = await fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ method: "password", email: "avery@northstar.app" }),
    });
    const first = (await login.json()) as { accessToken: string };
    const refresh = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${first.accessToken}` },
    });
    const second = (await refresh.json()) as { accessToken: string };
    const oldStatus = await fetch("/api/tenants", {
      headers: { Authorization: `Bearer ${first.accessToken}` },
    }).then((response) => response.status);
    const currentStatus = await fetch("/api/tenants", {
      headers: { Authorization: `Bearer ${second.accessToken}` },
    }).then((response) => response.status);
    const logoutStatus = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${second.accessToken}` },
    }).then((response) => response.status);
    const revokedStatus = await fetch("/api/tenants", {
      headers: { Authorization: `Bearer ${second.accessToken}` },
    }).then((response) => response.status);
    return {
      wrong: wrong.status,
      rotated: first.accessToken !== second.accessToken,
      oldStatus,
      currentStatus,
      logoutStatus,
      revokedStatus,
    };
  });
  expect(result).toEqual({
    wrong: 401,
    rotated: true,
    oldStatus: 401,
    currentStatus: 200,
    logoutStatus: 200,
    revokedStatus: 401,
  });
});

test("fails_an_undeclared_browser_request_with_scenario_context", { tag: "@egress" }, async ({
  scenario,
}) => {
  const page = await scenario.newPage();
  const diagnostic = await page.evaluate(async () => {
    try {
      await fetch("https://undeclared.invalid/private?secret=value");
      return "request unexpectedly succeeded";
    } catch (error) {
      return String(error);
    }
  });
  expect(diagnostic).toContain("Failed to fetch");
  await expect(() => scenario.assertNoUnexpectedRequests()).rejects.toThrow(
    new RegExp(
      `plane=page.*method=GET.*url=https://undeclared.invalid/private.*scenario=${scenario.id}`,
    ),
  );
});

test("denies_an_undeclared_worker_request_with_scenario_context", { tag: "@egress" }, async ({
  scenario,
}) => {
  const page = await scenario.newPage();
  await page.goto("/login");
  const result = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const worker = new Worker(
          URL.createObjectURL(
            new Blob(
              [
                `fetch("https://worker.invalid/private", {headers:{"X-Proofline-Plane":"worker"}}).then(() => postMessage("ok")).catch(error => postMessage(String(error)))`,
              ],
              { type: "text/javascript" },
            ),
          ),
        );
        worker.onmessage = (event) => resolve(String(event.data));
      }),
  );
  expect(result).toContain("Failed to fetch");
  await expect(() => scenario.assertNoUnexpectedRequests()).rejects.toThrow(/plane=worker/);
});

test("blocks_service_worker_registration_and_cleans_registrations", { tag: "@egress" }, async ({
  scenario,
}) => {
  const page = await scenario.newPage();
  await page.goto("/login");
  const result = await page.evaluate(async () => {
    try {
      await navigator.serviceWorker.register("/mockServiceWorker.js");
      return "registered";
    } catch (error) {
      return String(error);
    }
  });
  expect(result).toContain(`PROOFLINE_SERVICE_WORKER_BLOCKED scenario=${scenario.id}`);
  expect((await scenario.inspect()).serviceWorkers).toBe(0);
});

test("denies_browser_websockets_with_deterministic_context", { tag: "@egress" }, async ({
  scenario,
}) => {
  const page = await scenario.newPage();
  await page.goto("/login");
  const result = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const socket = new WebSocket("wss://socket.invalid/private");
        socket.onopen = () => resolve("opened");
        socket.onerror = () => resolve("denied");
        socket.onclose = () => resolve("denied");
        setTimeout(() => resolve("denied"), 1000);
      }),
  );
  expect(result).toBe("denied");
  await expect(() => scenario.assertNoUnexpectedRequests()).rejects.toThrow(/plane=websocket/);
});

test("separate_scenarios_receive_distinct_runtime_ids_and_state", { tag: "@isolation" }, async ({
  scenarioFactory,
  workerServer,
}) => {
  const first = scenarioFactory({ idPrefix: "first" });
  const second = scenarioFactory({ idPrefix: "second" });
  const [firstPage, secondPage] = await Promise.all([first.newPage(), second.newPage()]);
  await Promise.all([firstPage.goto("/login"), secondPage.goto("/login")]);
  await firstPage.evaluate(() => localStorage.setItem("proofline-isolation", "first"));
  await Promise.all([
    createRuntimeMarker(firstPage, "separate-first"),
    createRuntimeMarker(secondPage, "separate-second"),
  ]);
  expect(await secondPage.evaluate(() => localStorage.getItem("proofline-isolation"))).toBeNull();
  expect(first.runtimeId).not.toBe(second.runtimeId);
  expect((await first.inspect()).state.customers.map((customer) => customer.name)).toEqual([
    "separate-first",
  ]);
  expect((await second.inspect()).state.customers.map((customer) => customer.name)).toEqual([
    "separate-second",
  ]);
  await workerServer.recordScenario({
    scenarioId: first.id,
    runtimeId: first.runtimeId,
    marker: "separate-first",
  });
  await distinctWorkerProof(workerServer.evidenceDirectory, workerServer.runId);
});

test("shares_one_runtime_only_across_explicit_contexts", { tag: "@isolation" }, async ({
  scenario,
  workerServer,
}) => {
  const first = await scenario.createContext();
  const second = await scenario.createContext();
  const firstPage = await first.newPage();
  const secondPage = await second.newPage();
  await Promise.all([firstPage.goto("/login"), secondPage.goto("/login")]);
  const [firstCommandId, secondCommandId] = await Promise.all([
    firstPage.evaluate(() => crypto.randomUUID()),
    secondPage.evaluate(() => crypto.randomUUID()),
  ]);
  const state = await scenario.inspect();
  expect(state.contexts).toHaveLength(2);
  expect(new Set(state.contexts.map((context) => context.runtimeId))).toEqual(
    new Set([scenario.runtimeId]),
  );
  expect(firstCommandId).not.toBe(secondCommandId);
  await Promise.all([
    createRuntimeMarker(firstPage, "shared-first"),
    createRuntimeMarker(secondPage, "shared-second"),
  ]);
  expect(
    (await scenario.inspect()).state.customers.map((customer) => customer.name).sort(),
  ).toEqual(["shared-first", "shared-second"]);
  await workerServer.recordScenario({
    scenarioId: scenario.id,
    runtimeId: scenario.runtimeId,
    marker: "shared-first+shared-second",
  });
  await distinctWorkerProof(workerServer.evidenceDirectory, workerServer.runId);
});

test("cleans_up_after_a_failed_scenario_assertion", { tag: "@scenario" }, async ({
  scenarioFactory,
}) => {
  const failed = scenarioFactory({ id: "cleanup-failed" });
  const page = await failed.newPage();
  await page.evaluate(() => fetch("https://cleanup.invalid/fail").catch(() => undefined));
  await expect(() => failed.assertNoUnexpectedRequests()).rejects.toThrow(/cleanup.invalid/);
  await failed.reset();

  const clean = scenarioFactory({ id: "cleanup-clean" });
  await clean.newPage();
  await expect(clean.assertNoUnexpectedRequests()).resolves.toBeUndefined();
  expect((await clean.inspect()).contexts).toHaveLength(1);
  await clean.reset();
});

test("honors_declared_roles_and_one_shot_route_faults", { tag: "@scenario" }, async ({
  scenarioFactory,
}) => {
  const scenario = scenarioFactory({
    roles: ["Owner"],
    faults: { "GET /api/customers": { status: 503, times: 1 } },
  });
  await expect(
    scenario.createContext({ id: "viewer", role: "Viewer", tenantIds: ["test-tenant"] }),
  ).rejects.toThrow(/not declared in roles/);
  const page = await scenario.newPage();
  await page.goto("/login");
  const statuses = await page.evaluate(async () => {
    const session = await fetch("/api/auth/login", { method: "POST", body: "{}" }).then(
      (response) => response.json() as Promise<{ accessToken: string }>,
    );
    const headers = {
      Authorization: `Bearer ${session.accessToken}`,
      "X-Tenant-Id": "test-tenant",
    };
    const first = await fetch("/api/customers", { headers });
    const second = await fetch("/api/customers", { headers });
    return [first.status, second.status];
  });
  expect(statuses).toEqual([503, 200]);
});

test("rejects_role_and_cross_tenant_mutations_through_the_test_api", { tag: "@authority" }, async ({
  scenarioFactory,
}) => {
  const scenario = scenarioFactory({
    tenants: ["tenant-a", "tenant-b"],
    identity: { id: "viewer", role: "Viewer", tenantIds: ["tenant-a"] },
  });
  const viewer = await scenario.createContext();
  const page = await viewer.newPage();
  await page.goto("/login");
  const statuses = await page.evaluate(async () => {
    const session = await fetch("/api/auth/login", { method: "POST", body: "{}" }).then(
      (response) => response.json() as Promise<{ accessToken: string }>,
    );
    const roleDenied = await fetch("/api/customers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        "X-Tenant-Id": "tenant-a",
      },
      body: JSON.stringify({
        commandId: "viewer-customer",
        correlationId: "authority",
        name: "Denied",
        email: "denied@example.test",
      }),
    }).then((response) => response.status);
    const crossTenant = await fetch("/api/customers", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "X-Tenant-Id": "tenant-b",
      },
    }).then((response) => response.status);
    return { roleDenied, crossTenant };
  });
  expect(statuses).toEqual({ roleDenied: 403, crossTenant: 403 });
  expect((await scenario.inspect()).state.customers).toEqual([]);
  const owner = await scenario.createContext({
    id: "owner",
    role: "Owner",
    tenantIds: ["tenant-a"],
  });
  const ownerPage = await owner.newPage();
  await ownerPage.goto("/login");
  const authorized = await ownerPage.evaluate(async () => {
    const session = await fetch("/api/auth/login", { method: "POST", body: "{}" }).then(
      (response) => response.json() as Promise<{ accessToken: string }>,
    );
    const headers = {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      "X-Tenant-Id": "tenant-a",
    };
    const mutation = await fetch("/api/customers", {
      method: "POST",
      headers,
      body: JSON.stringify({
        commandId: "owner-customer",
        correlationId: "authority",
        name: "Allowed",
        email: "allowed@example.test",
      }),
    });
    const read = await fetch("/api/customers", { headers });
    return { mutation: mutation.status, read: read.status };
  });
  expect(authorized).toEqual({ mutation: 201, read: 200 });
  expect((await scenario.inspect()).state.customers).toHaveLength(1);
  await scenario.reset();
});

test("copies_identity_claims_and_rejects_conflicting_redefinitions", { tag: "@authority" }, async ({
  scenarioFactory,
}) => {
  const identity = {
    id: "immutable-viewer",
    role: "Viewer" as const,
    tenantIds: ["tenant-a"],
    email: "viewer@example.test",
  };
  const scenario = scenarioFactory({ tenants: ["tenant-a", "tenant-b"], identity });
  const context = await scenario.createContext(identity);
  await expect(
    scenario.createContext({ id: "recoverable-owner", role: "Owner", tenantIds: ["outside"] }),
  ).rejects.toThrow(/outside the scenario membership/);
  await expect(
    scenario.createContext({ id: "recoverable-owner", role: "Owner", tenantIds: ["tenant-a"] }),
  ).resolves.toBeDefined();
  (identity as { role: string }).role = "Owner";
  identity.tenantIds.push("tenant-b");
  await expect(
    scenario.createContext({ id: identity.id, role: "Owner", tenantIds: ["tenant-a", "tenant-b"] }),
  ).rejects.toThrow(/redefined with different claims/);
  const page = await context.newPage();
  await page.goto("/login");
  const result = await page.evaluate(async () => {
    const session = await fetch("/api/auth/login", { method: "POST", body: "{}" }).then(
      (response) => response.json() as Promise<{ accessToken: string }>,
    );
    const mutate = await fetch("/api/customers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        "X-Tenant-Id": "tenant-a",
      },
      body: JSON.stringify({
        commandId: "immutable-viewer-command",
        correlationId: "immutable-viewer",
        name: "Must stay denied",
        email: "denied@example.test",
      }),
    });
    const crossTenant = await fetch("/api/customers", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "X-Tenant-Id": "tenant-b",
      },
    });
    return [mutate.status, crossTenant.status];
  });
  expect(result).toEqual([403, 403]);
  expect((await scenario.inspect()).state.customers).toEqual([]);
});

test("scenario_reset_retains_failed_contexts_for_a_deterministic_retry", {
  tag: "@scenario",
}, async ({ scenarioFactory }) => {
  const scenario = scenarioFactory({ id: "cleanup-retry" });
  const context = await scenario.createContext();
  const originalClose = context.close.bind(context);
  let closeAttempts = 0;
  Object.defineProperty(context, "close", {
    configurable: true,
    value: async () => {
      closeAttempts += 1;
      if (closeAttempts === 1) throw new Error("injected close failure");
      await originalClose();
    },
  });
  await expect(scenario.reset()).rejects.toThrow(/cleanup attempt 1 failed/);
  expect((await scenario.inspect()).contexts).toHaveLength(1);
  await expect(scenario.reset()).resolves.toBeUndefined();
  expect(closeAttempts).toBe(2);
});

test("worker_setup_stops_the_server_when_bootstrap_close_fails", { tag: "@scenario" }, async ({
  browser,
}) => {
  let origin = "";
  await expect(
    startWorkerScenarioServer(browser, 999, {
      onReady(value) {
        origin = value;
      },
      async createBootstrapContext() {
        const context = await browser.newContext();
        const originalClose = context.close.bind(context);
        Object.defineProperty(context, "close", {
          configurable: true,
          value: async () => {
            await originalClose();
            throw new Error("injected bootstrap close failure");
          },
        });
        return context;
      },
    }),
  ).rejects.toThrow(/setup failed and was shut down/);
  expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  await expect(fetch(origin, { signal: AbortSignal.timeout(1000) })).rejects.toThrow();
});

test("factory_teardown_rejects_an_unacknowledged_caught_denial", { tag: "@egress" }, async ({
  scenarioFactory,
}) => {
  test.fail();
  const scenario = scenarioFactory({ id: "unacknowledged-denial" });
  const page = await scenario.newPage();
  await page.goto("/login");
  await page.evaluate(() => fetch("https://unacknowledged.invalid/caught").catch(() => undefined));
});

test("shard_a_isolates_runtime_and_storage", { tag: "@isolation" }, async ({
  scenario,
  scenarioFactory,
  workerServer,
}) => {
  await assertScenarioIsolation(scenario, scenarioFactory, workerServer, "alpha");
});

test("shard_b_isolates_runtime_and_storage", { tag: "@isolation" }, async ({
  scenario,
  scenarioFactory,
  workerServer,
}) => {
  await assertScenarioIsolation(scenario, scenarioFactory, workerServer, "bravo");
});

test("shard_a_uses_an_os_assigned_worker_port", { tag: "@isolation" }, async ({
  scenario,
  scenarioFactory,
  workerServer,
}) => {
  await assertScenarioIsolation(scenario, scenarioFactory, workerServer, "charlie");
});

test("shard_b_uses_an_os_assigned_worker_port", { tag: "@isolation" }, async ({
  scenario,
  scenarioFactory,
  workerServer,
}) => {
  await assertScenarioIsolation(scenario, scenarioFactory, workerServer, "delta");
});
