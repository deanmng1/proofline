const bootstrap = window.__PROOFLINE_TEST_BOOTSTRAP__;
if (!bootstrap?.capability || !/^[A-Za-z0-9_-]{32,128}$/.test(bootstrap.capability)) {
  throw new Error("PROOFLINE_TEST_ENTRY requires launcher capability");
}
await import("./main.jsx");
