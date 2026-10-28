import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plug } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { type Column, DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { TableSkeleton } from "@/components/shared/skeletons";
import { StatePanel } from "@/components/shared/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  connectIntegrationRequest,
  createApiKeyRequest,
  getApiKeysRequest,
  getIntegrationsRequest,
  revokeApiKeyRequest,
} from "@/features/integrations/integrations-api";
import type { ApiKey, Integration } from "@/types";

export const IntegrationsPage = () => {
  const queryClient = useQueryClient();
  const integrationsQuery = useQuery<Integration[]>({
    queryKey: ["integrations"],
    queryFn: getIntegrationsRequest,
  });
  const keysQuery = useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: getApiKeysRequest,
  });

  const connect = useMutation({
    mutationFn: (id: string) => connectIntegrationRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Integration connected");
    },
  });

  const createKey = useMutation({
    mutationFn: () => createApiKeyRequest({ label: "New key", scopes: ["read"] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key created");
    },
  });

  const revokeKey = useMutation({
    mutationFn: (key: ApiKey) => revokeApiKeyRequest(key.id),
    onSuccess: (_data, key) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success(`API key “${key.label}” revoked`, {
        description: "Applications using this key stop working immediately.",
        action: {
          label: "Undo",
          onClick: () => {
            void createApiKeyRequest({ label: key.label, scopes: key.scopes })
              .then(() => queryClient.invalidateQueries({ queryKey: ["api-keys"] }))
              .catch(() => toast.error("Could not restore API key"));
          },
        },
      });
    },
  });

  const [pendingRevoke, setPendingRevoke] = useState<ApiKey | null>(null);

  const integrationColumns: Column<Integration>[] = [
    {
      key: "name",
      header: "Integration",
      render: (row) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-secondary)] text-[var(--foreground)]">
            <Plug className="h-4 w-4" />
          </span>
          <div>
            <p className="font-medium text-[var(--foreground)]">{row.name}</p>
            <p className="text-xs text-[var(--muted-foreground)]">{row.category}</p>
          </div>
        </div>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (row) => <span className="text-[var(--foreground-muted)]">{row.description}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={row.status === "connected" ? "success" : "outline"}>{row.status}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-40",
      render: (row) =>
        row.status === "connected" ? (
          <span className="text-sm text-[var(--muted-foreground)]">
            Connected {row.connectedAt}
          </span>
        ) : (
          <Button variant="outline" size="sm" onClick={() => connect.mutate(row.id)}>
            Connect
          </Button>
        ),
    },
  ];

  const keyColumns: Column<ApiKey>[] = [
    {
      key: "label",
      header: "Label",
      render: (row) => <span className="font-medium text-[var(--foreground)]">{row.label}</span>,
    },
    {
      key: "prefix",
      header: "Key",
      render: (row) => <code className="text-sm">{row.prefix}••••••••</code>,
    },
    { key: "scopes", header: "Scopes", render: (row) => row.scopes.join(", ") },
    { key: "lastUsed", header: "Last used", render: (row) => row.lastUsedAt },
    {
      key: "actions",
      header: "",
      headerClassName: "w-28",
      render: (row) =>
        row.revoked ? (
          <Badge variant="outline">Revoked</Badge>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setPendingRevoke(row)}>
            Revoke
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrations"
        title="Connected apps and API keys"
        description="Manage third-party connections and programmatic access."
        actions={<Button onClick={() => createKey.mutate()}>Create API key</Button>}
      />

      {integrationsQuery.isLoading ? <TableSkeleton /> : null}
      {integrationsQuery.isError ? (
        <StatePanel
          kind="error"
          title="Integrations unavailable"
          description="The integrations endpoint failed."
          onRetry={() => void integrationsQuery.refetch()}
        />
      ) : null}
      {integrationsQuery.data ? (
        <SectionCard
          title="Integrations"
          description="Toggle connections your workspace relies on."
        >
          <DataTable
            columns={integrationColumns}
            rows={integrationsQuery.data}
            getRowKey={(row) => row.id}
          />
        </SectionCard>
      ) : null}

      {keysQuery.isLoading ? <TableSkeleton count={3} /> : null}
      {keysQuery.isError ? (
        <StatePanel
          kind="error"
          title="API keys unavailable"
          description="The API keys endpoint failed."
          onRetry={() => void keysQuery.refetch()}
        />
      ) : null}
      {keysQuery.data && keysQuery.data.length > 0 ? (
        <SectionCard
          title="API keys"
          description="Keep these secret; revoke immediately if leaked."
        >
          <DataTable columns={keyColumns} rows={keysQuery.data} getRowKey={(row) => row.id} />
        </SectionCard>
      ) : null}
      {keysQuery.data && keysQuery.data.length === 0 ? (
        <EmptyState title="No API keys" description="Create a key to enable integrations." />
      ) : null}

      <ConfirmDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => !open && setPendingRevoke(null)}
        title={`Revoke API key “${pendingRevoke?.label ?? ""}”?`}
        description="Any application authenticating with this key loses access immediately. You can recreate an equivalent key from the undo action for a short time."
        confirmLabel="Revoke key"
        destructive
        onConfirm={() => {
          if (pendingRevoke) revokeKey.mutate(pendingRevoke);
          setPendingRevoke(null);
        }}
      />
    </div>
  );
};
