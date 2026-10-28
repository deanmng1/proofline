import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { getOverviewRequest } from "@/features/overview/overview-api";
import { updateSettingsRequest } from "@/features/settings/settings-api";
import { getUsersRequest } from "@/features/users/users-api";
import { server } from "@/test/server";
import type { SettingsPayload } from "@/types";

afterEach(() => server.resetHandlers());

describe("api layer (http wrapper)", () => {
  it("returns parsed JSON for a successful GET", async () => {
    const users = await getUsersRequest();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);
  });

  it("throws on non-2xx responses", async () => {
    server.use(http.get("/api/users", () => new HttpResponse(null, { status: 500 })));
    await expect(getUsersRequest()).rejects.toThrow(/status 500/);
  });

  it("sends a JSON body on PATCH and returns the updated resource", async () => {
    const payload: SettingsPayload = {
      profile: { companyName: "Acme", contactEmail: "a@acme.io", timezone: "UTC" },
      preferences: { weeklyDigest: false, productUpdates: true },
    };
    const result = await updateSettingsRequest(payload);
    expect(result.profile.companyName).toBe("Acme");
  });

  it("reads the dashboard overview payload", async () => {
    const overview = await getOverviewRequest();
    expect(overview.kpis.length).toBeGreaterThan(0);
  });
});
