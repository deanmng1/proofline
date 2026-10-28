import { http } from "@/lib/http";
import type { ApiKey, Integration } from "@/types";

export const getIntegrationsRequest = () => http<Integration[]>("/api/integrations");

export const getApiKeysRequest = () => http<ApiKey[]>("/api/integrations/api-keys");

export const connectIntegrationRequest = (id: string) =>
  http<Integration>(`/api/integrations/${id}/connect`, { method: "POST" });

export const createApiKeyRequest = (input: { label: string; scopes: string[] }) =>
  http<ApiKey>("/api/integrations/api-keys", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const revokeApiKeyRequest = (id: string) =>
  http<null>(`/api/integrations/api-keys/${id}`, { method: "DELETE" });
