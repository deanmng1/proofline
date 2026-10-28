import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SectionCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  tone?: "primary" | "secondary" | "auxiliary";
};

export const SectionCard = ({
  title,
  description,
  children,
  className,
  tone = "secondary",
}: SectionCardProps) => (
  <Card className={className} data-tone={tone}>
    <CardHeader
      className={
        tone === "primary"
          ? "border-b border-[var(--border)] bg-[var(--surface-panel)] pb-4"
          : tone === "auxiliary"
            ? "border-b border-[var(--border)] bg-[var(--surface-panel)] pb-4"
            : "pb-4"
      }
    >
      <CardTitle className={tone === "primary" ? "text-base tracking-[-0.02em]" : undefined}>
        {title}
      </CardTitle>
      {description ? (
        <CardDescription className="text-[var(--foreground-muted)]">{description}</CardDescription>
      ) : null}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);
