import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type Column, DataTable } from "@/components/shared/data-table";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { KpiGridSkeleton, TableSkeleton } from "@/components/shared/skeletons";
import { StatePanel } from "@/components/shared/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { changePlanRequest, getBillingRequest } from "@/features/billing/billing-api";
import { formatCurrency } from "@/lib/format";
import type { BillingPayload, Invoice, InvoiceStatus, PlanTier } from "@/types";

const invoiceStatusVariant: Record<InvoiceStatus, "success" | "warning" | "outline"> = {
  paid: "success",
  open: "warning",
  void: "outline",
};

export const BillingPage = () => {
  const queryClient = useQueryClient();
  const billingQuery = useQuery<BillingPayload>({
    queryKey: ["billing"],
    queryFn: getBillingRequest,
  });

  const changePlan = useMutation({
    mutationFn: (planId: string) => changePlanRequest(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      toast.success("Plan updated");
    },
    onError: () => toast.error("Could not change plan"),
  });

  if (billingQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Billing"
          title="Plans, usage and invoices"
          description="Manage the active subscription, compare tiers and pull historical invoices."
        />
        <KpiGridSkeleton count={3} className="xl:grid-cols-3" />
        <TableSkeleton count={5} />
      </div>
    );
  }

  if (billingQuery.isError || !billingQuery.data) {
    return (
      <StatePanel
        kind="error"
        title="Billing unavailable"
        description="The billing endpoint failed."
        onRetry={() => void billingQuery.refetch()}
      />
    );
  }

  const { subscription, plans, invoices } = billingQuery.data;

  const invoiceColumns: Column<Invoice>[] = [
    {
      key: "number",
      header: "Invoice",
      sortValue: (row) => row.number,
      render: (row) => <span className="font-medium text-[var(--foreground)]">{row.number}</span>,
    },
    {
      key: "issuedAt",
      header: "Issued",
      sortValue: (row) => row.issuedAt,
      render: (row) => row.issuedAt,
    },
    {
      key: "amount",
      header: "Amount",
      sortValue: (row) => row.amount,
      render: (row) => formatCurrency(row.amount),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge variant={invoiceStatusVariant[row.status]}>{row.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billing"
        title="Plans, usage and invoices"
        description="Manage the active subscription, compare tiers and pull historical invoices."
        actions={<Button variant="outline">Download overview</Button>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          kpi={{
            id: "mrr",
            label: "MRR",
            value: plans.find((p) => p.id === subscription.planId)?.priceMonthly ?? 0,
            change: 0,
            tone: "positive",
            spark: [149, 149, 149, 199, 199, 199],
          }}
        />
        <KpiCard
          kpi={{
            id: "seats",
            label: "Seats used",
            value: subscription.seatsUsed,
            change: 0,
            tone: "neutral",
            spark: [12, 13, 14, 15, 16, 17, 18],
          }}
        />
        <KpiCard
          kpi={{
            id: "usage",
            label: "Usage",
            value: subscription.usagePercent,
            change: 0,
            tone: "positive",
            spark: [48, 52, 55, 60, 66, 72],
          }}
        />
      </div>

      <SectionCard tone="primary" title="Current subscription">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-[var(--foreground)]">
                {subscription.planName}
              </p>
              <p className="text-sm text-[var(--muted-foreground)]">
                Renews {subscription.renewsAt} · {subscription.seatsUsed}/{subscription.seatsTotal}{" "}
                seats
              </p>
            </div>
            <Badge variant={subscription.status === "active" ? "success" : "warning"}>
              {subscription.status}
            </Badge>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${subscription.usagePercent}%` }}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Compare plans"
        description="Switch tiers instantly in this mock workspace."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan: PlanTier) => (
            <div
              key={plan.id}
              className="flex flex-col justify-between rounded-[1rem] border border-[var(--border)] bg-[var(--surface-panel)] p-5"
              data-tone={plan.highlighted ? "primary" : undefined}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[var(--foreground)]">{plan.name}</p>
                  {plan.highlighted ? <Badge variant="success">Current</Badge> : null}
                </div>
                <p className="text-[1.6rem] font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                  {formatCurrency(plan.priceMonthly)}
                  <span className="text-sm font-normal text-[var(--muted-foreground)]">/mo</span>
                </p>
                <ul className="space-y-1 text-sm text-[var(--foreground-muted)]">
                  {plan.features.map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>
              </div>
              <Button
                variant={plan.highlighted ? "outline" : "default"}
                className="mt-4 w-full"
                disabled={plan.id === subscription.planId || changePlan.isPending}
                onClick={() => changePlan.mutate(plan.id)}
              >
                {plan.id === subscription.planId ? "Active plan" : "Switch to this plan"}
              </Button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Invoices" description="Recent billing documents.">
        <DataTable
          columns={invoiceColumns}
          rows={invoices}
          getRowKey={(row) => row.id}
          caption={`${invoices.length} invoices`}
        />
      </SectionCard>
    </div>
  );
};
