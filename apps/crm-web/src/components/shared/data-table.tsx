import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  sortValue?: (row: T) => string | number;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  getRowLabel?: (row: T) => string;
  pageSize?: number;
  caption?: string;
  className?: string;
};

const DEFAULT_PAGE_SIZE = 10;

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  getRowLabel,
  pageSize = DEFAULT_PAGE_SIZE,
  caption,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const column = columns.find((col) => col.key === sortKey);
    if (!column?.sortValue) return rows;
    const factor = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = column.sortValue?.(a);
      const bv = column.sortValue?.(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [rows, columns, sortKey, sortDir]);

  const visibleRows = sortedRows.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const toggleSort = (key: string) => {
    setPage(0);
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (!onRowClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onRowClick(row);
    }
  };

  const rangeStart = rows.length === 0 ? 0 : safePage * pageSize + 1;
  const rangeEnd = Math.min((safePage + 1) * pageSize, rows.length);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-panel)] text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                const SortIcon = !col.sortValue
                  ? null
                  : isSorted
                    ? sortDir === "asc"
                      ? ArrowUp
                      : ArrowDown
                    : ChevronsUpDown;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={
                      col.sortValue
                        ? isSorted
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                        : undefined
                    }
                    className={cn("px-5 py-3 whitespace-nowrap", col.headerClassName)}
                  >
                    {SortIcon ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="inline-flex items-center gap-1.5 uppercase tracking-[0.16em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      >
                        {col.header}
                        <SortIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {visibleRows.map((row) => {
              const key = getRowKey(row);
              const interactive = Boolean(onRowClick);
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={interactive ? (event) => handleRowKeyDown(event, row) : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={interactive ? (getRowLabel?.(row) ?? key) : undefined}
                  className={cn(
                    interactive &&
                      "cursor-pointer transition-colors hover:bg-[var(--surface-panel)] focus-visible:bg-[var(--surface-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-5 py-4 align-middle text-[var(--foreground-muted)]",
                        col.className,
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--muted-foreground)]">
        <span>
          Showing {rangeStart}–{rangeEnd} of {rows.length}
          {caption ? ` · ${caption}` : ""}
        </span>
        {pageCount > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              disabled={safePage === 0}
            >
              Previous
            </Button>
            <span aria-live="polite">
              Page {safePage + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
              disabled={safePage >= pageCount - 1}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
