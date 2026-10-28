import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type Column, DataTable } from "@/components/shared/data-table";
import { DefinitionList, DetailDrawer } from "@/components/shared/detail-drawer";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { StatePanel } from "@/components/shared/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createTicketRequest,
  getTicketsRequest,
  updateTicketRequest,
} from "@/features/support/support-api";
import type { Ticket, TicketStatus } from "@/types";

const priorityVariant: Record<string, "success" | "warning" | "outline" | "default"> = {
  low: "outline",
  medium: "outline",
  high: "warning",
  urgent: "default",
};

const statusFilters: (TicketStatus | "all")[] = ["all", "open", "pending", "closed"];

export const SupportPage = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TicketStatus | "all">("all");
  const [selected, setSelected] = useState<Ticket | null>(null);

  const ticketsQuery = useQuery<Ticket[]>({
    queryKey: ["tickets", status],
    queryFn: () => getTicketsRequest({ status: status === "all" ? undefined : status }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tickets"] });

  const createTicket = useMutation({
    mutationFn: () =>
      createTicketRequest({
        subject: "New support request",
        requester: "ops@northstar.app",
        priority: "medium",
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Ticket created");
    },
  });

  const updateTicket = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TicketStatus }) =>
      updateTicketRequest(id, status),
    onSuccess: () => {
      invalidate();
      setSelected(null);
    },
  });

  const columns: Column<Ticket>[] = [
    {
      key: "subject",
      header: "Subject",
      sortValue: (row) => row.subject,
      render: (row) => <span className="font-medium text-[var(--foreground)]">{row.subject}</span>,
    },
    { key: "requester", header: "Requester", render: (row) => row.requester },
    {
      key: "priority",
      header: "Priority",
      sortValue: (row) => row.priority,
      render: (row) => <Badge variant={priorityVariant[row.priority]}>{row.priority}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={row.status === "closed" ? "outline" : "success"}>{row.status}</Badge>
      ),
    },
    { key: "assignee", header: "Assignee", render: (row) => row.assignee ?? "—" },
    {
      key: "actions",
      header: "",
      headerClassName: "w-32",
      render: (row) => (
        <Button variant="ghost" size="sm" onClick={() => setSelected(row)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Support"
        title="Tickets and feedback"
        description="Triage requests, change status and keep response times healthy."
        actions={<Button onClick={() => createTicket.mutate()}>New ticket</Button>}
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
      </div>

      {ticketsQuery.isLoading ? <TableSkeleton /> : null}
      {ticketsQuery.isError ? (
        <StatePanel
          kind="error"
          title="Support unavailable"
          description="The support endpoint failed."
          onRetry={() => void ticketsQuery.refetch()}
        />
      ) : null}

      {ticketsQuery.data && ticketsQuery.data.length > 0 ? (
        <DataTable
          columns={columns}
          rows={ticketsQuery.data}
          getRowKey={(row) => row.id}
          caption={`${ticketsQuery.data.length} tickets`}
        />
      ) : null}

      {ticketsQuery.data && ticketsQuery.data.length === 0 ? (
        <EmptyState title="No tickets" description="The queue is clear." />
      ) : null}

      <DetailDrawer
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.subject ?? "Ticket"}
        description={selected?.id}
        footer={
          selected ? (
            <div className="flex gap-2">
              {(["open", "pending", "closed"] as TicketStatus[]).map((next) => (
                <Button
                  key={next}
                  variant={next === selected.status ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateTicket.mutate({ id: selected.id, status: next })}
                >
                  {next}
                </Button>
              ))}
            </div>
          ) : null
        }
      >
        {selected ? (
          <DefinitionList
            items={[
              { label: "Requester", value: selected.requester },
              {
                label: "Priority",
                value: (
                  <Badge variant={priorityVariant[selected.priority]}>{selected.priority}</Badge>
                ),
              },
              { label: "Status", value: selected.status },
              { label: "Assignee", value: selected.assignee ?? "Unassigned" },
              { label: "Created", value: selected.createdAt },
            ]}
          />
        ) : null}
      </DetailDrawer>
    </div>
  );
};
