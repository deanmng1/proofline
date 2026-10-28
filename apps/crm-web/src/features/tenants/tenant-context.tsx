import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { listTenants } from "@/features/tenants/tenants-api";
import { setActiveTenantId } from "@/lib/http";
import type { Tenant } from "@/types";

export const TENANT_STORAGE_KEY = "admin-dashboard-template:tenant";

type TenantContextValue = {
  tenants: Tenant[];
  currentTenant: Tenant | null;
  isLoaded: boolean;
  setCurrentTenant: (id: string) => void;
};

const TenantContext = createContext<TenantContextValue | null>(null);

const readStoredTenantId = (): string | null => {
  const raw = window.localStorage.getItem(TENANT_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as string) : null;
};

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenant, setCurrentTenantState] = useState<Tenant | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listTenants()
      .then((fetched) => {
        if (cancelled) {
          return;
        }
        setTenants(fetched);
        const initial =
          fetched.find((tenant) => tenant.id === readStoredTenantId()) ?? fetched[0] ?? null;
        setCurrentTenantState(initial);
        setActiveTenantId(initial?.id ?? null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<TenantContextValue>(
    () => ({
      tenants,
      currentTenant,
      isLoaded,
      setCurrentTenant: (id: string) => {
        const next = tenants.find((tenant) => tenant.id === id) ?? null;
        setCurrentTenantState(next);
        setActiveTenantId(next?.id ?? null);
        window.localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(next?.id ?? null));
        queryClient.invalidateQueries();
      },
    }),
    [tenants, currentTenant, isLoaded, queryClient],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return context;
};
