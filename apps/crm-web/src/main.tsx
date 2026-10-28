import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/app";
import { ErrorBoundary } from "@/app/error-boundary";
import { AppProviders } from "@/app/providers";
import { initMonitoring } from "@/lib/monitoring";
import "@/styles.css";

void initMonitoring();

const enableMocking = async () => {
  if (import.meta.env.VITE_API_BASE_URL) return;
  const { worker } = await import("@/mocks/browser");
  await worker.start({
    onUnhandledRequest: "bypass",
  });
};

void enableMocking().then(() => {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element #root was not found in the document.");
  }
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AppProviders>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AppProviders>
    </React.StrictMode>,
  );
});
