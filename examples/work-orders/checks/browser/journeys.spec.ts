import { expect, test } from "./scenario.mjs";

test("navigates_requests_to_completed_and_revokes_the_session", { tag: "@desk-golden" }, async ({
  scenario,
}) => {
  const { page } = await scenario.createContext();
  await page.goto(`${scenario.origin}/desk/requests`);
  await expect(page.getByRole("heading", { name: "Work desk sign in" })).toBeVisible();
  await page.getByLabel("Desk identity").fill("dispatch-north");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/desk\/requests$/);
  await expect(page.getByRole("heading", { name: "Requested work" })).toBeVisible();
  await page.getByRole("button", { name: "Complete Replace lobby lamp" }).click();
  await expect(page.getByRole("button", { name: "Complete Replace lobby lamp" })).toHaveCount(0);
  await page.getByRole("link", { name: "Completed", exact: true }).click();
  await expect(page).toHaveURL(/\/desk\/completed$/);
  await expect(page.getByRole("heading", { name: "Completed work" })).toBeVisible();
  await expect(page.getByText("Replace lobby lamp", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto(`${scenario.origin}/desk/completed`);
  await expect(page.getByRole("heading", { name: "Work desk sign in" })).toBeVisible();
  expect(scenario.snapshot().filter((order) => order.state === "completed")).toHaveLength(1);
});

test("denies_observer_navigation_and_commands", { tag: "@desk-authority" }, async ({
  scenario,
}) => {
  const { page } = await scenario.createContext();
  await page.goto(`${scenario.origin}/desk/requests`);
  await page.getByLabel("Desk identity").fill("observe-north");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Permission denied" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Requests", exact: true })).toHaveCount(0);
  await page.goto(`${scenario.origin}/desk/unknown`);
  await expect(page.getByRole("heading", { name: "Permission denied" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete Replace lobby lamp" })).toHaveCount(0);
  expect(scenario.mutations()).toBe(0);
  const status = await page.evaluate(
    async () =>
      (
        await fetch("/work-api/orders/north-1/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ commandId: "observer-denied" }),
        })
      ).status,
  );
  expect(status).toBe(403);
  expect(scenario.snapshot().every((order) => order.state === "requested")).toBe(true);
});

test("isolates_two_organizations_in_one_runtime", { tag: "@desk-organizations" }, async ({
  scenario,
}) => {
  for (const organization of ["north", "south"]) {
    const { page } = await scenario.createContext();
    await page.goto(`${scenario.origin}/desk/requests`);
    await page.getByLabel("Desk identity").fill(`dispatch-${organization}`);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const own = organization === "north" ? "Replace lobby lamp" : "Inspect loading door";
    const foreign = organization === "north" ? "Inspect loading door" : "Replace lobby lamp";
    await expect(page.getByText(foreign, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: `Complete ${own}` }).click();
    await page.getByRole("link", { name: "Completed", exact: true }).click();
    await expect(page.getByText(own, { exact: true })).toBeVisible();
    const status = await page.evaluate(
      async (id) =>
        (
          await fetch(`/work-api/orders/${id}/complete`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ commandId: "foreign-denied" }),
          })
        ).status,
      organization === "north" ? "south-1" : "north-1",
    );
    expect(status).toBe(403);
  }
  expect(scenario.snapshot().filter((order) => order.state === "completed")).toHaveLength(2);
});

test("denies_undeclared_browser_egress_planes", { tag: "@desk-egress" }, async ({ scenario }) => {
  const { page } = await scenario.createContext();
  await page.goto(`${scenario.origin}/desk/requests`);
  const failures = await page.evaluate(async () => {
    const pageDenied = await fetch("https://unconfigured.invalid/page").then(
      () => false,
      () => true,
    );
    const workerDenied = (["Worker", "SharedWorker"] as const).every((name) => {
      try {
        new globalThis[name]("/unsupported-worker.js");
        return false;
      } catch (error) {
        return String(error).includes(`PROOFLINE_UNSUPPORTED_PLANE plane=${name}`);
      }
    });
    const websocketDenied = await new Promise((resolve) => {
      const socket = new WebSocket("wss://unconfigured.invalid/socket");
      socket.onclose = () => resolve(true);
      socket.onerror = () => resolve(true);
      socket.onopen = () => {
        socket.close();
        resolve(false);
      };
    });
    await navigator.serviceWorker.register("/unsupported-worker.js").catch(() => undefined);
    const registrations = await navigator.serviceWorker.getRegistrations();
    return { pageDenied, workerDenied, websocketDenied, serviceWorkers: registrations.length };
  });
  expect(failures).toEqual({
    pageDenied: true,
    workerDenied: true,
    websocketDenied: true,
    serviceWorkers: 0,
  });
  const denied = scenario.acknowledgeDenials();
  expect(denied.map((entry) => entry.method).sort()).toEqual(["GET", "WEBSOCKET"]);
  expect(denied.every((entry) => entry.scenario === scenario.id && entry.trace)).toBe(true);
});
