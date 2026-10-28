import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type DetailDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: DetailDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "left-auto right-4 top-4 h-[calc(100vh-2rem)] w-[min(92vw,28rem)] translate-x-0 translate-y-0 overflow-y-auto p-0",
        )}
      >
        <div className="border-b border-[var(--border)] px-5 py-4">
          <DialogTitle className="text-base">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="mt-1">{description}</DialogDescription>
          ) : null}
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-[var(--border)] px-5 py-4">{footer}</div> : null}
      </DialogContent>
    </Dialog>
  );
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="space-y-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-start justify-between gap-4 rounded-[0.8rem] border border-[var(--border)] bg-[var(--surface-panel)] px-4 py-3"
        >
          <dt className="text-sm text-[var(--muted-foreground)]">{item.label}</dt>
          <dd className="text-right text-sm font-medium text-[var(--foreground)]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
