import { http } from "@/lib/http";
import type { Ticket, TicketPriority, TicketStatus } from "@/types";

export const getTicketsRequest = (
  params: { status?: TicketStatus; priority?: TicketPriority } = {},
) => {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.priority) query.set("priority", params.priority);
  const qs = query.toString();
  return http<Ticket[]>(`/api/support/tickets${qs ? `?${qs}` : ""}`);
};

export const createTicketRequest = (input: {
  subject: string;
  requester: string;
  priority: TicketPriority;
}) =>
  http<Ticket>("/api/support/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateTicketRequest = (id: string, status: TicketStatus) =>
  http<Ticket>(`/api/support/tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
