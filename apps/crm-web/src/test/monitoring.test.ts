import { afterEach, describe, expect, it, vi } from "vitest";
import { initMonitoring, reportError, reportEvent } from "@/lib/monitoring";

describe("monitoring", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports errors to the console fallback when no DSN is configured", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportError(new Error("boom"), { route: "/app/overview" });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain("[monitoring] error");
  });

  it("reports events to the console fallback when no DSN is configured", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    reportEvent("page_view", { path: "/app/overview" });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain("[monitoring] event");
  });

  it("initializes without throwing in the test environment", async () => {
    await expect(initMonitoring()).resolves.toBeUndefined();
  });

  it("forwards window errors through the reporter", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await initMonitoring();

    window.dispatchEvent(new ErrorEvent("error", { message: "global boom" }));

    expect(spy).toHaveBeenCalled();
  });
});
