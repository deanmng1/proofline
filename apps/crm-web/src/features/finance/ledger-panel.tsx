import type { PolicyLedger } from "@testbed/api-contracts";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type LedgerPanelProps = {
  entries: PolicyLedger["financeEntries"];
};

export const LedgerPanel = ({ entries }: LedgerPanelProps) => (
  <section
    aria-labelledby="ledger-heading"
    className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-5"
  >
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--foreground-muted)]">
          FIN-001
        </p>
        <h2 id="ledger-heading" className="mt-1 text-lg font-semibold">
          Append-only finance ledger
        </h2>
      </div>
      <span className="text-sm text-[var(--foreground-muted)]">{entries.length} events</span>
    </div>
    {entries.length === 0 ? (
      <p className="mt-4 text-sm text-[var(--foreground-muted)]">No finance events recorded yet.</p>
    ) : (
      <ul className="mt-4 divide-y divide-[var(--border)]" aria-label="Finance ledger entries">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-4 py-3 text-sm">
            <div>
              <p className="font-medium capitalize">{entry.kind.replaceAll("_", " ")}</p>
              <p className="mt-1 text-xs text-[var(--foreground-muted)]">{entry.sourceEventId}</p>
            </div>
            <span
              className={entry.amountCents < 0 ? "font-semibold text-rose-600" : "font-semibold"}
            >
              {money.format(entry.amountCents / 100)}
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
);
