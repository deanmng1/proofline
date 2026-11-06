import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { cancelReservation, createRoomboardState, ROOMS, reserveRoom, SLOTS } from "./model.mjs";
import "./styles.css";

function Roomboard() {
  const [state, setState] = useState(createRoomboardState);
  const [route, setRoute] = useState(window.location.pathname);
  const [roomId, setRoomId] = useState(ROOMS[0].id);
  const [slot, setSlot] = useState(SLOTS[0]);
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const nextCommand = useRef(1);
  useEffect(() => {
    const changed = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, []);

  const navigate = (event, destination) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    window.history.pushState(null, "", destination);
    setRoute(destination);
    setMessage("");
    setError("");
  };
  const book = (event) => {
    event.preventDefault();
    try {
      const result = reserveRoom(state, {
        commandId: `ui-${nextCommand.current++}`,
        roomId,
        slot,
        contact,
      });
      setState(result.state);
      setMessage(`Reserved ${ROOMS.find((room) => room.id === roomId)?.name} for ${slot}.`);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reservation could not be created.");
      setMessage("");
    }
  };
  const cancel = (reservationId) => {
    try {
      const result = cancelReservation(state, {
        commandId: `ui-${nextCommand.current++}`,
        reservationId,
      });
      setState(result.state);
      setMessage("Reservation cancelled. The room is available again.");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cancellation failed.");
    }
  };
  const reservationsPage = route === "/reservations";
  return (
    <div className="shell">
      <header>
        <a className="brand" href="/rooms" onClick={(event) => navigate(event, "/rooms")}>
          Roomboard
        </a>
        <nav aria-label="Main navigation">
          <a
            href="/rooms"
            aria-current={!reservationsPage ? "page" : undefined}
            onClick={(event) => navigate(event, "/rooms")}
          >
            Rooms
          </a>
          <a
            href="/reservations"
            aria-current={reservationsPage ? "page" : undefined}
            onClick={(event) => navigate(event, "/reservations")}
          >
            Reservations
          </a>
        </nav>
      </header>
      <main>
        <p className="eyebrow">A little space for your next meeting</p>
        <h1>{reservationsPage ? "Your reservations" : "Find a room"}</h1>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {reservationsPage ? (
          <section aria-label="Reservation list">
            {state.reservations.length === 0 && (
              <p>No reservations yet. Choose a room to get started.</p>
            )}
            {state.reservations.map((row) => (
              <article key={row.id} aria-label={`${row.contact} reservation`}>
                <h2>{ROOMS.find((room) => room.id === row.roomId)?.name}</h2>
                <p>
                  {row.contact} · {row.slot}
                </p>
                <p>Status: {row.status}</p>
                {row.status === "active" && (
                  <button type="button" onClick={() => cancel(row.id)}>
                    Cancel reservation
                  </button>
                )}
              </article>
            ))}
          </section>
        ) : (
          <>
            <section className="rooms" aria-label="Available rooms">
              {ROOMS.map((room) => (
                <article key={room.id}>
                  <h2>{room.name}</h2>
                  <p>Seats {room.capacity}</p>
                  {SLOTS.map((choice) => (
                    <p key={choice}>
                      {choice}:{" "}
                      {state.reservations.some(
                        (row) =>
                          row.roomId === room.id && row.slot === choice && row.status === "active",
                      )
                        ? "Reserved"
                        : "Available"}
                    </p>
                  ))}
                </article>
              ))}
            </section>
            <form onSubmit={book}>
              <h2>Reserve a room</h2>
              <label>
                Room
                <select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
                  {ROOMS.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Time slot
                <select value={slot} onChange={(event) => setSlot(event.target.value)}>
                  {SLOTS.map((choice) => (
                    <option key={choice}>{choice}</option>
                  ))}
                </select>
              </label>
              <label>
                Contact name
                <input
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  required
                  maxLength={64}
                />
              </label>
              <button type="submit">Reserve room</button>
            </form>
          </>
        )}
      </main>
      <footer>Local demonstration. Reservations reset when you reload this page.</footer>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Roomboard root element is missing.");
createRoot(root).render(<Roomboard />);
