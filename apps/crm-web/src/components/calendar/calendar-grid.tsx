import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types";

type CalendarGridProps = {
  year: number;
  month: number;
  events: CalendarEvent[];
};

type MonthCell = {
  key: string;
  day: number | null;
  dateKey: string;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const toneChipClass: Record<CalendarEvent["tone"], string> = {
  accent: "border-l-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]",
  success: "border-l-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]",
  warning: "border-l-amber-500 bg-[var(--warning-soft)] text-[var(--warning)]",
  neutral: "border-l-[var(--muted-foreground)] bg-[var(--surface-subtle)]",
};

const eventToneDot: Record<CalendarEvent["tone"], string> = {
  accent: "bg-[var(--accent)]",
  success: "bg-[var(--success)]",
  warning: "bg-amber-500",
  neutral: "bg-[var(--muted-foreground)]",
};

const isoDate = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;

export const buildMonthCells = (year: number, month: number): MonthCell[] => {
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  return Array.from({ length: totalCells }, (_, offset) => {
    const date = new Date(Date.UTC(year, month, 1 - firstWeekday + offset));
    const inMonth = date.getUTCMonth() === month;
    return { key: isoDate(date), day: inMonth ? date.getUTCDate() : null, dateKey: isoDate(date) };
  });
};

export const CalendarGrid = ({ year, month, events }: CalendarGridProps) => {
  const cells = buildMonthCells(year, month);
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    eventsByDate.set(event.date, [...(eventsByDate.get(event.date) ?? []), event]);
  }

  const todayKey = isoDate(new Date());

  const weeks: MonthCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return (
    <table
      className="w-full border-collapse text-sm"
      aria-label={`Calendar for ${month + 1}/${year}`}
    >
      <thead>
        <tr>
          {WEEKDAYS.map((day) => (
            <th
              key={day}
              scope="col"
              className="border-b border-[var(--border)] px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]"
            >
              {day}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0].key}>
            {week.map((cell) => {
              if (cell.day === null) {
                return (
                  <td
                    key={cell.key}
                    className="h-24 border-b border-[var(--border)] p-1"
                    aria-hidden="true"
                  />
                );
              }
              const dayEvents = eventsByDate.get(cell.dateKey) ?? [];
              const isToday = cell.dateKey === todayKey;
              return (
                <td
                  key={cell.key}
                  className={cn(
                    "h-24 border-b border-[var(--border)] p-1.5 align-top",
                    isToday && "bg-[var(--surface-panel)] ring-1 ring-inset ring-[var(--accent)]",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium",
                      isToday
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "text-[var(--foreground-muted)]",
                    )}
                  >
                    {cell.day}
                  </span>
                  <div className="mt-1 space-y-1">
                    {dayEvents.map((event) => (
                      <div
                        key={event.id}
                        className={cn(
                          "truncate rounded-md border-l-2 px-1.5 py-0.5 text-[11px] font-medium text-[var(--foreground-muted)]",
                          toneChipClass[event.tone],
                        )}
                        title={`${event.title} · ${event.time}`}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle",
                            eventToneDot[event.tone],
                          )}
                        />
                        {event.time} {event.title}
                      </div>
                    ))}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
