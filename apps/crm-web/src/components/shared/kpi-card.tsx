import {
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  FolderKanban,
  TrendingUp,
  UserRoundPlus,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardKpi } from "@/types";

const canRenderChart = typeof navigator === "undefined" || !/jsdom/i.test(navigator.userAgent);

const formatValue = (kpi: DashboardKpi) => {
  if (kpi.label === "ARR") {
    return formatCurrency(kpi.value);
  }
  if (kpi.label === "Retention") {
    return `${kpi.value}%`;
  }
  return formatNumber(kpi.value);
};

const getMeta = (kpi: DashboardKpi) => {
  if (kpi.label === "ARR") {
    return {
      title: "Total Revenue",
      icon: DollarSign,
      tone: "bg-[var(--success-soft)] text-[var(--success)]",
    };
  }

  if (kpi.label === "Active Accounts") {
    return {
      title: "New Users",
      icon: UserRoundPlus,
      tone: "bg-[rgba(59,130,246,0.12)] text-[var(--accent)]",
    };
  }

  if (kpi.label === "Retention") {
    return {
      title: "Active Projects",
      icon: FolderKanban,
      tone: "bg-[rgba(249,115,22,0.12)] text-[#ea580c]",
    };
  }

  return {
    title: "Conversion Rate",
    icon: TrendingUp,
    tone: "bg-[rgba(34,197,94,0.12)] text-[#16a34a]",
  };
};

export const KpiCard = ({ kpi }: { kpi: DashboardKpi }) => {
  const positive = kpi.change >= 0;
  const TrendIcon = positive ? ArrowUpRight : ArrowDownRight;
  const meta = getMeta(kpi);
  const MetaIcon = meta.icon;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">{meta.title}</p>
              <p className="mt-2 text-[1.95rem] font-semibold leading-none tracking-[-0.05em] text-[var(--foreground)]">
                {formatValue(kpi)}
              </p>
            </div>
            <span
              className={cn("flex h-10 w-10 items-center justify-center rounded-lg", meta.tone)}
            >
              <MetaIcon className="h-4 w-4" />
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={positive ? "text-[var(--success)]" : "text-[var(--danger)]"}>
              <TrendIcon className="mr-1 inline-block h-4 w-4" />
              {formatPercent(kpi.change)}
            </span>
            <span className="text-[var(--muted-foreground)]">vs last month</span>
          </div>
          {canRenderChart ? (
            <div className="-mx-1 -mb-1 h-9" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={kpi.spark.map((value) => ({ value }))}>
                  <defs>
                    <linearGradient id={`spark-${kpi.id}`} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--accent)"
                    strokeWidth={1.5}
                    fill={`url(#spark-${kpi.id})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};
