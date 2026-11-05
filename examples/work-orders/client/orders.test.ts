import { describe, expect, it } from "vitest";
import { createOrders } from "./orders.mjs";

describe("work order rules", () => {
  it("completes_a_request_once_and_replays_the_same_command", () => {
    const orders = createOrders();
    const actor = { role: "dispatcher", organization: "north" };
    const request = orders.list(actor)[0];
    expect(orders.complete(actor, request.id, "complete-1").state).toBe("completed");
    expect(orders.complete(actor, request.id, "complete-1").state).toBe("completed");
    expect(orders.snapshot().filter((order) => order.state === "completed")).toHaveLength(1);
    expect(() => orders.complete(actor, request.id, "complete-2")).toThrow("Already completed");
  });
  it("denies_observers_and_foreign_organizations_without_mutation", () => {
    const orders = createOrders();
    const north = { role: "dispatcher", organization: "north" };
    const south = { role: "dispatcher", organization: "south" };
    const id = orders.list(north)[0].id;
    expect(orders.list(south).every((order) => order.organization === "south")).toBe(true);
    expect(() => orders.complete(south, id, "foreign")).toThrow("Organization denied");
    expect(() => orders.complete({ ...north, role: "observer" }, id, "observe")).toThrow(
      "Role denied",
    );
    expect(() => orders.list(null)).toThrow("Authentication required");
    expect(() => orders.complete(north, "unknown", "missing")).toThrow("Request missing");
    expect(() => orders.complete(north, id, "")).toThrow("Command identity required");
    expect(orders.snapshot().every((order) => order.state === "requested")).toBe(true);
  });
});
