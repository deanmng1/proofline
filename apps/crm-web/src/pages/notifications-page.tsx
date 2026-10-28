import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { ListSkeleton } from "@/components/shared/skeletons";
import { StatePanel } from "@/components/shared/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getNotificationsRequest,
  markAllReadRequest,
  markNotificationReadRequest,
} from "@/features/notifications/notifications-api";
import type { NotificationItem, NotificationLevel } from "@/types";

const levelVariant: Record<NotificationLevel, "success" | "warning" | "outline"> = {
  success: "success",
  warning: "warning",
  info: "outline",
};

export const NotificationsPage = () => {
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery<NotificationItem[]>({
    queryKey: ["notifications"],
    queryFn: getNotificationsRequest,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationReadRequest(id),
    onSuccess: invalidate,
  });

  const markAll = useMutation({
    mutationFn: () => markAllReadRequest(),
    onSuccess: () => {
      invalidate();
      toast.success("All marked as read");
    },
  });

  const notifications = notificationsQuery.data ?? [];
  const unread = notifications.filter((item) => !item.read).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notifications"
        title="Alerts and in-app messages"
        description="Review recent notifications and acknowledge what matters."
        actions={
          <Button variant="outline" onClick={() => markAll.mutate()} disabled={unread === 0}>
            Mark all read
          </Button>
        }
      />

      {notificationsQuery.isLoading ? <ListSkeleton count={5} /> : null}
      {notificationsQuery.isError ? (
        <StatePanel
          kind="error"
          title="Notifications unavailable"
          description="The notifications endpoint failed."
          onRetry={() => void notificationsQuery.refetch()}
        />
      ) : null}

      {notifications.length > 0 ? (
        <SectionCard
          title="Recent notifications"
          description={unread > 0 ? `${unread} unread` : "All caught up"}
        >
          <div className="space-y-3">
            {notifications.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 rounded-[0.9rem] border border-[var(--border)] bg-[var(--surface-panel)] p-4"
                data-tone={item.read ? undefined : "primary"}
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[var(--foreground)]">{item.title}</p>
                    <Badge variant={levelVariant[item.level]}>{item.level}</Badge>
                    <Badge variant="outline">{item.channel}</Badge>
                    {!item.read ? <Badge variant="default">Unread</Badge> : null}
                  </div>
                  <p className="text-sm text-[var(--foreground-muted)]">{item.body}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{item.triggeredAt}</p>
                </div>
                {!item.read ? (
                  <Button variant="ghost" size="sm" onClick={() => markRead.mutate(item.id)}>
                    Mark read
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {notifications.length === 0 ? (
        <EmptyState
          title="No notifications"
          description="When something happens, it will show up here."
        />
      ) : null}
    </div>
  );
};
