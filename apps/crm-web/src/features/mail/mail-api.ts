import { http } from "@/lib/http";
import type { MailFolder, MailMessage } from "@/types";

export const getMailRequest = (folder: MailFolder) =>
  http<MailMessage[]>(`/api/mail?folder=${folder}`);

export const setMailReadRequest = (id: string, read: boolean) =>
  http<{ success: boolean }>(`/api/mail/${id}/read`, {
    method: "PATCH",
    body: JSON.stringify({ read }),
  });
