import { http } from "@/lib/http";
import type { NotificationItem } from "@/types";

export const getNotificationsRequest = () => http<NotificationItem[]>("/api/notifications");

export const markNotificationReadRequest = (id: string) =>
  http<NotificationItem>(`/api/notifications/${id}/read`, { method: "PATCH" });

export const markAllReadRequest = () =>
  http<NotificationItem[]>("/api/notifications/read-all", { method: "POST" });
