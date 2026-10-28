import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type Column, DataTable } from "@/components/shared/data-table";
import { DefinitionList, DetailDrawer } from "@/components/shared/detail-drawer";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { StatePanel } from "@/components/shared/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTransactionsRequest } from "@/features/transactions/transactions-api";
import { downloadCsv } from "@/lib/download";
import { formatCurrency } from "@/lib/format";
import type { Transaction, TransactionStatus } from "@/types";

const statusVariant: Record<TransactionStatus, "success" | "warning" | "outline"> = {
  succeeded: "success",
  pending: "warning",
  failed: "outline",
  refunded: "outline",
};

const statusFilters: (TransactionStatus | "all")[] = [
  "all",
  "succeeded",
  "pending",
  "failed",
  "refunded",
];

export const TransactionsPage = () => {
  const [status, setStatus] = useState<TransactionStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Transaction | null>(null);

  const transactionsQuery = useQuery<Transaction[]>({
    queryKey: ["transactions", status, search],
    queryFn: () =>
      getTransactionsRequest({ status: status === "all" ? undefined : status, search }),
  });

  const columns: Column<Transaction>[] = [
    {
      key: "customer",
      header: "Customer",
      sortValue: (row) => row.customer,
      render: (row) => <span className="font-medium text-[var(--foreground)]">{row.customer}</span>,
    },
    { key: "date", header: "Date", sortValue: (row) => row.date, render: (row) => row.date },
    {
      key: "amount",
      header: "Amount",
      sortValue: (row) => row.amount,
      render: (row) => formatCurrency(row.amount),
    },
    {
      key: "method",
      header: "Method",
      render: (row) => <span className="capitalize">{row.method}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge variant={statusVariant[row.status]}>{row.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Transactions"
        title="Payments and charges"
        description="Inspect every charge, refund and failed attempt across the workspace."
        actions={
          <Button
            variant="outline"
            disabled={!transactionsQuery.data || transactionsQuery.data.length === 0}
            onClick={() => {
              const rows = transactionsQuery.data ?? [];
              downloadCsv(
                "northstar-transactions.csv",
                ["ID", "Customer", "Email", "Date", "Amount", "Status", "Method"],
                rows.map((row) => [
                  row.id,
                  row.customer,
                  row.email,
                  row.date,
                  row.amount.toFixed(2),
                  row.status,
                  row.method,
                ]),
              );
            }}
          >
            Export CSV
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {statusFilters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setStatus(filter)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              status === filter
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "bg-[var(--surface-panel)] text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)]"
            }`}
          >
            {filter === "all" ? "All" : filter}
          </button>
        ))}
        <input
          aria-label="Search transactions"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search customer or email"
          className="ml-auto h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-panel)] px-3 text-sm outline-none focus:border-[var(--ring)] md:max-w-xs"
        />
      </div>

      {transactionsQuery.isLoading ? <TableSkeleton /> : null}
      {transactionsQuery.isError ? (
        <StatePanel
          kind="error"
          title="Transactions unavailable"
          description="The transactions endpoint failed."
          onRetry={() => void transactionsQuery.refetch()}
        />
      ) : null}

      {transactionsQuery.data && transactionsQuery.data.length > 0 ? (
        <DataTable
          columns={columns}
          rows={transactionsQuery.data}
          getRowKey={(row) => row.id}
          onRowClick={(row) => setSelected(row)}
          caption="Select a row to view details"
        />
      ) : null}

      {transactionsQuery.data && transactionsQuery.data.length === 0 ? (
        <EmptyState
          title="No transactions found"
          description="Adjust filters or search to see charges."
        />
      ) : null}

      <DetailDrawer
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.customer ?? "Transaction"}
        description={selected ? selected.id : undefined}
      >
        {selected ? (
          <DefinitionList
            items={[
              { label: "Amount", value: formatCurrency(selected.amount) },
              {
                label: "Status",
                value: <Badge variant={statusVariant[selected.status]}>{selected.status}</Badge>,
              },
              { label: "Method", value: <span className="capitalize">{selected.method}</span> },
              { label: "Email", value: selected.email },
              { label: "Date", value: selected.date },
            ]}
          />
        ) : null}
      </DetailDrawer>
    </div>
  );
};
