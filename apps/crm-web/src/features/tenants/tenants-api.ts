import { http } from "@/lib/http";
import type { Tenant } from "@/types";

export const listTenants = (accessToken?: string) =>
  http<Tenant[]>("/api/tenants", {
    ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
  });

export const getTenant = (id: string) => http<Tenant>(`/api/tenants/${id}`);

export const updateTenant = (id: string, updates: Partial<Tenant>) =>
  http<Tenant>(`/api/tenants/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
