import { readdir, readFile } from "node:fs/promises";
import type { ProoflineScenario, ScenarioOptions } from "./scenario";
import type { WorkerScenarioServer } from "./scenario-server";
import { expect, test } from "./test";

async function distinctWorkerPorts(directory: string): Promise<Set<number>> {
  const deadline = Date.now() + 5000;
  do {
    const files = await readdir(directory).catch(() => []);
    const evidence = await Promise.all(
      files.map(
        async (file) =>
          JSON.parse(await readFile(`${directory}/${file}`, "utf8")) as { port: number },
      ),
    );
    const ports = new Set(evidence.map((entry) => entry.port));
    if (ports.size >= 2) return ports;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw new Error("Expected at least two Playwright workers with distinct OS-assigned ports.");
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
  expect((await distinctWorkerPorts(workerServer.evidenceDirectory)).has(workerServer.port)).toBe(
    true,
  );
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
}) => {
  const first = scenarioFactory({ idPrefix: "first" });
  const second = scenarioFactory({ idPrefix: "second" });
  const [firstPage, secondPage] = await Promise.all([first.newPage(), second.newPage()]);
  await Promise.all([firstPage.goto("/login"), secondPage.goto("/login")]);
  await firstPage.evaluate(() => localStorage.setItem("proofline-isolation", "first"));
  expect(await secondPage.evaluate(() => localStorage.getItem("proofline-isolation"))).toBeNull();
  expect(first.runtimeId).not.toBe(second.runtimeId);
  expect((await first.inspect()).state.customers).toEqual([]);
  expect((await second.inspect()).state.customers).toEqual([]);
});

test("shares_one_runtime_only_across_explicit_contexts", { tag: "@isolation" }, async ({
  scenario,
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
