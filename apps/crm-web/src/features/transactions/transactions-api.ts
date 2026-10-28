import { http } from "@/lib/http";
import type { Transaction, TransactionStatus } from "@/types";

export const getTransactionsRequest = (
  params: { search?: string; status?: TransactionStatus } = {},
) => {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  const qs = query.toString();
  return http<Transaction[]>(`/api/transactions${qs ? `?${qs}` : ""}`);
};
