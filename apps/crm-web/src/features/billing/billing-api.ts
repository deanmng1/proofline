import { http } from "@/lib/http";
import type { BillingPayload, Subscription } from "@/types";

export const getBillingRequest = () => http<BillingPayload>("/api/billing");

export const changePlanRequest = (planId: string) =>
  http<Subscription>("/api/billing/subscriptions", {
    method: "POST",
    body: JSON.stringify({ planId }),
  });
