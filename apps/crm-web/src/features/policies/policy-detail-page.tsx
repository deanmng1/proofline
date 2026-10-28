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
import { CommissionPanel } from "@/features/finance/commission-panel";
import { LedgerPanel } from "@/features/finance/ledger-panel";

type PolicyDetailPageProps = {
  policyId: string;
};

type FinanceEventType = RecordFinanceEventInput["type"];

const eventLabels: Record<FinanceEventType, string> = {
  deposit_recorded: "Deposit received",
  premium_payment_settled: "Premium payment settled",
  refund_recorded: "Cumulative refund",
  claim_payment_recorded: "Claim payment",
};

export const PolicyDetailPage = ({ policyId }: PolicyDetailPageProps) => {
  const queryClient = useQueryClient();
  const [eventType, setEventType] = useState<FinanceEventType>("deposit_recorded");
  const [amountCents, setAmountCents] = useState("");
  const ledgerQuery = useQuery({
    queryKey: ["crm", "policy-ledger", policyId],
    queryFn: () => getPolicyLedger(policyId),
  });
  const recordMutation = useMutation({
    mutationFn: (input: RecordFinanceEventInput) => recordFinanceEvent(policyId, input),
    onSuccess: (ledger) => {
      queryClient.setQueryData(["crm", "policy-ledger", policyId], ledger);
      setAmountCents("");
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

  const { policy, financeEntries, commissionEntries, auditEntries } = ledgerQuery.data;
  const submitFinanceEvent = () => {
    const cents = Number(amountCents);
    if (eventType === "refund_recorded") {
      recordMutation.mutate({ type: eventType, totalRefundedCents: cents });
      return;
    }
    recordMutation.mutate({ type: eventType, amountCents: cents });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={policy.product === "risk_secure" ? "Risk Secure" : "Risk Secure Plus"}
        title={`Policy ${policy.id}`}
        description="Historical records are immutable. Record a correcting event instead of editing a past entry."
      />
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
          <Button
            type="button"
            disabled={!amountCents || recordMutation.isPending}
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
