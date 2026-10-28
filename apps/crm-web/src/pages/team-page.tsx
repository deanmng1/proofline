import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { type Column, DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SearchFilterBar } from "@/components/shared/search-filter-bar";
import { TableSkeleton } from "@/components/shared/skeletons";
import { StatePanel } from "@/components/shared/state-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserCell } from "@/components/shared/user-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  changeTeamRoleRequest,
  getTeamRequest,
  inviteTeamRequest,
  removeTeamRequest,
} from "@/features/team/team-api";
import { downloadCsv } from "@/lib/download";
import type { TeamMember, TeamRole, UserRecord } from "@/types";

const roleVariant: Record<TeamRole, "success" | "warning" | "outline" | "default"> = {
  Owner: "success",
  Admin: "warning",
  Member: "outline",
  Billing: "default",
};

const roleOptions: TeamRole[] = ["Owner", "Admin", "Member", "Billing"];

export const TeamPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const teamQuery = useQuery<TeamMember[]>({
    queryKey: ["team", deferredSearch],
    queryFn: () => getTeamRequest(deferredSearch) as Promise<TeamMember[]>,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["team"] });

  const invite = useMutation({
    mutationFn: (input: { name: string; email: string; role: TeamRole }) =>
      inviteTeamRequest(input),
    onSuccess: () => {
      invalidate();
      toast.success("Invite sent");
    },
    onError: () => toast.error("Could not invite member"),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: TeamRole }) => changeTeamRoleRequest(id, role),
    onSuccess: () => invalidate(),
  });

  const remove = useMutation({
    mutationFn: (member: TeamMember) => removeTeamRequest(member.id),
    onSuccess: (_data, member) => {
      invalidate();
      toast.success(`${member.name} was removed`, {
        description: "You can undo this action for a short time.",
        action: {
          label: "Undo",
          onClick: () => {
            void inviteTeamRequest({
              name: member.name,
              email: member.email,
              role: member.role,
            })
              .then(() => invalidate())
              .catch(() => toast.error("Could not restore member"));
          },
        },
      });
    },
  });

  const [pendingRemoval, setPendingRemoval] = useState<TeamMember | null>(null);

  const columns: Column<TeamMember>[] = [
    {
      key: "user",
      header: "Member",
      render: (row) => <UserCell user={row as unknown as UserRecord} />,
    },
    {
      key: "role",
      header: "Role",
      render: (row) => <Badge variant={roleVariant[row.role]}>{row.role}</Badge>,
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "lastActive",
      header: "Last active",
      render: (row) => <span className="text-[var(--muted-foreground)]">{row.lastActiveAt}</span>,
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-14",
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Open actions for ${row.name}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Change role</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {roleOptions.map((role) => (
              <DropdownMenuItem key={role} onClick={() => changeRole.mutate({ id: row.id, role })}>
                {role}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setPendingRemoval(row)}>
              Remove member
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team"
        title="Members, roles and access"
        description="Invite teammates, adjust roles and keep the roster under control."
        actions={
          <>
            <Button
              variant="outline"
              className="w-full md:w-auto"
              onClick={() => {
                const members = teamQuery.data ?? [];
                downloadCsv(
                  "northstar-team.csv",
                  ["Name", "Email", "Role", "Status", "Last active"],
                  members.map((member) => [
                    member.name,
                    member.email,
                    member.role,
                    member.status,
                    member.lastActiveAt,
                  ]),
                );
                toast.success(`Exported ${members.length} team members`);
              }}
              disabled={!teamQuery.data || teamQuery.data.length === 0}
            >
              Export
            </Button>
            <Button
              className="w-full md:w-auto"
              onClick={() =>
                invite.mutate({ name: "New Member", email: "new@northstar.app", role: "Member" })
              }
            >
              Invite member
            </Button>
          </>
        }
      />

      <SearchFilterBar value={search} onChange={setSearch} resultCount={teamQuery.data?.length} />

      {teamQuery.isLoading ? <TableSkeleton /> : null}
      {teamQuery.isError ? (
        <StatePanel
          kind="error"
          title="Team unavailable"
          description="The team endpoint failed."
          onRetry={() => void teamQuery.refetch()}
        />
      ) : null}
      {teamQuery.data && teamQuery.data.length > 0 ? (
        <DataTable columns={columns} rows={teamQuery.data} getRowKey={(row) => row.id} />
      ) : null}
      {teamQuery.data && teamQuery.data.length === 0 ? (
        <EmptyState
          title="No members match this search"
          description="Try a broader query to see the full team."
        />
      ) : null}

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title={`Remove ${pendingRemoval?.name ?? "member"}?`}
        description="The member loses access to this workspace immediately. You can undo the removal from the confirmation toast for a short time."
        confirmLabel="Remove member"
        destructive
        onConfirm={() => {
          if (pendingRemoval) remove.mutate(pendingRemoval);
          setPendingRemoval(null);
        }}
      />
    </div>
  );
};
