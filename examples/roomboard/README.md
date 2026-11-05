# Roomboard

A small standalone room-reservation application built with React and Vite. Use Rooms to reserve Cedar or Maple for a fixed morning/afternoon slot, then Reservations to view or cancel it. An active reservation prevents another booking for the same room and slot. Cancelling makes that slot available again.

The application runs locally without a backend. Its state is in memory and resets on page reload. It has no authentication, roles, organizations, external providers or database. Stable command identifiers replay an accepted response and reject a changed payload under the same identifier.

Use Node 24.22.1 and pnpm 11.24.0:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

The development server listens on numeric loopback. Open its printed URL and use the Rooms and Reservations navigation links. Keep this as a local demonstration rather than a booking service for real meetings.
