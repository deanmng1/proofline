import { createTestCapabilityGate } from "@/test-capability";

declare global {
  interface Window {
    __PROOFLINE_TEST_BOOTSTRAP__?: { capability: string; adapter: "context" | "legacy" };
    __CRM_TEST_API__?: boolean;
  }
}

const PROOFLINE_TEST_ENTRY_MARKER = "PROOFLINE_TEST_ENTRY";
const address = new URL(window.location.href);
const injected = window.__PROOFLINE_TEST_BOOTSTRAP__;
delete window.__PROOFLINE_TEST_BOOTSTRAP__;
const gate = createTestCapabilityGate(injected?.capability);

gate.consume({ supplied: injected?.capability, origin: address.origin });
address.searchParams.delete("__proofline_capability");
window.history.replaceState(window.history.state, "", address);

const start = async () => {
  if (injected?.adapter === "legacy" && window.__CRM_TEST_API__ !== true) {
    const { worker } = await import("@/mocks/browser");
    await worker.start({ onUnhandledRequest: "error" });
  }
  const { bootstrapApp } = await import("@/bootstrap");
  if (PROOFLINE_TEST_ENTRY_MARKER) bootstrapApp({ testMode: true });
};

void start();
