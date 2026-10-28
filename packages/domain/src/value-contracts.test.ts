import { describe, expect, test } from "vitest";
import { immutableSnapshot } from "./snapshot";
import { assertUtcTimestamp } from "./timestamp";

describe("shared value contracts", () => {
  test("snapshot_owns_and_freezes_nested_arrays_without_freezing_the_caller", () => {
    const input = { allocations: [{ amount: 10 }], optional: undefined };
    const copy = immutableSnapshot(input);
    input.allocations[0].amount = 20;
    expect(copy.allocations[0].amount).toBe(10);
    expect(Reflect.set(copy.allocations[0], "amount", 30)).toBe(false);
    expect(() => Array.prototype.push.call(copy.allocations, { amount: 40 })).toThrow();
    expect(immutableSnapshot(undefined)).toBeUndefined();
    expect(immutableSnapshot(null)).toBeNull();
  });
  test.each([
    "2024-02-29T00:00:00Z",
    "2026-01-01T23:59:59.1Z",
    "2026-01-01T23:59:59.12Z",
    "2026-01-01T23:59:59.123Z",
  ])("accepts_explicit_UTC_%s", (value) => {
    expect(assertUtcTimestamp(value)).toBe(value);
  });
  test.each([
    "2026-02-29T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-01-01T25:00:00Z",
    "2026-01-01T00:60:00Z",
    "2026-01-01T00:00:60Z",
    "2026-01-01T00:00:00.0001Z",
    "2026-01-01T00:00:00",
    "2026-01-01T24:00:00Z",
    "2026-01-01T00:00:00-05:00",
  ])("rejects_non_UTC_or_invalid_calendar_value_%s", (value) => {
    expect(() => assertUtcTimestamp(value)).toThrow(/ISO-UTC timestamp/);
  });
  test("rejects_non_string_input_at_untyped_boundaries", () => {
    expect(() => assertUtcTimestamp(null as unknown as string)).toThrow(/ISO-UTC timestamp/);
  });
});
