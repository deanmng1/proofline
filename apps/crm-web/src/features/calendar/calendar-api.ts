import { http } from "@/lib/http";
import type { CalendarEvent } from "@/types";

export const getCalendarRequest = (month: string) =>
  http<CalendarEvent[]>(`/api/calendar?month=${month}`);
