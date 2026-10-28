const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

let activeTenantId: string | null = null;
let getAccessToken: (() => string | null) | null = null;
let refreshAuthSession: (() => Promise<boolean>) | null = null;
let onUnauthorized: (() => void) | null = null;

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
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};
