import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

type NotFoundPageProps = {
  embedded?: boolean;
};

export const NotFoundPage = ({ embedded = false }: NotFoundPageProps) => {
  const content = (
    <div className="space-y-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">404</p>
      <h1 className="font-[var(--font-display)] text-5xl">Page not found</h1>
      <p className="text-[var(--muted-foreground)]">
        The route you requested is outside this template shell.
      </p>
      <Button asChild>
        <Link to="/app/overview">Return to dashboard</Link>
      </Button>
    </div>
  );

  if (embedded) {
    return <div className="flex min-h-[60vh] items-center justify-center px-4">{content}</div>;
  }

  return <main className="flex min-h-screen items-center justify-center px-4">{content}</main>;
};
