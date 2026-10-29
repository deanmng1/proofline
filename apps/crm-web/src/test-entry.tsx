import { createTestCapabilityGate } from "@/test-capability";

declare global {
  interface Window {
    __PROOFLINE_TEST_BOOTSTRAP__?: { capability: string };
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

void import("@/mocks/browser")
  .then(async ({ worker }) => {
    await worker.start({ onUnhandledRequest: "error" });
    return import("@/bootstrap");
  })
  .then(({ bootstrapApp }) => {
    if (PROOFLINE_TEST_ENTRY_MARKER) bootstrapApp({ testMode: true });
  });
