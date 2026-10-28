import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { ChartSkeleton } from "@/components/shared/skeletons";
import { StatePanel } from "@/components/shared/state-panel";
import { getAnalyticsRequest } from "@/features/analytics/analytics-api";
import { getOverviewRequest } from "@/features/overview/overview-api";

const canRenderChart = typeof navigator === "undefined" || !/jsdom/i.test(navigator.userAgent);

const DONUT_COLORS = ["var(--accent)", "#818cf8", "#cbd5e1", "#94a3b8"];

const chartFrame = (label: string, content: React.ReactNode) =>
  canRenderChart ? (
    <div className="h-64" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {content}
      </ResponsiveContainer>
    </div>
  ) : null;

const SrTable = ({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
}) => (
  <table className="sr-only">
    <caption>{caption}</caption>
    <thead>
      <tr>
        {head.map((cell) => (
          <th key={cell} scope="col">
            {cell}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={row.join("|")}>
          {row.map((cell, index) => (
            <td key={`${row[0]}-${head[index]}`}>{cell}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

const gridStroke = "var(--chart-grid)";
const axisProps = {
  stroke: "var(--muted-foreground)",
  tickLine: false,
  axisLine: false,
} as const;

export const DataChartsPage = () => {
  const overviewQuery = useQuery({ queryKey: ["overview"], queryFn: getOverviewRequest });
  const analyticsQuery = useQuery({ queryKey: ["analytics"], queryFn: getAnalyticsRequest });

  const loading = overviewQuery.isLoading || analyticsQuery.isLoading;
  const error = overviewQuery.isError || analyticsQuery.isError;

  const retry = () => {
    void overviewQuery.refetch();
    void analyticsQuery.refetch();
  };

  const revenue = overviewQuery.data?.chart ?? [];
  const mrr = analyticsQuery.data?.mrr ?? [];
  const channels = analyticsQuery.data?.channels ?? [];
  const funnel = analyticsQuery.data?.funnel ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data & Charts"
        title="Charts"
        description="Recharts gallery with accessible alternatives — every chart ships a screen-reader data table."
      />

      {loading ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      ) : error ? (
        <StatePanel
          kind="error"
          title="Could not load chart data"
          description="A mock analytics endpoint failed."
          onRetry={retry}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Area — monthly revenue" description="Overview endpoint">
            {chartFrame(
              "Area chart of monthly revenue in thousands of dollars",
              <AreaChart data={revenue}>
                <defs>
                  <linearGradient id="galleryRevenueFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridStroke} vertical />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(value: number) => `$${value / 1000}k`} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--chart-line)"
                  strokeWidth={2}
                  fill="url(#galleryRevenueFill)"
                />
              </AreaChart>,
            )}
            <SrTable
              caption="Monthly revenue"
              head={["Month", "Revenue (USD)"]}
              rows={revenue.map((point) => [point.name, point.revenue])}
            />
          </SectionCard>

          <SectionCard title="Line — MRR trend" description="Analytics endpoint">
            {chartFrame(
              "Line chart of monthly recurring revenue in thousands of dollars",
              <LineChart data={mrr}>
                <CartesianGrid stroke={gridStroke} vertical />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(value: number) => `$${value / 1000}k`} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--chart-line)"
                  strokeWidth={2}
                />
              </LineChart>,
            )}
            <SrTable
              caption="Monthly recurring revenue"
              head={["Month", "MRR (USD)"]}
              rows={mrr.map((point) => [point.name, point.revenue])}
            />
          </SectionCard>

          <SectionCard title="Bar — channel performance" description="Visitors vs conversions">
            {chartFrame(
              "Bar chart comparing visitors and conversions per acquisition channel",
              <BarChart data={channels} barGap={6}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="channel" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip />
                <Bar dataKey="visitors" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="conversions" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>,
            )}
            <SrTable
              caption="Channel performance"
              head={["Channel", "Visitors", "Conversions"]}
              rows={channels.map((row) => [row.channel, row.visitors, row.conversions])}
            />
          </SectionCard>

          <SectionCard title="Donut — funnel stages" description="Conversion funnel distribution">
            {chartFrame(
              "Donut chart of conversion funnel stage values",
              <PieChart>
                <Pie
                  data={funnel}
                  dataKey="value"
                  nameKey="stage"
                  innerRadius={52}
                  outerRadius={84}
                  paddingAngle={3}
                >
                  {funnel.map((entry) => (
                    <Cell
                      key={entry.stage}
                      fill={DONUT_COLORS[funnel.indexOf(entry) % DONUT_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>,
            )}
            <SrTable
              caption="Funnel stages"
              head={["Stage", "Value"]}
              rows={funnel.map((step) => [step.stage, step.value])}
            />
          </SectionCard>
        </div>
      )}
    </div>
  );
};
