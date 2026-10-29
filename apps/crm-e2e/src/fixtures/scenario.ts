import { randomUUID } from "node:crypto";
import type { Browser, BrowserContext, Page, Route, WebSocketRoute } from "@playwright/test";
import {
  createTestApi,
  type TestApi,
  type TestApiAuthorityClaims,
  type TestApiRole,
  type TestApiSnapshot,
  type TestSeed,
} from "@testbed/api-contracts";
import type { WorkerScenarioServer } from "./scenario-server";

export type ScenarioIdentity = {
  id: string;
  role: TestApiRole;
  tenantIds: readonly string[];
  name?: string;
  email?: string;
};

const ROLES = new Set<TestApiRole>(["Owner", "Admin", "Manager", "Viewer"]);

function immutableIdentity(input: ScenarioIdentity): ScenarioIdentity {
  if (!input || typeof input !== "object") throw new Error("Scenario identity must be an object.");
  if (typeof input.id !== "string" || input.id.trim() === "")
    throw new Error("Scenario identity requires a non-empty id.");
  if (!ROLES.has(input.role))
    throw new Error(`Scenario identity role ${String(input.role)} is invalid.`);
  if (
    !Array.isArray(input.tenantIds) ||
    input.tenantIds.length === 0 ||
    input.tenantIds.some((tenant) => typeof tenant !== "string" || tenant.trim() === "") ||
    new Set(input.tenantIds).size !== input.tenantIds.length
  )
    throw new Error("Scenario identity requires unique, non-empty tenant memberships.");
  if (input.name !== undefined && typeof input.name !== "string")
    throw new Error("Scenario identity name must be a string.");
  if (input.email !== undefined && typeof input.email !== "string")
    throw new Error("Scenario identity email must be a string.");
  return Object.freeze({
    id: input.id,
    role: input.role,
    tenantIds: Object.freeze([...input.tenantIds]),
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.email === undefined ? {} : { email: input.email }),
  });
}

const identityDefinition = (identity: ScenarioIdentity) => JSON.stringify(identity);

export type ScenarioOptions = {
  browser: Browser;
  workerServer: WorkerScenarioServer;
  seed?: TestSeed;
  tenants?: string[];
  identity?: ScenarioIdentity;
  roles?: TestApiRole[];
  startAuthenticated?: boolean;
  faults?: Record<
    string,
    number | "response-lost" | { status: number; body?: unknown; times?: number }
  >;
  permittedOrigins?: string[];
  id?: string;
  idPrefix?: string;
  now?: string;
};

type UnexpectedRequest = {
  plane: "page" | "worker" | "service-worker" | "websocket";
  method: string;
  url: string;
  scenarioId: string;
  trace: string;
  acknowledged?: boolean;
};

type ContextRecord = {
  context: BrowserContext;
  identity: ScenarioIdentity;
  contextId: string;
  commandNamespace: string;
  authenticated: boolean;
  accessTokens: Set<string>;
};

export type ScenarioInspection = {
  scenarioId: string;
  runtimeId: string;
  serverPort: number;
  serviceWorkers: number;
  unexpectedRequests: readonly UnexpectedRequest[];
  contexts: Array<{
    contextId: string;
    runtimeId: string;
    identityId: string;
    authenticated: boolean;
  }>;
  state: TestApiSnapshot;
};

export type ProoflineScenario = {
  readonly id: string;
  readonly runtimeId: string;
  readonly api: TestApi;
  createContext(identity?: ScenarioIdentity): Promise<BrowserContext>;
  newPage(identity?: ScenarioIdentity): Promise<Page>;
  inspect(): Promise<ScenarioInspection>;
  reset(): Promise<void>;
  assertNoUnexpectedRequests(): Promise<void>;
};

const safeUrl = (raw: string) => {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "<invalid>";
  }
};

