const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

let activeTenantId: string | null = null;
let getAccessToken: (() => string | null) | null = null;
let refreshAuthSession: (() => Promise<boolean>) | null = null;
let onUnauthorized: (() => void) | null = null;

type ErrorPayload = {
  error?: {
    code?: unknown;
    message?: unknown;
    recoverable?: unknown;
  };
};

export class HttpError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly recoverable: boolean;

  constructor(status: number, payload?: ErrorPayload) {
    const details = payload?.error;
    const message = typeof details?.message === "string" ? details.message : undefined;
    super(message ?? `Request failed with status ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.code = typeof details?.code === "string" ? details.code : undefined;
    this.recoverable = details?.recoverable === true;
  }
}

export const setActiveTenantId = (id: string | null) => {
  activeTenantId = id;
};

export const setHttpAuth = (handlers: {
  getToken: () => string | null;
  refresh: () => Promise<boolean>;
  unauthorized: () => void;
}) => {
  getAccessToken = handlers.getToken;
  refreshAuthSession = handlers.refresh;
  onUnauthorized = handlers.unauthorized;
};

const resolveUrl = (input: RequestInfo | URL): RequestInfo | URL => {
  if (API_BASE_URL && typeof input === "string" && !/^https?:\/\//.test(input)) {
    return `${API_BASE_URL}${input.startsWith("/") ? "" : "/"}${input}`;
  }
  return input;
};

export const http = async <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  retried = false,
): Promise<T> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getAccessToken?.();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (activeTenantId) {
    headers["X-Tenant-Id"] = activeTenantId;
  }

  const response = await fetch(resolveUrl(input), {
    headers: {
      ...headers,
      ...init?.headers,
    },
    ...init,
  });

  if (response.status === 401 && !retried && refreshAuthSession) {
    const refreshed = await refreshAuthSession();
    if (refreshed) {
      return http<T>(input, init, true);
    }
    onUnauthorized?.();
    throw new Error("Session expired");
  }

  if (!response.ok) {
    const payload = (await response
      .clone()
      .json()
      .catch(() => undefined)) as ErrorPayload | undefined;
    throw new HttpError(response.status, payload);
  }

  return response.json() as Promise<T>;
};
