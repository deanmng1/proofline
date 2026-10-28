import { http } from "@/lib/http";
import type { Tenant } from "@/types";

export const listTenants = () => http<Tenant[]>("/api/tenants");

export const getTenant = (id: string) => http<Tenant>(`/api/tenants/${id}`);

export const updateTenant = (id: string, updates: Partial<Tenant>) =>
  http<Tenant>(`/api/tenants/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
