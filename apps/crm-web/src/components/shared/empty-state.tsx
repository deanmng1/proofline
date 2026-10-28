import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export const EmptyState = ({ title, description, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--surface-subtle)] px-6 py-14 text-center">
    <div className="mb-4 rounded-full bg-[var(--muted)] p-4">
      <Inbox className="h-6 w-6 text-[var(--foreground)]" aria-hidden="true" />
    </div>
    <h2 className="text-lg font-semibold">{title}</h2>
    <p className="mt-2 max-w-md text-sm text-[var(--muted-foreground)]">{description}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
);
