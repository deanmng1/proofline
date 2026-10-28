import { http } from "@/lib/http";
import type { SettingsPayload } from "@/types";

export const getSettingsRequest = () => http<SettingsPayload>("/api/settings");

export const updateSettingsRequest = (payload: SettingsPayload) =>
  http<SettingsPayload>("/api/settings", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
