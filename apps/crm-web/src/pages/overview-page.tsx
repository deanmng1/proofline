import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CircleAlert, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import {
  ChartSkeleton,
  KpiGridSkeleton,
  ListSkeleton,
  TableSkeleton,
} from "@/components/shared/skeletons";
import { StatePanel } from "@/components/shared/state-panel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getOverviewRequest } from "@/features/overview/overview-api";
import { getTransactionsRequest } from "@/features/transactions/transactions-api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OverviewPayload, TransactionStatus } from "@/types";

const periodOptions = [
  { id: "3", label: "Last 3 months" },
  { id: "6", label: "Last 6 months" },
] as const;

type PeriodId = (typeof periodOptions)[number]["id"];

const salesByCategory = [
  { name: "Electronics", current: 4.6, previous: 3.1 },
  { name: "Apparel", current: 3.2, previous: 4.5 },
  { name: "Home", current: 4.1, previous: 2.8 },
  { name: "Groceries", current: 2.4, previous: 1.6 },
];

const demographics = [
  { name: "18-24", value: 22, color: "#3b82f6" },
  { name: "25-34", value: 35, color: "#60a5fa" },
  { name: "35-44", value: 27, color: "#93c5fd" },
  { name: "45+", value: 16, color: "#cbd5e1" },
];

const transactionTone: Record<TransactionStatus, string> = {
  succeeded: "bg-[var(--success-soft)] text-[var(--success)]",
  pending: "bg-[var(--surface-secondary)] text-[var(--foreground-muted)]",
  failed: "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]",
  refunded: "bg-[var(--surface-secondary)] text-[var(--foreground-muted)]",
};

