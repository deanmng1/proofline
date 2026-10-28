import { AlertTriangle, LoaderCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type StatePanelProps = {
  title: string;
  description: string;
  kind: "loading" | "error";
  onRetry?: () => void;
};

export const StatePanel = ({ title, description, kind, onRetry }: StatePanelProps) => (
  <div
    className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] text-center"
    role={kind === "error" ? "alert" : "status"}
  >
    <div className="rounded-full bg-[var(--muted)] p-4">
      {kind === "loading" ? (
        <LoaderCircle className="h-6 w-6 animate-spin text-[var(--foreground)]" />
      ) : (
        <AlertTriangle className="h-6 w-6 text-amber-600" />
      )}
    </div>
    <div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
    </div>
    {kind === "error" && onRetry ? (
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
        Try again
      </Button>
    ) : null}
  </div>
);
