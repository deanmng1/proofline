/** @typedef {{id: string, roomId: string, slot: string, contact: string, status: 'active'|'cancelled'}} Reservation */
/** @typedef {{fingerprint: string, reservation: Reservation}} Receipt */
/** @typedef {{reservations: Reservation[], receipts: Record<string, Receipt>, sequence: number}} RoomboardState */

export const ROOMS = [
  { id: "cedar", name: "Cedar Room", capacity: 4 },
  { id: "maple", name: "Maple Room", capacity: 8 },
];
export const SLOTS = ["Morning", "Afternoon"];

/** @returns {RoomboardState} */
export const createRoomboardState = () => ({ reservations: [], receipts: {}, sequence: 0 });

/** @param {string} commandId */
const validateIdentity = (commandId) => {
  if (typeof commandId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(commandId))
    throw new Error("A stable command id is required.");
};

/** @param {RoomboardState} state @param {string} commandId @param {string} fingerprint */
const replay = (state, commandId, fingerprint) => {
  const prior = Object.hasOwn(state.receipts, commandId) ? state.receipts[commandId] : undefined;
  if (!prior) return null;
  if (prior.fingerprint !== fingerprint)
    throw new Error("Command id was already used for a different request.");
  return { state, reservation: { ...prior.reservation }, replayed: true };
};

/** @param {RoomboardState} state @param {{commandId: string, roomId: string, slot: string, contact: string}} input */
export const reserveRoom = (state, input) => {
  validateIdentity(input.commandId);
  if (!ROOMS.some((room) => room.id === input.roomId)) throw new Error("Choose an existing room.");
  if (!SLOTS.includes(input.slot)) throw new Error("Choose an available time slot.");
  const contact = typeof input.contact === "string" ? input.contact.trim() : "";
  if (!contact || contact.length > 64)
    throw new Error("Enter a contact name of 1 to 64 characters.");
  const fingerprint = JSON.stringify(["reserve", input.roomId, input.slot, contact]);
  const prior = replay(state, input.commandId, fingerprint);
  if (prior) return prior;
  if (
    state.reservations.some(
      (row) => row.roomId === input.roomId && row.slot === input.slot && row.status === "active",
    )
  )
    throw new Error("That room is already reserved for this time slot.");
  /** @type {Reservation} */
  const reservation = {
    id: `reservation-${state.sequence + 1}`,
    roomId: input.roomId,
    slot: input.slot,
    contact,
    status: "active",
  };
  return {
    state: {
      sequence: state.sequence + 1,
      reservations: [...state.reservations, reservation],
      receipts: { ...state.receipts, [input.commandId]: { fingerprint, reservation } },
    },
    reservation,
    replayed: false,
  };
};

/** @param {RoomboardState} state @param {{commandId: string, reservationId: string}} input */
export const cancelReservation = (state, input) => {
  validateIdentity(input.commandId);
  const fingerprint = JSON.stringify(["cancel", input.reservationId]);
  const prior = replay(state, input.commandId, fingerprint);
  if (prior) return prior;
  const current = state.reservations.find((row) => row.id === input.reservationId);
  if (!current) throw new Error("Reservation not found.");
  /** @type {Reservation} */
  const reservation = { ...current, status: "cancelled" };
  return {
    state: {
      ...state,
      reservations: state.reservations.map((row) => (row.id === current.id ? reservation : row)),
      receipts: { ...state.receipts, [input.commandId]: { fingerprint, reservation } },
    },
    reservation,
    replayed: false,
  };
};
