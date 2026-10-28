import type { PolicyLedger } from "@testbed/api-contracts";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type CommissionPanelProps = {
  entries: PolicyLedger["commissionEntries"];
  timing: "on_bind" | "as_earned";
  holdPeriodDays: number;
};

const timingCopy = (timing: CommissionPanelProps["timing"], holdPeriodDays: number) =>
  timing === "on_bind"
    ? "Written — payable when the policy binds"
    : `As earned — payable after ${holdPeriodDays} days`;

export const CommissionPanel = ({ entries, timing, holdPeriodDays }: CommissionPanelProps) => (
  <section
    aria-labelledby="commission-heading"
    className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-5"
  >
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--foreground-muted)]">
      {timing === "on_bind" ? "COM-001" : "COM-002"}
    </p>
    <h2 id="commission-heading" className="mt-1 text-lg font-semibold">
      Commission history
    </h2>
    <p className="mt-2 text-sm text-[var(--foreground-muted)]">
      {timingCopy(timing, holdPeriodDays)}
    </p>
    <p className="mt-2 text-sm text-[var(--foreground-muted)]">
      Append-only commission records. Refund adjustments apply only to allocated settled premiums.
    </p>
    {entries.length === 0 ? (
      <p className="mt-4 text-sm text-[var(--foreground-muted)]">No commission entries yet.</p>
    ) : (
      <ul className="mt-4 divide-y divide-[var(--border)]" aria-label="Commission entries">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-4 py-3 text-sm">
            <div>
              <p className="font-medium capitalize">{entry.kind.replaceAll("_", " ")}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-[var(--foreground-muted)]">
                {entry.status}
              </p>
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
