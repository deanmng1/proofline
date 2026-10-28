import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SkeletonGroupProps = {
  count?: number;
  className?: string;
};

const keyRange = (count: number, prefix: string): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

export const KpiGridSkeleton = ({ count = 4, className }: SkeletonGroupProps) => (
  <div
    className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-4", className)}
    role="status"
    aria-label="Loading metrics"
  >
    {keyRange(count, "kpi").map((key) => (
      <div
        key={key}
        aria-hidden="true"
        className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-32" />
          </div>
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
        <Skeleton className="mt-4 h-4 w-40" />
      </div>
    ))}
  </div>
);

const TABLE_HEADER_CELLS = [
  { id: "header-name", width: "16%" },
  { id: "header-email", width: "24%" },
  { id: "header-role", width: "14%" },
  { id: "header-status", width: "14%" },
  { id: "header-actions", width: "12%" },
];
const TABLE_ROW_CELLS = [
  { id: "cell-a", width: "18%" },
  { id: "cell-b", width: "22%" },
  { id: "cell-c", width: "14%" },
  { id: "cell-d", width: "14%" },
  { id: "cell-e", width: "10%" },
];

export const TableSkeleton = ({ count = 6, className }: SkeletonGroupProps) => (
  <div
    className={cn(
      "overflow-hidden rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]",
      className,
    )}
    role="status"
    aria-label="Loading table"
  >
    <div
      aria-hidden="true"
      className="flex items-center gap-4 border-b border-[var(--border)] bg-[var(--surface-panel)] px-5 py-3"
    >
      {TABLE_HEADER_CELLS.map((cell) => (
        <Skeleton key={cell.id} className="h-3" style={{ width: cell.width }} />
      ))}
    </div>
    <div aria-hidden="true" className="divide-y divide-[var(--border)]">
      {keyRange(count, "row").map((rowKey) => (
        <div key={rowKey} className="flex items-center gap-4 px-5 py-4">
          {TABLE_ROW_CELLS.map((cell) => (
            <Skeleton key={`${rowKey}-${cell.id}`} className="h-4" style={{ width: cell.width }} />
          ))}
        </div>
      ))}
    </div>
    <span className="sr-only">Loading content</span>
  </div>
);

export const ChartSkeleton = ({ className }: { className?: string }) => (
  <div className={cn("h-64 md:h-80", className)} role="status" aria-label="Loading chart">
    <Skeleton aria-hidden="true" className="h-full w-full rounded-[0.75rem]" />
    <span className="sr-only">Loading chart data</span>
  </div>
);

export const ListSkeleton = ({ count = 4, className }: SkeletonGroupProps) => (
  <div
    className={cn(
      "rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]",
      className,
    )}
    role="status"
    aria-label="Loading list"
  >
    <div aria-hidden="true" className="space-y-3">
      {keyRange(count, "item").map((itemKey) => (
        <div
          key={itemKey}
          className="flex items-start justify-between gap-4 rounded-[0.9rem] border border-[var(--border)] bg-[var(--surface-panel)] p-4"
        >
          <div className="w-full space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
    <span className="sr-only">Loading items</span>
  </div>
);

export const FormSkeleton = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]",
      className,
    )}
    role="status"
    aria-label="Loading form"
  >
    <div aria-hidden="true" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {keyRange(4, "field").map((fieldKey) => (
          <div key={fieldKey} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <div className="space-y-3 border-t border-[var(--border)] pt-6">
        {keyRange(2, "toggle").map((toggleKey) => (
          <div
            key={toggleKey}
            className="flex items-center justify-between gap-4 rounded-[0.8rem] border border-[var(--border)] bg-[var(--surface-panel)] p-4"
          >
            <div className="w-full space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-6 w-11 rounded-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-9 w-28 rounded-lg" />
    </div>
    <span className="sr-only">Loading settings</span>
  </div>
);
