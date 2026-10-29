// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

const { render, initMonitoring } = vi.hoisted(() => ({
  render: vi.fn(),
  initMonitoring: vi.fn(async () => undefined),
}));

vi.mock("react-dom/client", () => ({
  default: { createRoot: () => ({ render }) },
}));
vi.mock("@/lib/monitoring", () => ({ initMonitoring }));

import { bootstrapApp } from "@/bootstrap";

describe("CRM application bootstrap", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    render.mockClear();
    initMonitoring.mockClear();
  });

  test("production_bootstrap_initializes_monitoring", () => {
    bootstrapApp({ testMode: false });
    expect(initMonitoring).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  test("test_bootstrap_never_initializes_monitoring", () => {
    bootstrapApp({ testMode: true });
    expect(initMonitoring).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
  });
});
