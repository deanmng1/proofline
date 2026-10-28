import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RecordFinanceEventInput } from "@testbed/api-contracts";
import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { StatePanel } from "@/components/shared/state-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuditTimeline } from "@/features/audit/audit-timeline";
import { getPolicyLedger, recordFinanceEvent } from "@/features/crm/crm-api";
import { useCommand } from "@/features/crm/use-command";
import { CommissionPanel } from "@/features/finance/commission-panel";
import { LedgerPanel } from "@/features/finance/ledger-panel";

type PolicyDetailPageProps = {
  policyId: string;
};

type FinanceEventType = Exclude<RecordFinanceEventInput["type"], "commission_paid">;
type AllocationRow = { allocationId: string; financeEntryId: string; amountCents: string };
const newAllocation = (): AllocationRow => ({
  allocationId: crypto.randomUUID(),
  financeEntryId: "",
  amountCents: "",
});

const eventLabels: Record<FinanceEventType, string> = {
  deposit_recorded: "Deposit received",
  premium_payment_settled: "Premium payment settled",
  refund_recorded: "Refund allocations",
  claim_payment_recorded: "Claim payment",
};

export const PolicyDetailPage = ({ policyId }: PolicyDetailPageProps) => {
  const queryClient = useQueryClient();
  const [eventType, setEventType] = useState<FinanceEventType>("deposit_recorded");
  const [amountCents, setAmountCents] = useState("");
  const [allocations, setAllocations] = useState<AllocationRow[]>(() => [newAllocation()]);
  const command = useCommand();
  const ledgerQuery = useQuery({
    queryKey: ["crm", "policy-ledger", policyId],
    queryFn: () => getPolicyLedger(policyId),
  });
  const recordMutation = useMutation({
    mutationFn: (input: RecordFinanceEventInput) => recordFinanceEvent(policyId, input),
    onSuccess: (ledger) => {
      command.complete();
      queryClient.setQueryData(["crm", "policy-ledger", policyId], ledger);
      setAmountCents("");
      setAllocations([newAllocation()]);
    },
  });

  if (ledgerQuery.isLoading) {
    return (
      <StatePanel
        kind="loading"
        title="Loading policy"
        description="Retrieving policy, finance, and commission history."
      />
    );
  }
  if (ledgerQuery.isError || !ledgerQuery.data) {
    return (
      <StatePanel
        kind="error"
        title="Policy unavailable"
        description="The policy ledger could not be loaded."
        onRetry={() => void ledgerQuery.refetch()}
      />
    );
  }

  const { policy, policyState, financeEntries, commissionEntries, auditEntries } = ledgerQuery.data;
  const refundSources = financeEntries
    .filter((entry) => entry.kind === "deposit" || entry.kind === "premium_payment")
    .map((entry) => ({
      ...entry,
      remaining:
        entry.amountCents +
        financeEntries
          .filter((refund) => refund.refundsFinanceEntryId === entry.id)
          .reduce((sum, refund) => sum + refund.amountCents, 0),
    }));
  const positiveCents = (value: string) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
  const allocationError = allocations.some(
    (row) => row.amountCents && !positiveCents(row.amountCents),
  )
    ? "Enter positive whole cents for each refund allocation."
    : refundSources.some(
          (source) =>
            allocations
              .filter((row) => row.financeEntryId === source.id)
              .reduce((sum, row) => sum + Number(row.amountCents), 0) > source.remaining,
        )
      ? "Refund allocations cannot exceed the source's remaining amount."
      : null;
  const canSubmit =
    eventType === "refund_recorded"
      ? allocations.length > 0 &&
        !allocationError &&
        allocations.every(
          (row) =>
            positiveCents(row.amountCents) &&
            refundSources.some((source) => source.id === row.financeEntryId),
        )
      : positiveCents(amountCents);
  const updateAllocation = (allocationId: string, update: Partial<AllocationRow>) => {
    setAllocations((rows) =>
      rows.map((row) => (row.allocationId === allocationId ? { ...row, ...update } : row)),
    );
  };
  const refundAllocations = allocations.map((row) => ({
    ...row,
    amountCents: Number(row.amountCents),
  }));
  const submittedRefund =
    recordMutation.isError && recordMutation.variables?.type === "refund_recorded"
      ? recordMutation.variables
      : null;
  // An accepted refund may already be reflected in a background ledger refresh.
  // Replay its captured command without applying the balance check for new refunds.
  const canRetryRefund =
    eventType === "refund_recorded" &&
    submittedRefund !== null &&
    JSON.stringify(refundAllocations) === JSON.stringify(submittedRefund.allocations);
  const submitFinanceEvent = () => {
    if (!canSubmit) return;
    const cents = Number(amountCents);
    if (eventType === "refund_recorded") {
      recordMutation.mutate(
        command.prepare({
          type: eventType,
          allocations: refundAllocations,
        }),
      );
      return;
    }
    recordMutation.mutate(command.prepare({ type: eventType, amountCents: cents }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={policy.product === "risk_secure" ? "Risk Secure" : "Risk Secure Plus"}
        title={`Policy ${policy.id}`}
        description="Historical records are immutable. Record a correcting event instead of editing a past entry."
      />
      <p role="status" aria-label="Policy State">
        Policy State: {policyState.lifecycle}
      </p>
      <section className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold">Record a finance event</h2>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          Deposits and claim payments do not create commission. Settled premium payments follow the
          policy plan.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div className="grid gap-2">
            <Label htmlFor="finance-event">Finance event</Label>
            <select
              id="finance-event"
              value={eventType}
              onChange={(event) => setEventType(event.target.value as FinanceEventType)}
              className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            >
              {(Object.entries(eventLabels) as [FinanceEventType, string][]).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </div>
          {eventType === "refund_recorded" ? (
            <fieldset className="grid gap-3" disabled={recordMutation.isPending}>
              <legend>Refund allocations</legend>
              {allocations.map((row, index) => (
                <div className="grid gap-2" key={row.allocationId}>
                  <Label htmlFor={`refund-source-${row.allocationId}`}>
                    Refund source {index + 1}
                  </Label>
                  <select
                    id={`refund-source-${row.allocationId}`}
                    value={row.financeEntryId}
                    onChange={(event) =>
                      updateAllocation(row.allocationId, { financeEntryId: event.target.value })
                    }
                    className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                  >
                    <option value="">Select a finance entry</option>
                    {refundSources.map((source) => (
                      <option key={source.id} value={source.id} disabled={source.remaining <= 0}>
                        {source.kind === "deposit" ? "Deposit" : "Premium payment"} —{" "}
                        {source.remaining} cents remaining
                      </option>
                    ))}
                  </select>
                  <Label htmlFor={`refund-amount-${row.allocationId}`}>
                    Refund amount in cents {index + 1}
                  </Label>
                  <Input
                    id={`refund-amount-${row.allocationId}`}
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={row.amountCents}
                    onChange={(event) =>
                      updateAllocation(row.allocationId, { amountCents: event.target.value })
                    }
                  />
                  <Button
                    type="button"
                    onClick={() =>
                      setAllocations((rows) =>
                        rows.filter((entry) => entry.allocationId !== row.allocationId),
                      )
                    }
                  >
                    Remove allocation {index + 1}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                onClick={() => setAllocations((rows) => [...rows, newAllocation()])}
              >
                Add refund allocation
              </Button>
              {allocationError ? <p role="alert">{allocationError}</p> : null}
            </fieldset>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="finance-amount">Amount in cents</Label>
              <Input
                id="finance-amount"
                type="number"
                min="1"
                required
                value={amountCents}
                onChange={(event) => setAmountCents(event.target.value)}
              />
            </div>
          )}
          <Button
            type="button"
            disabled={!canSubmit || recordMutation.isPending}
            onClick={submitFinanceEvent}
          >
            Record finance event
          </Button>
        </div>
        {recordMutation.isError ? (
          <p className="mt-3 text-sm text-rose-600" role="alert">
            Finance event could not be recorded.
          </p>
        ) : null}
        {submittedRefund ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-[var(--foreground-muted)]">
              Retry the previously submitted refund with its allocations unchanged.
            </p>
            <Button
              type="button"
              disabled={!canRetryRefund}
              onClick={() => {
                if (canRetryRefund) recordMutation.mutate(submittedRefund);
              }}
            >
              Retry finance event
            </Button>
          </div>
        ) : null}
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <LedgerPanel entries={financeEntries} />
        <CommissionPanel
          entries={commissionEntries}
          timing={policy.commissionPlan.timing}
          holdPeriodDays={policy.commissionPlan.holdPeriodDays}
        />
      </div>
      <AuditTimeline entries={auditEntries} />
    </div>
  );
};
