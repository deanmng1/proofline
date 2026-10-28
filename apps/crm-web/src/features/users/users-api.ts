import { http } from "@/lib/http";
import type { UserRecord } from "@/types";

export const getUsersRequest = (search = "") =>
  http<UserRecord[]>(`/api/users?search=${encodeURIComponent(search)}`);

export const inviteUserRequest = (input: { name: string; email: string; role: string }) =>
  http<UserRecord>("/api/users/invite", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const setUserStatusRequest = (id: string, status: "Active" | "Paused") =>
  http<UserRecord>(`/api/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