export const OverviewPage = () => {
  const { t } = useTranslation();
  const [periodId, setPeriodId] = useState<PeriodId>("6");
  const [showCurrentSeries, setShowCurrentSeries] = useState(true);
  const [showPreviousSeries, setShowPreviousSeries] = useState(true);

  const overviewQuery = useQuery<OverviewPayload>({
    queryKey: ["overview"],
    queryFn: getOverviewRequest,
  });
  const transactionsQuery = useQuery({
    queryKey: ["transactions", "recent"],
    queryFn: () => getTransactionsRequest(),
  });
  const canRenderChart = typeof navigator === "undefined" || !/jsdom/i.test(navigator.userAgent);

  const recentTransactions = (transactionsQuery.data ?? []).slice(0, 5);

  const chartData = useMemo(() => {
    const data = overviewQuery.data?.chart ?? [];
    return data.slice(-Number(periodId));
  }, [overviewQuery.data, periodId]);

  if (overviewQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("overview.eyebrow")}
          title={t("overview.title")}
          description={t("overview.description")}
        />
        <KpiGridSkeleton />
        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.65fr]">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.7fr_0.8fr]">
          <TableSkeleton count={4} />
          <ChartSkeleton className="h-64 md:h-64" />
          <ListSkeleton count={3} />
        </div>
      </div>
    );
  }

  if (overviewQuery.isError || !overviewQuery.data) {
    return (
      <StatePanel
        kind="error"
        title="Could not load overview"
        description="The mock dashboard endpoint failed."
        onRetry={() => void overviewQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("overview.eyebrow")}
        title={t("overview.title")}
        description={t("overview.description")}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full gap-2 md:w-auto">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  {periodOptions.find((option) => option.id === periodId)?.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Chart period</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={periodId}
                  onValueChange={(value) => setPeriodId(value as PeriodId)}
                >
                  {periodOptions.map((option) => (
                    <DropdownMenuRadioItem key={option.id} value={option.id}>
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full gap-2 md:w-auto">
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  {t("overview.filters")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Sales by Category series</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={showCurrentSeries}
                  onCheckedChange={(checked) => setShowCurrentSeries(checked === true)}
                >
                  Current period
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={showPreviousSeries}
                  onCheckedChange={(checked) => setShowPreviousSeries(checked === true)}
                >
                  Previous period
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewQuery.data.kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.65fr]">
        <SectionCard tone="secondary" title="Monthly Sales & Revenue">
          {canRenderChart ? (
            <div
              className="h-64 md:h-80"
              role="img"
              aria-label="Area chart of monthly revenue in thousands of dollars"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" vertical />
                  <XAxis
                    dataKey="name"
                    stroke="var(--muted-foreground)"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${value / 1000}k`}
                  />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--chart-line)"
                    strokeWidth={2}
                    fill="url(#revenueFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          <table className="sr-only">
            <caption>Monthly revenue</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Revenue (USD)</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((point) => (
                <tr key={point.name}>
                  <td>{point.name}</td>
                  <td>{point.revenue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard tone="secondary" title="Sales by Category">
          {canRenderChart ? (
            <div
              className="h-64 md:h-80"
              role="img"
              aria-label="Bar chart comparing sales by category for the current and previous period"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByCategory} barGap={8}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="name"
                    stroke="var(--muted-foreground)"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                  <Tooltip />
                  {showCurrentSeries ? (
                    <Bar dataKey="current" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                  ) : null}
                  {showPreviousSeries ? (
                    <Bar dataKey="previous" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  ) : null}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          <table className="sr-only">
            <caption>Sales by category</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                {showCurrentSeries ? <th scope="col">Current period</th> : null}
                {showPreviousSeries ? <th scope="col">Previous period</th> : null}
              </tr>
            </thead>
            <tbody>
              {salesByCategory.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  {showCurrentSeries ? <td>{row.current}</td> : null}
                  {showPreviousSeries ? <td>{row.previous}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.7fr_0.8fr]">
        <SectionCard title="Recent Transactions" description="Latest payments from the ledger.">
          {transactionsQuery.isLoading ? (
            <TableSkeleton count={4} className="border-0 shadow-none" />
          ) : transactionsQuery.isError ? (
            <StatePanel
              kind="error"
              title="Could not load transactions"
              description="The mock transactions endpoint failed."
              onRetry={() => void transactionsQuery.refetch()}
            />
          ) : (
            <div className="overflow-hidden rounded-[0.75rem] border border-[var(--border)]">
              <div className="grid grid-cols-[1.4fr_1fr_0.8fr_0.9fr] gap-3 border-b border-[var(--border)] bg-[var(--surface-panel)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                <span>Customer</span>
                <span>Date</span>
                <span>Amount</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {recentTransactions.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1.4fr_1fr_0.8fr_0.9fr] gap-3 px-4 py-3 text-sm"
                  >
                    <span className="truncate font-medium text-[var(--foreground)]">
                      {row.customer}
                    </span>
                    <span className="truncate text-[var(--muted-foreground)]">{row.date}</span>
                    <span>{formatCurrency(row.amount)}</span>
                    <span>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-1 text-[11px] font-medium",
                          transactionTone[row.status],
                        )}
                      >
                        {row.status}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard tone="secondary" title="User Demographics">
          {canRenderChart ? (
            <div className="h-64" role="img" aria-label="Donut chart of users by age group">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={demographics}
                    dataKey="value"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {demographics.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-2">
            {demographics.map((entry) => (
              <div
                key={entry.name}
                className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                {entry.name} · {entry.value}%
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          tone="secondary"
          title="Platform Activity"
          description="Latest workspace events."
        >
          <div className="space-y-3">
            {overviewQuery.data.activity.map((item) => (
              <div
                key={item.id}
                className="flex gap-3 rounded-[0.9rem] border border-[var(--border)] bg-[var(--surface-panel)] px-4 py-3 text-sm text-[var(--foreground-muted)]"
              >
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                <div className="min-w-0">
                  <p className="text-sm text-[var(--foreground)]">{item.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    {item.subtitle} · {item.at}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