const sessionFor = (identity: ScenarioIdentity, accessToken: string, refreshToken: string) => ({
  user: {
    id: identity.id,
    name: identity.name ?? identity.id,
    email: identity.email ?? `${identity.id}@example.test`,
    role: identity.role,
    organization: identity.tenantIds[0] ?? "Proofline",
  },
  isAuthenticated: true,
  accessToken,
  refreshToken,
  expiresAt: 4_102_444_800_000,
});

export function createScenario(options: ScenarioOptions): ProoflineScenario {
  const scenarioId = options.id ?? `scenario-${randomUUID()}`;
  const runtimeId = `${options.idPrefix ?? scenarioId}-runtime`;
  const tenants = options.tenants ?? options.seed?.tenants ?? ["test-tenant"];
  const defaultIdentity = immutableIdentity(
    options.identity ??
      ({
        id: "proofline-owner",
        role: "Owner",
        tenantIds: [tenants[0]],
        name: "Avery Stone",
        email: "avery@northstar.app",
      } satisfies ScenarioIdentity),
  );
  const allowedRoles = options.roles ?? ["Owner", "Admin", "Manager", "Viewer"];
  if (!allowedRoles.includes(defaultIdentity.role))
    throw new Error(`Scenario identity role ${defaultIdentity.role} is not declared in roles.`);
  const faults = new Map(
    Object.entries(options.faults ?? {}).map(([key, value]) => {
      const normalized =
        typeof value === "number"
          ? { status: value, times: 1 }
          : value === "response-lost"
            ? { responseLost: true, times: 1 }
            : { status: value.status, body: value.body, times: value.times ?? 1 };
      if (
        !/^(GET|POST|PUT|PATCH|DELETE) \/api\//.test(key) ||
        (!normalized.responseLost &&
          (!Number.isInteger(normalized.status) ||
            (normalized.status ?? 0) < 400 ||
            (normalized.status ?? 0) > 599)) ||
        !Number.isInteger(normalized.times) ||
        normalized.times < 1
      )
        throw new Error(`Invalid one-shot scenario fault ${key}.`);
      return [key, normalized] as const;
    }),
  );
  const principals = new Map<string, TestApiAuthorityClaims>();
  const identityDefinitions = new Map([[defaultIdentity.id, identityDefinition(defaultIdentity)]]);
  const contexts: ContextRecord[] = [];
  const unexpectedRequests: UnexpectedRequest[] = [];
  let contextSequence = 0;
  let lifecycle: "active" | "cleaning" | "cleanup-failed" | "closed" = "active";
  let cleanupAttempt = 0;

  const api = createTestApi(
    { ...options.seed, tenants },
    {
      idPrefix: runtimeId,
      now: options.now ?? "2026-01-01T00:00:00.000Z",
      authority: {
        authorize(input) {
          const claims = input.bearerToken ? principals.get(input.bearerToken) : undefined;
          if (!claims) return { allowed: false, code: "unauthenticated" };
          if (input.operation !== "tenant.list" && !claims.tenantIds.includes(input.tenantId))
            return { allowed: false, code: "cross_tenant" };
          if (input.mutation && !["Owner", "Admin", "Manager"].includes(claims.role))
            return { allowed: false, code: "role_forbidden" };
          return { allowed: true, claims };
        },
      },
    },
  );

  const issueSession = (record: ContextRecord) => {
    const accessToken = `${scenarioId}.${record.contextId}.access.${randomUUID()}`;
    const refreshToken = `${scenarioId}.${record.contextId}.refresh.${randomUUID()}`;
    principals.set(
      accessToken,
      Object.freeze({
        subject: record.identity.id,
        role: record.identity.role,
        tenantIds: Object.freeze([...record.identity.tenantIds]),
      }),
    );
    record.accessTokens.add(accessToken);
    record.authenticated = true;
    return sessionFor(record.identity, accessToken, refreshToken);
  };

  const recordUnexpected = (
    plane: UnexpectedRequest["plane"],
    method: string,
    url: string,
    trace: string,
  ) => {
    unexpectedRequests.push({ plane, method, url: safeUrl(url), scenarioId, trace });
  };

  const install = async (record: ContextRecord) => {
    const { context, contextId } = record;
    await context.addInitScript(
      ({ id, namespace }) => {
        let sequence = 0;
        crypto.randomUUID = () =>
          `${namespace}-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
        const serviceWorker = navigator.serviceWorker;
        if (serviceWorker) {
          Object.defineProperty(serviceWorker, "register", {
            configurable: true,
            value: async () => {
              throw new Error(`PROOFLINE_SERVICE_WORKER_BLOCKED scenario=${id}`);
            },
          });
        }
      },
      { id: scenarioId, namespace: record.commandNamespace },
    );

    const httpHandler = async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      const trace = `${contextId}:${request.resourceType()}`;
      const origin = url.origin;
      const permitted = new Set([options.workerServer.origin, ...(options.permittedOrigins ?? [])]);
      if (origin === options.workerServer.origin && url.pathname.startsWith("/api/auth/")) {
        const authorization = request.headers().authorization ?? "";
        const accessToken = /^Bearer\s+(.+)$/i.exec(authorization)?.[1] ?? null;
        if (url.pathname === "/api/auth/login" && request.method() === "POST") {
          let body: { email?: unknown; method?: unknown } = {};
          try {
            body = JSON.parse(request.postData() || "{}") as typeof body;
          } catch {
            await route.fulfill({ status: 400, json: { error: { code: "invalid_json" } } });
            return;
          }
          const expectedEmail = record.identity.email ?? `${record.identity.id}@example.test`;
          if (
            (body.email !== undefined && body.email !== expectedEmail) ||
            (body.method !== undefined &&
              !["password", "google", "apple"].includes(String(body.method)))
          ) {
            await route.fulfill({ status: 401, json: { error: { code: "invalid_credentials" } } });
            return;
          }
          await route.fulfill({ json: issueSession(record) });
          return;
        }
        if (url.pathname === "/api/auth/session" && request.method() === "GET") {
          const claims =
            accessToken && record.accessTokens.has(accessToken)
              ? principals.get(accessToken)
              : undefined;
          if (!claims) {
            await route.fulfill({ status: 401, json: { error: { code: "unauthenticated" } } });
            return;
          }
          await route.fulfill({
            json: sessionFor(record.identity, accessToken, `${scenarioId}.session.refresh`),
          });
          return;
        }
        if (url.pathname === "/api/auth/refresh" && request.method() === "POST") {
          if (
            !accessToken ||
            !record.accessTokens.has(accessToken) ||
            !principals.has(accessToken)
          ) {
            await route.fulfill({ status: 401, json: { error: { code: "unauthenticated" } } });
            return;
          }
          principals.delete(accessToken);
          record.accessTokens.delete(accessToken);
          await route.fulfill({ json: issueSession(record) });
          return;
        }
        if (url.pathname === "/api/auth/logout" && request.method() === "POST") {
          if (!accessToken || !record.accessTokens.has(accessToken)) {
            await route.fulfill({ status: 401, json: { error: { code: "unauthenticated" } } });
            return;
          }
          for (const token of record.accessTokens) principals.delete(token);
          record.accessTokens.clear();
          record.authenticated = false;
          await route.fulfill({ json: { success: true } });
          return;
        }
      }
      if (origin === options.workerServer.origin && url.pathname.startsWith("/api/")) {
        const method = request.method();
        const faultKey = `${method} ${url.pathname}`;
        const fault = faults.get(faultKey);
        if (fault && !fault.responseLost) {
          fault.times -= 1;
          if (fault.times === 0) faults.delete(faultKey);
          await route.fulfill({
            status: fault.status,
            json: fault.body ?? { error: { code: "scenario_fault", recoverable: true } },
          });
          return;
        }
        const response = await api.handle(
          new Request(request.url(), {
            method,
            headers: request.headers(),
            body: ["GET", "HEAD"].includes(method) ? undefined : (request.postData() ?? undefined),
          }),
        );
        if (fault?.responseLost) {
          fault.times -= 1;
          if (fault.times === 0) faults.delete(faultKey);
          await route.abort("failed");
          return;
        }
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.text(),
        });
        return;
      }
      if (origin === options.workerServer.origin) {
        if (request.resourceType() === "document")
          await route.continue({
            headers: { ...request.headers(), "x-proofline-adapter": "context" },
          });
        else await route.continue();
        return;
      }
      if (permitted.has(origin)) {
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      const plane = request.headers()["x-proofline-plane"] === "worker" ? "worker" : "page";
      recordUnexpected(plane, request.method(), request.url(), trace);
      await route.abort("blockedbyclient");
    };
    await context.route("**/*", httpHandler);

    if (typeof context.routeWebSocket !== "function") {
      recordUnexpected(
        "websocket",
        "CONNECT",
        "ws://unsupported.invalid/",
        `${contextId}:unsupported-plane`,
      );
      throw new Error(
        `PROOFLINE_UNSUPPORTED_PLANE plane=websocket scenario=${scenarioId} trace=${contextId}`,
      );
    }
    await context.routeWebSocket("**/*", async (socket: WebSocketRoute) => {
      const url = socket.url();
      const origin = new URL(url).origin;
      const allowedOrigins = new Set(
        [options.workerServer.origin, ...(options.permittedOrigins ?? [])].map((value) => {
          const parsed = new URL(value);
          const protocol =
            parsed.protocol === "https:"
              ? "wss:"
              : parsed.protocol === "http:"
                ? "ws:"
                : parsed.protocol;
          return `${protocol}//${parsed.host}`;
        }),
      );
      if (allowedOrigins.has(origin)) {
        const artifact = new URL(options.workerServer.origin);
        const artifactSocketOrigin = `ws://${artifact.host}`;
        if (origin === artifactSocketOrigin) await socket.connectToServer();
        else await socket.close({ code: 1000, reason: "Proofline deterministic provider fake" });
        return;
      }
      recordUnexpected("websocket", "CONNECT", url, `${contextId}:websocket`);
      await socket.close({ code: 1008, reason: "Proofline egress denied" });
    });
  };

  const scenario: ProoflineScenario = {
    id: scenarioId,
    runtimeId,
    api,
    async createContext(identity = defaultIdentity) {
      if (lifecycle !== "active")
        throw new Error(`Scenario ${scenarioId} cannot create a context while ${lifecycle}.`);
      const normalizedIdentity = immutableIdentity(identity);
      const existingDefinition = identityDefinitions.get(normalizedIdentity.id);
      if (existingDefinition && existingDefinition !== identityDefinition(normalizedIdentity))
        throw new Error(
          `Scenario identity ${normalizedIdentity.id} was redefined with different claims.`,
        );
      const identities = new Set(contexts.map((record) => record.identity.id));
      identities.add(normalizedIdentity.id);
      if (identities.size > 2)
        throw new Error("A Proofline scenario supports at most two explicitly shared identities.");
      if (normalizedIdentity.tenantIds.some((tenant) => !tenants.includes(tenant)))
        throw new Error("Scenario identity names a tenant outside the scenario membership set.");
      if (!allowedRoles.includes(normalizedIdentity.role))
        throw new Error(
          `Scenario identity role ${normalizedIdentity.role} is not declared in roles.`,
        );
      identityDefinitions.set(normalizedIdentity.id, identityDefinition(normalizedIdentity));
      const sequence = ++contextSequence;
      const contextId = `${scenarioId}-context-${sequence}`;
      const context = await options.browser.newContext({
        baseURL: options.workerServer.origin,
        serviceWorkers: "block",
        storageState: options.workerServer.storageState,
      });
      const record: ContextRecord = {
        context,
        identity: normalizedIdentity,
        contextId,
        commandNamespace: sequence.toString(16).padStart(8, "0"),
        authenticated: false,
        accessTokens: new Set(),
      };
      contexts.push(record);
      try {
        await install(record);
        if (options.startAuthenticated) {
          const bootstrapPage = await context.newPage();
          try {
            await bootstrapPage.goto("/login");
            await bootstrapPage.evaluate(async () => {
              const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ method: "password" }),
              });
              if (!response.ok) throw new Error("Scenario routed login failed.");
              localStorage.setItem(
                "admin-dashboard-template:session",
                JSON.stringify(await response.json()),
              );
            });
          } finally {
            await bootstrapPage.close();
          }
        }
        return context;
      } catch (error) {
        try {
          await context.close();
          contexts.splice(contexts.indexOf(record), 1);
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            `Scenario ${scenarioId} context setup and cleanup failed.`,
          );
        }
        throw error;
      }
    },
    async newPage(identity) {
      const context = await scenario.createContext(identity);
      return context.newPage();
    },
    async inspect() {
      const tenantId = defaultIdentity.tenantIds[0] ?? tenants[0];
      const inspectionToken = `${scenarioId}.inspection`;
      principals.set(inspectionToken, {
        subject: "proofline-inspector",
        role: "Owner",
        tenantIds: [tenantId],
      });
      const state = (await (
        await api.handle(
          new Request(`${options.workerServer.origin}/api/test/state`, {
            headers: {
              authorization: `Bearer ${inspectionToken}`,
              "X-Tenant-Id": tenantId,
            },
          }),
        )
      ).json()) as TestApiSnapshot;
      principals.delete(inspectionToken);
      return {
        scenarioId,
        runtimeId,
        serverPort: options.workerServer.port,
        serviceWorkers: contexts.reduce(
          (total, record) => total + record.context.serviceWorkers().length,
          0,
        ),
        unexpectedRequests: [...unexpectedRequests],
        contexts: contexts.map((record) => ({
          contextId: record.contextId,
          runtimeId,
          identityId: record.identity.id,
          authenticated: record.authenticated,
        })),
        state,
      };
    },
    async assertNoUnexpectedRequests() {
      const pending = unexpectedRequests.filter((request) => !request.acknowledged);
      if (pending.length === 0) return;
      for (const request of pending) request.acknowledged = true;
      throw new Error(
        pending
          .map(
            (request) =>
              `Proofline browser egress denied plane=${request.plane} method=${request.method} url=${request.url} scenario=${request.scenarioId} trace=${request.trace}`,
          )
          .join("\n"),
      );
    },
    async reset() {
      if (lifecycle === "closed") return;
      if (lifecycle === "cleaning")
        throw new Error(`Scenario ${scenarioId} cleanup is already in progress.`);
      lifecycle = "cleaning";
      cleanupAttempt += 1;
      const records = [...contexts];
      const cleanup = await Promise.allSettled(
        records.map(async (record) => {
          const recordErrors: unknown[] = [];
          try {
            for (const page of record.context.pages())
              await page
                .evaluate(async () =>
                  "serviceWorker" in navigator
                    ? Promise.all(
                        (await navigator.serviceWorker.getRegistrations()).map((registration) =>
                          registration.unregister(),
                        ),
                      )
                    : [],
                )
                .catch((error) => recordErrors.push(error));
            if (record.context.serviceWorkers().length > 0)
              recordErrors.push(
                new Error(`Scenario ${scenarioId} retained a service worker during cleanup.`),
              );
            await record.context.clearCookies().catch((error) => recordErrors.push(error));
          } finally {
            await record.context.close().catch((error) => recordErrors.push(error));
          }
          if (recordErrors.length)
            throw new AggregateError(
              recordErrors,
              `Scenario ${scenarioId} context cleanup failed.`,
            );
        }),
      );
      principals.clear();
      const failedRecords = records.filter((_, index) => cleanup[index]?.status === "rejected");
      contexts.splice(0, contexts.length, ...failedRecords);
      const failures = cleanup.filter((result) => result.status === "rejected");
      if (failures.length) {
        lifecycle = "cleanup-failed";
        throw new AggregateError(
          failures.map((result) => (result as PromiseRejectedResult).reason),
          `Scenario ${scenarioId} cleanup attempt ${cleanupAttempt} failed; retained contexts may be retried.`,
        );
      }
      lifecycle = "closed";
    },
  };
  return scenario;
}
