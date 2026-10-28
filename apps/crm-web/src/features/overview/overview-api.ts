import { http } from "@/lib/http";
import type { OverviewPayload } from "@/types";

export const getOverviewRequest = () => http<OverviewPayload>("/api/dashboard/overview");
