import { useRef } from "react";

// A failed submit keeps its identity until the payload changes or it succeeds.
// This also preserves identity when the server accepted a command but its response was lost.
export function useCommand() {
  const pending = useRef<{
    fingerprint: string;
    commandId: string;
    correlationId: string;
  } | null>(null);
  return {
    prepare<T extends object>(payload: T) {
      const fingerprint = JSON.stringify(payload);
      if (pending.current?.fingerprint !== fingerprint) {
        pending.current = {
          fingerprint,
          commandId: crypto.randomUUID(),
          correlationId: crypto.randomUUID(),
        };
      }
      return {
        ...payload,
        commandId: pending.current.commandId,
        correlationId: pending.current.correlationId,
      };
    },
    complete() {
      pending.current = null;
    },
  };
}
