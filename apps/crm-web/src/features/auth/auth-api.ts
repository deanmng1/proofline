import { http } from "@/lib/http";
import type { Session } from "@/types";

const SESSION_STORAGE_KEY = "admin-dashboard-template:session";
const REMEMBERED_USER_STORAGE_KEY = "admin-dashboard-template:last-user";

export type LoginMethod = "password" | "google" | "apple";

export type LoginPayload = {
  method?: LoginMethod;
  email?: string;
};

export type RememberedUser = {
  name: string;
  email: string;
};

export const authStorage = {
  get: () => {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  },
  set: (session: Session) => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  },
  clear: () => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  },
};

export const rememberedUserStorage = {
  get: (): RememberedUser | null => {
    const raw = window.localStorage.getItem(REMEMBERED_USER_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<RememberedUser>;
      if (typeof parsed.name === "string" && typeof parsed.email === "string") {
        return { name: parsed.name, email: parsed.email };
      }
      return null;
    } catch {
      return null;
    }
  },
  set: (user: RememberedUser) => {
    window.localStorage.setItem(REMEMBERED_USER_STORAGE_KEY, JSON.stringify(user));
  },
  clear: () => {
    window.localStorage.removeItem(REMEMBERED_USER_STORAGE_KEY);
  },
};

export const demoPersona: RememberedUser = {
  name: "Avery Stone",
  email: "avery@northstar.app",
};

export const loginRequest = (payload: LoginPayload = {}) =>
  http<Session>("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });

export const logoutRequest = () =>
  http<{ success: boolean }>("/api/auth/logout", { method: "POST" });

export const refreshRequest = () => http<Session>("/api/auth/refresh", { method: "POST" });

export const isSessionExpired = (session: Session | null): boolean => {
  if (!session) {
    return true;
  }
  return session.expiresAt <= Date.now();
};
