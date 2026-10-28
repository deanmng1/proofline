import { ArrowLeft, MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MailMessage } from "@/types";

type MailReaderProps = {
  message: MailMessage;
  onBack: () => void;
  onMarkUnread: (message: MailMessage) => void;
};

export const MailReader = ({ message, onBack, onMarkUnread }: MailReaderProps) => (
  <div className="flex h-full flex-col">
    <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-panel)] px-4 py-3">
      <Button
        variant="outline"
        size="icon"
        className="lg:hidden"
        onClick={onBack}
        aria-label="Back to message list"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-semibold tracking-[-0.02em] text-[var(--foreground)]">
          {message.subject}
        </h2>
        <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
          <span className="font-medium text-[var(--foreground-muted)]">{message.from}</span>
          {" · to "}
          {message.to} · {message.receivedAt}
        </p>
      </div>
      {message.read ? (
        <Button variant="outline" size="sm" onClick={() => onMarkUnread(message)}>
          <MailOpen className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
          Mark unread
        </Button>
      ) : null}
    </div>
    <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 text-sm leading-6 text-[var(--foreground-muted)]">
      <div className="mx-auto max-w-prose space-y-4">
        {message.body.split("\n\n").map((paragraph) => (
          <p key={paragraph} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  </div>
);
