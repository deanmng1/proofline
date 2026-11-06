import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
// @ts-expect-error Portable JavaScript API.
import { blockUnsupportedBrowserWorkers } from "../browser-runtime-boundary.mjs";

describe("browser runtime boundary", () => {
  test("denies_worker_construction_before_arguments_or_native_startup", () => {
    let started = 0;
    let coerced = 0;
    function NativeWorker() {
      started += 1;
    }
    const scope = { Worker: NativeWorker, SharedWorker: NativeWorker };
    blockUnsupportedBrowserWorkers(scope);
    for (const name of ["Worker", "SharedWorker"] as const) {
      const blocked = scope[name];
      expect(() =>
        Reflect.construct(blocked, [
          {
            toString() {
              coerced += 1;
              return "local.js";
            },
          },
        ]),
      ).toThrow(/PROOFLINE_UNSUPPORTED_PLANE/);
      expect(() => Reflect.apply(blocked, null, [])).toThrow(/PROOFLINE_UNSUPPORTED_PLANE/);
      expect(() => Reflect.construct(blocked.prototype.constructor, [])).toThrow(
        /PROOFLINE_UNSUPPORTED_PLANE/,
      );
      expect(Object.getPrototypeOf(blocked)).toBe(Function.prototype);
      expect(Object.getPrototypeOf(blocked.prototype)).toBe(Object.prototype);
      expect(Object.values(blocked)).not.toContain(NativeWorker);
    }
    expect({ started, coerced }).toEqual({ started: 0, coerced: 0 });
  });

  test("repeated_installation_keeps_both_worker_globals_blocked", () => {
    const scope: Record<string, unknown> = {};
    blockUnsupportedBrowserWorkers(scope);
    blockUnsupportedBrowserWorkers(scope);
    for (const name of ["Worker", "SharedWorker"]) {
      expect(() => Reflect.construct(scope[name] as typeof Worker, ["local.js"])).toThrow(
        /PROOFLINE_UNSUPPORTED_PLANE/,
      );
      expect(Reflect.set(scope, name, function NativeWorker() {})).toBe(false);
      expect(Reflect.deleteProperty(scope, name)).toBe(false);
    }
  });

  test("rejects_an_unreplaceable_native_worker_global", () => {
    const scope = Object.defineProperty({}, "Worker", { value: function NativeWorker() {} });
    expect(() => blockUnsupportedBrowserWorkers(scope)).toThrow(
      /PROOFLINE_BROWSER_BOUNDARY_INSTALL_FAILED/,
    );
  });

  test("rejects_inconsistent_prior_installation_instead_of_accepting_an_open_plane", () => {
    const scope = { [Symbol.for("proofline.browser-runtime-boundary.v1")]: {} };
    expect(() => blockUnsupportedBrowserWorkers(scope)).toThrow(
      /PROOFLINE_BROWSER_BOUNDARY_INSTALL_FAILED/,
    );
  });

  test("serializes_without_module_closures_and_preserves_supported_globals", () => {
    const supported = { fetch: () => "fetch", WebSocket: function Socket() {} };
    const scope = { ...supported };
    runInNewContext(`(${blockUnsupportedBrowserWorkers.toString()})()`, scope);
    expect(() => runInNewContext('new Worker("local.js")', scope)).toThrow(
      /PROOFLINE_UNSUPPORTED_PLANE.*Worker/,
    );
    expect(() => runInNewContext('new SharedWorker("local.js")', scope)).toThrow(
      /PROOFLINE_UNSUPPORTED_PLANE.*SharedWorker/,
    );
    expect(scope.fetch).toBe(supported.fetch);
    expect(scope.WebSocket).toBe(supported.WebSocket);
  });
});
