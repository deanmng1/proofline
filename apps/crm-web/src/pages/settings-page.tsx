import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SettingsForm } from "@/components/settings/settings-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { FormSkeleton } from "@/components/shared/skeletons";
import { StatePanel } from "@/components/shared/state-panel";
import { getSettingsRequest, updateSettingsRequest } from "@/features/settings/settings-api";
import type { SettingsPayload } from "@/types";

export const SettingsPage = () => {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery<SettingsPayload>({
    queryKey: ["settings"],
    queryFn: getSettingsRequest as () => Promise<SettingsPayload>,
  });

  const saveMutation = useMutation({
    mutationFn: (values: SettingsPayload) =>
      updateSettingsRequest(values) as Promise<SettingsPayload>,
    onSuccess: async (values) => {
      queryClient.setQueryData(["settings"], values);
      toast.success("Settings updated");
    },
    onError: () => {
      toast.error("Could not save settings");
    },
  });

  if (settingsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Workspace settings without the visual noise."
          description="Configuration stays primary, while policy and audit context remain available without competing for attention."
        />
        <FormSkeleton />
      </div>
    );
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <StatePanel
        kind="error"
        title="Settings unavailable"
        description="The settings endpoint returned an error."
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Workspace settings without the visual noise."
        description="Configuration stays primary, while policy and audit context remain available without competing for attention."
      />

      <div className="grid items-start gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <SectionCard
          tone="primary"
          title="Workspace configuration"
          description="Profile and notification preferences powered by mock persistence."
        >
          <SettingsForm
            defaultValues={settingsQuery.data}
            isSaving={saveMutation.isPending}
            onSubmit={async (values) => {
              await saveMutation.mutateAsync(values);
            }}
          />
        </SectionCard>

        <SectionCard
          tone="auxiliary"
          title="Policy summary"
          description="A compact rail for policy, regional context and recent audit status."
          className="xl:sticky xl:top-24"
        >
          <div className="space-y-3">
            <div className="rounded-[0.9rem] border border-[var(--border)] bg-[var(--surface-panel)] p-4">
              <p className="text-sm font-medium">Notification routing</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Critical alerts route to owners immediately. Weekly summaries go to the operations
                inbox.
              </p>
            </div>
            <div className="rounded-[0.9rem] border border-[var(--border)] bg-[var(--surface-panel)] p-4">
              <p className="text-sm font-medium">Regional behavior</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Timezone affects exports, digest windows and workforce-level scheduling assumptions.
              </p>
            </div>
            <div className="rounded-[0.9rem] border border-[var(--border)] bg-[var(--surface-panel)] p-4">
              <p className="text-sm font-medium">Audit state</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Last configuration update saved successfully in this workspace.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
