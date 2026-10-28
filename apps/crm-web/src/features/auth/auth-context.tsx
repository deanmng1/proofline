import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  authStorage,
  isSessionExpired,
  type LoginMethod,
  loginRequest,
  logoutRequest,
  refreshRequest,
  rememberedUserStorage,
} from "@/features/auth/auth-api";
import { setHttpAuth } from "@/lib/http";
import type { Session } from "@/types";

export type LoginOptions = {
  redirectTo?: string;
  method?: LoginMethod;
  email?: string;
};

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  login: (options?: LoginOptions) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(() => authStorage.get());
  const sessionRef = useRef<Session | null>(session);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const refreshSession = useMemo(
    () => async (): Promise<boolean> => {
      try {
        const next = await refreshRequest();
        sessionRef.current = next;
        authStorage.set(next);
        setSession(next);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const rememberCurrentUser = useCallback(() => {
    const current = sessionRef.current;
    if (current?.isAuthenticated) {
      rememberedUserStorage.set({ name: current.user.name, email: current.user.email });
    }
  }, []);

  const logout = useMemo(
    () => async (): Promise<void> => {
      await logoutRequest().catch(() => undefined);
      rememberCurrentUser();
      authStorage.clear();
      sessionRef.current = null;
      setSession(null);
      navigate("/login", { replace: true });
    },
    [navigate, rememberCurrentUser],
  );

  const unauthorized = useMemo(
    () => () => {
      rememberCurrentUser();
      authStorage.clear();
      sessionRef.current = null;
      setSession(null);
      navigate("/login", { replace: true });
    },
    [navigate, rememberCurrentUser],
  );

  useEffect(() => {
    setHttpAuth({
      getToken: () => sessionRef.current?.accessToken ?? null,
      refresh: refreshSession,
      unauthorized,
    });
  }, [refreshSession, unauthorized]);

  useEffect(() => {
    if (session?.isAuthenticated && isSessionExpired(session) && session.refreshToken) {
      void refreshSession();
    }
  }, [session, refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session?.isAuthenticated),
      login: async (options) => {
        const nextSession = await loginRequest({
          method: options?.method,
          email: options?.email,
        });
        sessionRef.current = nextSession;
        authStorage.set(nextSession);
        rememberedUserStorage.set({
          name: nextSession.user.name,
          email: nextSession.user.email,
        });
        setSession(nextSession);
        navigate(options?.redirectTo ?? "/app/overview", { replace: true });
      },
      logout,
      refreshSession,
    }),
    [navigate, session, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
