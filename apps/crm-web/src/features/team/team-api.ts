import { http } from "@/lib/http";
import type { TeamMember, TeamRole } from "@/types";

export const getTeamRequest = (search = "") =>
  http<TeamMember[]>(`/api/team?search=${encodeURIComponent(search)}`);

export const inviteTeamRequest = (input: { name: string; email: string; role: TeamRole }) =>
  http<TeamMember>("/api/team/invite", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const changeTeamRoleRequest = (id: string, role: TeamRole) =>
  http<TeamMember>(`/api/team/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });

export const removeTeamRequest = (id: string) =>
  http<null>(`/api/team/${id}`, { method: "DELETE" });
