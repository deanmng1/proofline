import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, UserPlus } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { type FilterChip, SearchFilterBar } from "@/components/shared/search-filter-bar";
import { TableSkeleton } from "@/components/shared/skeletons";
import { StatePanel } from "@/components/shared/state-panel";
import { Button } from "@/components/ui/button";
import { InviteUserDialog } from "@/components/users/invite-user-dialog";
import { UsersTable } from "@/components/users/users-table";
import { getUsersRequest, inviteUserRequest } from "@/features/users/users-api";
import { downloadCsv } from "@/lib/download";
import type { UserRecord } from "@/types";

const roleChips: FilterChip[] = [
  { id: "all", label: "All roles" },
  { id: "Owner", label: "Owners" },
  { id: "Admin", label: "Admins" },
  { id: "Support", label: "Support" },
  { id: "Analyst", label: "Analysts" },
];

export const UsersPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const usersQuery = useQuery<UserRecord[]>({
    queryKey: ["users", deferredSearch],
    queryFn: () => getUsersRequest(deferredSearch) as Promise<UserRecord[]>,
  });

  const invite = useMutation({
    mutationFn: (values: { name: string; email: string; role: string }) =>
      inviteUserRequest(values),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setInviteOpen(false);
      toast.success(`Invite sent to ${user.name}`, {
        description: "They appear in the roster with “Invited” status.",
        action: {
          label: "View",
          onClick: () => setSearch(user.email),
        },
      });
    },
  });

  const filteredUsers = useMemo(
    () =>
      (usersQuery.data ?? []).filter((user) => roleFilter === "all" || user.role === roleFilter),
    [usersQuery.data, roleFilter],
  );

  const exportRoster = () => {
    downloadCsv(
      "northstar-roster.csv",
      ["Name", "Email", "Role", "Status", "Last active"],
      filteredUsers.map((user) => [
        user.name,
        user.email,
        user.role,
        user.status,
        user.lastActiveAt,
      ]),
    );
    toast.success(`Exported ${filteredUsers.length} roster entries`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Users"
        title="Access control and roster visibility for operational teams."
        description="A compact roster with visible follow-up actions, better table density and cleaner admin hierarchy."
        actions={
          <>
            <Button
              variant="outline"
              className="w-full md:w-auto"
              onClick={exportRoster}
              disabled={filteredUsers.length === 0}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Export roster
            </Button>
            <Button className="w-full md:w-auto" onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
              Invite user
            </Button>
          </>
        }
      />

      <SearchFilterBar
        value={search}
        onChange={(next) => {
          setSearch(next);
          setRoleFilter("all");
        }}
        resultCount={filteredUsers.length}
        title="Roster controls"
        description="Search by name, email or role and keep follow-up work visible without opening a detail view."
        searchLabel="Search users"
        inputId="users-search"
        chips={roleChips}
        activeChip={roleFilter}
        onChipChange={setRoleFilter}
      />

      {usersQuery.isLoading ? <TableSkeleton /> : null}

      {usersQuery.isError ? (
        <StatePanel
          kind="error"
          title="Users unavailable"
          description="The mock user directory did not respond."
          onRetry={() => void usersQuery.refetch()}
        />
      ) : null}

      {usersQuery.data && filteredUsers.length > 0 ? <UsersTable users={filteredUsers} /> : null}

      {usersQuery.data && filteredUsers.length === 0 ? (
        <EmptyState
          title="No users match this search"
          description="Try a broader query or reset the filter to reveal the full demo dataset."
          action={
            <Button variant="outline" onClick={() => setRoleFilter("all")}>
              Reset filters
            </Button>
          }
        />
      ) : null}

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSubmit={async (values) => {
          await invite.mutateAsync(values);
        }}
        isSubmitting={invite.isPending}
      />
    </div>
  );
};
