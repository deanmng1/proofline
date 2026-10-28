import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { CalendarGrid } from "@/components/calendar/calendar-grid";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { ChartSkeleton } from "@/components/shared/skeletons";
import { StatePanel } from "@/components/shared/state-panel";
import { Button } from "@/components/ui/button";
import { getCalendarRequest } from "@/features/calendar/calendar-api";

const monthKey = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, "0")}`;
const monthLabel = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export const CalendarPage = () => {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const key = monthKey(cursor.year, cursor.month);

  const eventsQuery = useQuery({
    queryKey: ["calendar", key],
    queryFn: () => getCalendarRequest(key),
  });
  const events = eventsQuery.data ?? [];

  const shift = (delta: number) => {
    const next = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Calendar"
        title="Team calendar"
        description="Mock month view with seeded events across the current, previous and next month."
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
            <Button
              variant="outline"
              size="icon"
              onClick={() => shift(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}
            >
              <CalendarDays className="mr-2 h-4 w-4" aria-hidden="true" />
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        }
      />

      <SectionCard
        title={monthLabel(cursor.year, cursor.month)}
        description={`${events.length} scheduled events`}
      >
        {eventsQuery.isLoading ? (
          <ChartSkeleton className="h-[28rem]" />
        ) : eventsQuery.isError ? (
          <StatePanel
            kind="error"
            title="Could not load events"
            description="The mock calendar endpoint failed."
            onRetry={() => void eventsQuery.refetch()}
          />
        ) : (
          <div className="-m-6 overflow-x-auto border-t border-[var(--border)]">
            <div className="min-w-[52rem]">
              <CalendarGrid year={cursor.year} month={cursor.month} events={events} />
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
};
