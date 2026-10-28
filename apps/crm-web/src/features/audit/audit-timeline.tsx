import type { PolicyLedger } from "@testbed/api-contracts";

type AuditTimelineProps = {
  entries: PolicyLedger["auditEntries"];
};

export const AuditTimeline = ({ entries }: AuditTimelineProps) => (
  <section
    aria-labelledby="audit-heading"
    className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-5"
  >
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--foreground-muted)]">
      Audit trail
    </p>
    <h2 id="audit-heading" className="mt-1 text-lg font-semibold">
      Immutable event timeline
    </h2>
    {entries.length === 0 ? (
      <p className="mt-4 text-sm text-[var(--foreground-muted)]">No audit events are available.</p>
    ) : (
      <ol
        className="mt-4 space-y-3 border-l border-[var(--border)] pl-4"
        aria-label="Audit timeline"
      >
        {entries.map((entry) => (
          <li
            key={entry.sourceEventId}
            className="relative text-sm before:absolute before:-left-[1.34rem] before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-[var(--accent)]"
          >
            <p className="font-medium capitalize">{entry.type.replaceAll("_", " ")}</p>
            <p className="mt-1 text-xs text-[var(--foreground-muted)]">{entry.occurredAt}</p>
          </li>
        ))}
      </ol>
    )}
  </section>
);
