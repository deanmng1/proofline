import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
};

export const PageHeader = ({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) => (
  <div className={cn("flex flex-col gap-5 md:flex-row md:items-end md:justify-between", className)}>
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
        {eyebrow}
      </p>
      <div className="space-y-2">
        <h1
          tabIndex={-1}
          className="text-[1.8rem] font-semibold leading-[1] tracking-[-0.04em] text-[var(--foreground)] outline-none md:text-[2.2rem]"
        >
          {title}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-[var(--foreground-muted)]">{description}</p>
      </div>
    </div>
    {actions ? (
      <div className="flex w-full flex-wrap items-center gap-3 md:w-auto md:justify-end">
        {actions}
      </div>
    ) : null}
  </div>
);
