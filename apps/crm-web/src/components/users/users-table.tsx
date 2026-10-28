import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DefinitionList, DetailDrawer } from "@/components/shared/detail-drawer";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserCell } from "@/components/shared/user-cell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { inviteUserRequest, setUserStatusRequest } from "@/features/users/users-api";
import type { UserRecord } from "@/types";

const statusActions = (user: UserRecord) =>
  user.status === "Active"
    ? [{ label: "Suspend access", next: "Paused" as const }]
    : user.status === "Paused"
      ? [{ label: "Restore access", next: "Active" as const }]
      : [{ label: "Resend invite", next: null }];

export const UsersTable = ({ users }: { users: UserRecord[] }) => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<UserRecord | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["users"] });

  const resendInvite = useMutation({
    mutationFn: (user: UserRecord) =>
      inviteUserRequest({
        name: `${user.name} (re-invite)`,
        email: user.email,
        role: user.role,
      }),
    onSuccess: (_data, user) => {
      toast.success(`Invite re-sent to ${user.email}`);
    },
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "Active" | "Paused" }) =>
      setUserStatusRequest(id, status),
    onSuccess: (user) => {
      invalidate();
      toast.success(
        user.status === "Paused"
          ? `${user.name} can no longer sign in`
          : `${user.name} regained access`,
        {
          action: {
            label: "Undo",
            onClick: () => {
              void setUserStatusRequest(user.id, user.status === "Paused" ? "Active" : "Paused")
                .then(invalidate)
                .catch(() => toast.error("Could not revert access change"));
            },
          },
        },
      );
    },
  });

  const renderActions = (user: UserRecord) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Open actions for ${user.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setSelected(user)}>View profile</DropdownMenuItem>
        {user.status === "Invited" ? (
          <DropdownMenuItem onClick={() => resendInvite.mutate(user)}>
            Resend invite
          </DropdownMenuItem>
        ) : null}
        {statusActions(user)
          .filter((action) => action.next !== null)
          .map((action) => (
            <DropdownMenuItem
              key={action.label}
              onClick={() =>
                setStatus.mutate({
                  id: user.id,
                  status: action.next as "Active" | "Paused",
                })
              }
            >
              {action.label}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <div className="space-y-3 md:hidden">
        {users.map((user) => (
          <div
            key={user.id}
            className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-start justify-between gap-3">
              <UserCell user={user} />
              {renderActions(user)}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-[0.9rem] bg-[var(--surface-panel)] p-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  Role
                </p>
                <p className="mt-1 text-sm text-[var(--foreground-muted)]">{user.role}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  Status
                </p>
                <div className="mt-1">
                  <StatusBadge status={user.status} />
                </div>
              </div>
              <div className="col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  Last active
                </p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">{user.lastActiveAt}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)] md:block">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-panel)] px-5 py-4">
          <div>
            <p className="text-sm font-semibold">Workspace roster</p>
            <p className="text-sm text-[var(--muted-foreground)]">
              Operational visibility for access, role ownership and recent activity.
            </p>
          </div>
          <div className="hidden gap-2 lg:flex">
            {["Owner", "Admin", "Invited"].map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--foreground-muted)]"
              >
                {chip}s{" "}
                {
                  (chip === "Invited"
                    ? users.filter((u) => u.status === "Invited")
                    : users.filter((u) => u.role === chip)
                  ).length
                }
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[1.5fr_0.95fr_0.9fr_1fr_1.1fr_56px] gap-3 border-b border-[var(--border)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          <span>User</span>
          <span>Team</span>
          <span>Role</span>
          <span>Status</span>
          <span>Action lane</span>
          <span>More</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {users.map((user) => (
            <div
              key={user.id}
              className="grid grid-cols-[1.5fr_0.95fr_0.9fr_1fr_1.1fr_56px] items-center gap-3 px-5 py-4"
            >
              <UserCell user={user} />
              <span className="text-sm text-[var(--foreground-muted)]">
                {user.role === "Support"
                  ? "Customer Ops"
                  : user.role === "Analyst"
                    ? "Insights"
                    : "Core Admin"}
              </span>
              <span className="text-sm text-[var(--foreground-muted)]">{user.role}</span>
              <StatusBadge status={user.status} />
              <div className="space-y-1">
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {user.status === "Active"
                    ? "Review access"
                    : user.status === "Invited"
                      ? "Awaiting invite"
                      : "Access paused"}
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">{user.lastActiveAt}</p>
              </div>
              {renderActions(user)}
            </div>
          ))}
        </div>
      </div>

      <DetailDrawer
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.name ?? "User"}
        description={selected?.email}
      >
        {selected ? (
          <DefinitionList
            items={[
              { label: "Role", value: selected.role },
              { label: "Status", value: <StatusBadge status={selected.status} /> },
              {
                label: "Team",
                value:
                  selected.role === "Support"
                    ? "Customer Ops"
                    : selected.role === "Analyst"
                      ? "Insights"
                      : "Core Admin",
              },
              { label: "Last active", value: selected.lastActiveAt },
            ]}
          />
        ) : null}
      </DetailDrawer>
    </>
  );
};
