import { expect, test } from "vitest";
import { cancelReservation, createRoomboardState, reserveRoom } from "./model.mjs";

const request = { commandId: "reserve-1", roomId: "cedar", slot: "Morning", contact: "Casey" };

test("reserves an available room without mutating its prior state", () => {
  const before = createRoomboardState();
  const result = reserveRoom(before, request);
  expect(before.reservations).toEqual([]);
  expect(result.reservation).toEqual({
    id: "reservation-1",
    roomId: "cedar",
    slot: "Morning",
    contact: "Casey",
    status: "active",
  });
  expect(result.state.reservations).toEqual([result.reservation]);
});

test("rejects an active room and slot conflict without consuming an identity", () => {
  const first = reserveRoom(createRoomboardState(), request);
  expect(() => reserveRoom(first.state, { ...request, commandId: "reserve-2" })).toThrow(
    "already reserved",
  );
  const next = reserveRoom(first.state, { ...request, commandId: "reserve-3", slot: "Afternoon" });
  expect(next.reservation.id).toBe("reservation-2");
  expect(first.state.reservations).toHaveLength(1);
});

test("replays the same accepted command and rejects a changed payload", () => {
  const first = reserveRoom(createRoomboardState(), request);
  const replay = reserveRoom(first.state, request);
  expect(replay.replayed).toBe(true);
  expect(replay.reservation).toEqual(first.reservation);
  expect(replay.state).toBe(first.state);
  expect(replay.state.reservations).toHaveLength(1);
  expect(() => reserveRoom(first.state, { ...request, contact: "Taylor" })).toThrow(
    "different request",
  );
});

test("cancels a reservation and releases its slot for a new booking", () => {
  const first = reserveRoom(createRoomboardState(), request);
  const cancelled = cancelReservation(first.state, {
    commandId: "cancel-1",
    reservationId: first.reservation.id,
  });
  expect(first.reservation.status).toBe("active");
  expect(cancelled.reservation.status).toBe("cancelled");
  const next = reserveRoom(cancelled.state, { ...request, commandId: "reserve-2" });
  expect(next.state.reservations.map((row) => row.status)).toEqual(["cancelled", "active"]);
});

test("replays cancellation and keeps a second cancellation harmless", () => {
  const first = reserveRoom(createRoomboardState(), request);
  const command = { commandId: "cancel-1", reservationId: first.reservation.id };
  const cancelled = cancelReservation(first.state, command);
  expect(cancelReservation(cancelled.state, command).replayed).toBe(true);
  const again = cancelReservation(cancelled.state, { ...command, commandId: "cancel-2" });
  expect(again.reservation.status).toBe("cancelled");
  expect(again.state.reservations).toHaveLength(1);
});

test("rejects invalid input and unknown cancellation targets", () => {
  const before = createRoomboardState();
  for (const invalid of [
    { ...request, commandId: "" },
    { ...request, roomId: "unknown" },
    { ...request, slot: "Midnight" },
    { ...request, contact: "  " },
  ]) {
    expect(() => reserveRoom(before, invalid)).toThrow();
  }
  expect(() =>
    cancelReservation(before, { commandId: "cancel-1", reservationId: "missing" }),
  ).toThrow("not found");
  expect(before.reservations).toEqual([]);
});
