import { cn } from "@/lib/utils";
import type { MailMessage } from "@/types";

type MailListProps = {
  messages: MailMessage[];
  selectedId: string | null;
  onSelect: (message: MailMessage) => void;
};

export const MailList = ({ messages, selectedId, onSelect }: MailListProps) => (
  <ul className="divide-y divide-[var(--border)]" aria-label="Messages">
    {messages.map((message) => {
      const selected = message.id === selectedId;
      return (
        <li key={message.id}>
          <button
            type="button"
            onClick={() => onSelect(message)}
            aria-current={selected || undefined}
            className={cn(
              "flex w-full flex-col gap-1 px-4 py-3.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]",
              selected ? "bg-[var(--surface-panel)]" : "hover:bg-[var(--surface-subtle)]",
            )}
          >
            <span className="flex w-full items-center gap-2">
              {!message.read ? (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                />
              ) : (
                <span aria-hidden="true" className="h-2 w-2 shrink-0" />
              )}
              <span
                className={cn(
                  "truncate text-sm",
                  message.read
                    ? "text-[var(--foreground-muted)]"
                    : "font-semibold text-[var(--foreground)]",
                )}
              >
                {message.from}
              </span>
              <span className="ml-auto shrink-0 text-xs text-[var(--muted-foreground)]">
                {message.receivedAt}
              </span>
            </span>
            <span
              className={cn(
                "truncate pl-4 text-sm",
                message.read
                  ? "text-[var(--foreground-muted)]"
                  : "font-medium text-[var(--foreground)]",
              )}
            >
              {message.subject}
            </span>
            <span className="truncate pl-4 text-xs text-[var(--muted-foreground)]">
              {message.preview}
            </span>
          </button>
        </li>
      );
    })}
  </ul>
);
