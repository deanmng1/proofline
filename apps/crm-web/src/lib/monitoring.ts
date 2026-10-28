import type * as SentryType from "@sentry/browser";

let sentry: typeof SentryType | null = null;
let enabled = false;

const dsn = import.meta.env.VITE_SENTRY_DSN;
const environment = import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE;

export const initMonitoring = async (): Promise<void> => {
  if (dsn) {
    try {
      sentry = await import("@sentry/browser");
      sentry.init({
        dsn,
        environment,
        tracesSampleRate: 0.1,
      });
      enabled = true;
    } catch (error) {
      console.error("[monitoring] failed to initialize Sentry", error);
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("error", (event) => {
      reportError(event.error ?? new Error(event.message));
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      reportError(reason, { source: "unhandledrejection" });
    });
  }
};

export const reportError = (error: Error, context?: Record<string, unknown>): void => {
  if (enabled && sentry) {
    sentry.captureException(error, context ? { extra: context } : undefined);
  } else {
    console.error("[monitoring] error", error, context ?? "");
  }
};

export const reportEvent = (name: string, props?: Record<string, unknown>): void => {
  if (enabled && sentry) {
    sentry.captureMessage(name, props ? { extra: props } : undefined);
  } else {
    console.warn(`[monitoring] event: ${name}`, props ?? "");
  }
};
