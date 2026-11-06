/**
 * BrowserContext init script: register before creating any page. Playwright's
 * page routes do not cover every worker transport, so worker execution is an
 * unsupported plane. This function must serialize without module closures.
 */
export function blockUnsupportedBrowserWorkers(scope = globalThis) {
  const marker = Symbol.for("proofline.browser-runtime-boundary.v1");
  const installed = Object.getOwnPropertyDescriptor(scope, marker)?.value;
  if (installed) {
    for (const name of ["Worker", "SharedWorker"]) {
      const descriptor = Object.getOwnPropertyDescriptor(scope, name);
      if (
        !descriptor ||
        descriptor.value !== installed[name] ||
        descriptor.configurable ||
        descriptor.writable
      )
        throw new Error("PROOFLINE_BROWSER_BOUNDARY_INSTALL_FAILED");
    }
    return;
  }

  const blocked = {};
  // Do not inherit from, retain, or copy any native constructor/prototype.
  for (const name of ["Worker", "SharedWorker"]) {
    function BlockedBrowserWorker() {
      throw new Error(`PROOFLINE_UNSUPPORTED_PLANE plane=${name}`);
    }
    Object.freeze(BlockedBrowserWorker.prototype);
    Object.freeze(BlockedBrowserWorker);
    blocked[name] = BlockedBrowserWorker;
  }
  try {
    for (const name of ["Worker", "SharedWorker"])
      Object.defineProperty(scope, name, {
        value: blocked[name],
        configurable: false,
        writable: false,
      });
    Object.defineProperty(scope, marker, { value: Object.freeze(blocked) });
  } catch {
    throw new Error("PROOFLINE_BROWSER_BOUNDARY_INSTALL_FAILED");
  }
}
