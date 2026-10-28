import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { type Column, DataTable } from "@/components/shared/data-table";
import { DefinitionList, DetailDrawer } from "@/components/shared/detail-drawer";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SearchFilterBar } from "@/components/shared/search-filter-bar";
import { TableSkeleton } from "@/components/shared/skeletons";
import { StatePanel } from "@/components/shared/state-panel";
import { getTransactionsRequest } from "@/features/transactions/transactions-api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Transaction, TransactionStatus } from "@/types";

const STATUS_CHIPS = [
  { id: "all", label: "All" },
  { id: "succeeded", label: "Succeeded" },
  { id: "pending", label: "Pending" },
  { id: "failed", label: "Failed" },
  { id: "refunded", label: "Refunded" },
];

const statusTone: Record<TransactionStatus, string> = {
  succeeded: "bg-[var(--success-soft)] text-[var(--success)]",
  pending: "bg-[var(--surface-secondary)] text-[var(--foreground-muted)]",
  failed: "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]",
  refunded: "bg-[var(--surface-secondary)] text-[var(--foreground-muted)]",
};

const columns: Column<Transaction>[] = [
  {
    key: "customer",
    header: "Customer",
    sortValue: (row) => row.customer,
    render: (row) => <span className="font-medium text-[var(--foreground)]">{row.customer}</span>,
  },
  { key: "email", header: "Email", render: (row) => row.email },
  {
    key: "date",
    header: "Date",
    sortValue: (row) => row.date,
    render: (row) => row.date,
  },
  {
    key: "amount",
    header: "Amount",
    headerClassName: "text-right",
    className: "text-right",
    sortValue: (row) => row.amount,
    render: (row) => formatCurrency(row.amount),
  },
  { key: "method", header: "Method", render: (row) => row.method.toUpperCase() },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <span
        className={cn(
          "inline-flex rounded-full px-2 py-1 text-[11px] font-medium",
          statusTone[row.status],
        )}
      >
        {row.status}
      </span>
    ),
  },
];

export const DataTablesPage = () => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Transaction | null>(null);

  const transactionsQuery = useQuery<Transaction[]>({
    queryKey: ["transactions", search, status],
    queryFn: () =>
      getTransactionsRequest({
        search: search || undefined,
        status: status === "all" ? undefined : (status as TransactionStatus),
      }),
  });
  const rows = transactionsQuery.data ?? [];

  const drawerItems = useMemo(
    () =>
      selected
        ? [
            { label: "Customer", value: selected.customer },
            { label: "Email", value: selected.email },
            { label: "Date", value: selected.date },
            { label: "Amount", value: formatCurrency(selected.amount) },
            { label: "Method", value: selected.method.toUpperCase() },
            { label: "Status", value: selected.status },
            { label: "Transaction ID", value: selected.id },
          ]
        : [],
    [selected],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data & Charts"
        title="Tables"
        description="The shared DataTable with server-side search, status chips, sortable columns, pagination and a detail drawer."
      />

      <SearchFilterBar
        value={search}
        onChange={setSearch}
        resultCount={rows.length}
        title="Ledger controls"
        description="Search by customer or email and filter by payment status."
        searchLabel="Search transactions"
        searchPlaceholder="Customer, email…"
        inputId="data-transactions-search"
        chips={STATUS_CHIPS}
        activeChip={status}
        onChipChange={setStatus}
      />

      {transactionsQuery.isLoading ? (
        <TableSkeleton count={6} />
      ) : transactionsQuery.isError ? (
        <StatePanel
          kind="error"
          title="Could not load transactions"
          description="The mock transactions endpoint failed."
          onRetry={() => void transactionsQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No transactions match"
          description="Try a different search term or clear the status filters."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          onRowClick={setSelected}
          getRowLabel={(row) => `${row.customer} transaction`}
          caption="Transactions"
        />
      )}

      <DetailDrawer
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.customer ?? ""}
        description="Transaction details"
      >
        <DefinitionList items={drawerItems} />
      </DetailDrawer>
    </div>
  );
};
