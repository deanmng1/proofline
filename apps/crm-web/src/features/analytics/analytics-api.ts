import { http } from "@/lib/http";
import type { AnalyticsPayload } from "@/types";

export const getAnalyticsRequest = () => http<AnalyticsPayload>("/api/analytics/summary");
