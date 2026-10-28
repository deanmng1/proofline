import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/monitoring";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, { componentStack: info.componentStack });
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught an error:", error, info.componentStack);
    }
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) {
      return children;
    }

    if (fallback) {
      return fallback(error, this.reset);
    }

    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--background)] p-6 text-[var(--foreground)]"
      >
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-[var(--foreground-muted)]">
            An unexpected error occurred while rendering this view. You can retry or return to the
            dashboard.
          </p>
          <pre className="overflow-auto rounded-lg bg-[var(--surface-panel)] p-3 text-left text-xs text-[var(--muted-foreground)]">
            {error.message}
          </pre>
          <div className="flex justify-center gap-3">
            <Button onClick={this.reset}>Try again</Button>
            <Button
              variant="outline"
              onClick={() => {
                this.reset();
                window.location.assign("/app/overview");
              }}
            >
              Back to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
