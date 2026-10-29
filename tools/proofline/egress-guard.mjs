import childProcess from "node:child_process";
import { realpathSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import {
  assertSafeNodeArgv,
  guardImportOption,
  mergeGuardNodeOptions,
  parseAllowedOriginsEnvironment,
} from "./guard-policy.mjs";

const installKey = Symbol.for("proofline.egress-guard.installed");
if (!globalThis[installKey]) {
  globalThis[installKey] = true;
  installGuard();
}

function installGuard() {
  const allowedOrigins = new Set(
    parseAllowedOriginsEnvironment(process.env.PROOFLINE_ALLOWED_ORIGINS),
  );
  const immutableAllowedOrigins = JSON.stringify([...allowedOrigins]);
  const immutablePreload = process.env.PROOFLINE_GUARD_PRELOAD;
  const immutableNodeOptions = mergeGuardNodeOptions(process.env.NODE_OPTIONS ?? guardImportOption);

  const safeUrl = (url) => `${url.origin}${url.pathname}`;
  const denied = ({ plane, method, url, reason }) => {
    const normalizedMethod = String(method ?? "GET").toUpperCase();
    const normalizedUrl = url instanceof URL ? url : new URL(String(url));
    const error = new Error(
      `Proofline egress denied plane=${plane} method=${normalizedMethod} origin=${normalizedUrl.origin} url=${safeUrl(normalizedUrl)}${reason ? ` reason=${reason}` : ""}`,
    );
    error.code = "PROOFLINE_EGRESS_DENIED";
    return error;
  };
  const assertUrl = ({ plane, method, value }) => {
    let url;
    try {
      url = value instanceof URL ? new URL(value.href) : new URL(String(value));
    } catch {
      throw new Error(
        `Proofline egress denied plane=${plane} method=${String(method ?? "GET").toUpperCase()} origin=<invalid> url=<invalid> reason=malformed-url`,
      );
    }
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol))
      throw denied({ plane, method, url, reason: "unsupported-protocol" });
    if (url.username || url.password) throw denied({ plane, method, url, reason: "credentials" });
    if (!allowedOrigins.has(url.origin)) throw denied({ plane, method, url });
    return url;
  };

  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (originalFetch) {
    globalThis.fetch = async (input, init = {}) => {
      const method = String(
        init.method ?? (input instanceof Request ? input.method : "GET"),
      ).toUpperCase();
      if (init.dispatcher || init.agent)
        throw new Error(
          `Proofline egress denied plane=fetch method=${method} origin=<invalid> url=<invalid> reason=proxy-or-custom-dispatcher`,
        );
      assertUrl({
        plane: "fetch",
        method,
        value: input instanceof Request ? input.url : input,
      });
      let currentRequest;
      try {
        currentRequest = new Request(input, init);
      } catch {
        throw new Error(
          `Proofline egress denied plane=fetch method=${method} origin=<invalid> url=<invalid> reason=malformed-url`,
        );
      }
      assertUrl({ plane: "fetch", method, value: currentRequest.url });
      const redirect = currentRequest.redirect;
      for (let redirects = 0; ; redirects += 1) {
        const response = await originalFetch(currentRequest, { redirect: "manual" });
        const location = response.headers.get("location");
        if (!location || response.status < 300 || response.status > 399 || redirect === "manual")
          return response;
        const current = new URL(currentRequest.url);
        if (redirect === "error")
          throw denied({ plane: "fetch", method, url: current, reason: "redirect" });
        if (redirects >= 19)
          throw denied({ plane: "fetch", method, url: current, reason: "too-many-redirects" });
        let resolvedLocation;
        try {
          resolvedLocation = new URL(location, current);
        } catch {
          throw new Error(
            `Proofline egress denied plane=fetch method=${method} origin=<invalid> url=<invalid> reason=malformed-url`,
          );
        }
        const next = assertUrl({ plane: "fetch", method, value: resolvedLocation });
        if (next.origin !== current.origin)
          throw denied({ plane: "fetch", method, url: next, reason: "cross-origin-redirect" });
        if (method !== "GET" && method !== "HEAD")
          throw denied({ plane: "fetch", method, url: next, reason: "unsupported-body-redirect" });
        currentRequest = new Request(next, {
          method,
          headers: currentRequest.headers,
          redirect,
          signal: currentRequest.signal,
        });
      }
    };
  }

  const optionHeaders = (options) => {
    if (!options?.headers) return {};
    if (Array.isArray(options.headers)) return Object.fromEntries(options.headers);
    return Object.fromEntries(
      Object.entries(options.headers).map(([name, value]) => [name.toLowerCase(), String(value)]),
    );
  };
  const inspectHttp = (plane, protocol, args) => {
    let input;
    let options = {};
    if (typeof args[0] === "string" || args[0] instanceof URL) {
      input = args[0];
      if (args[1] && typeof args[1] === "object") options = args[1];
    } else if (args[0] && typeof args[0] === "object") options = args[0];
    if (
      options.agent ||
      options.createConnection ||
      options.lookup ||
      options.socketPath ||
      options.proxy ||
      options.dispatcher
    )
      throw new Error(
        `Proofline egress denied plane=${plane} method=${String(options.method ?? "GET").toUpperCase()} origin=<invalid> url=<invalid> reason=proxy-or-tunnel`,
      );
    const method = String(options.method ?? "GET").toUpperCase();
    let inputUrl;
    try {
      inputUrl = input ? new URL(String(input)) : undefined;
    } catch {
      throw new Error(
        `Proofline egress denied plane=${plane} method=${method} origin=<invalid> url=<invalid> reason=malformed-url`,
      );
    }
    const requestedPath = options.path ?? inputUrl?.pathname ?? "/";
    if (method === "CONNECT" || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(requestedPath)) {
      const target =
        inputUrl ??
        new URL(
          `${protocol}//${options.hostname ?? options.host ?? "127.0.0.1"}${requestedPath.startsWith("/") ? requestedPath : "/"}`,
        );
      throw denied({
        plane,
        method,
        url: target,
        reason: method === "CONNECT" ? "tunnel" : "proxy",
      });
    }
    const base = inputUrl ?? new URL(`${protocol}//127.0.0.1`);
    if (options.protocol) base.protocol = String(options.protocol);
    if (options.hostname) {
      const hostname = String(options.hostname);
      base.hostname =
        hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname;
    } else if (options.host) {
      const host = String(options.host);
      const colonCount = (host.match(/:/g) ?? []).length;
      base.host = colonCount > 1 && !host.startsWith("[") ? `[${host}]` : host;
    }
    if (options.port !== undefined) base.port = String(options.port);
    if (options.path) {
      const parsedPath = new URL(String(options.path), base);
      base.pathname = parsedPath.pathname;
      base.search = parsedPath.search;
    }
    if (options.auth) {
      const [username, password = ""] = String(options.auth).split(":", 2);
      base.username = username;
      base.password = password;
    }
    const headers = optionHeaders(options);
    if (headers.host && headers.host.toLowerCase() !== base.host.toLowerCase())
      throw denied({ plane, method, url: base, reason: "host-header-override" });
    assertUrl({ plane, method, value: base });
  };

  for (const [module, protocol, name] of [
    [http, "http:", "http"],
    [https, "https:", "https"],
  ]) {
    const originalRequest = module.request;
    const originalGet = module.get;
    module.request = function guardedRequest(...args) {
      inspectHttp(`${name}.request`, protocol, args);
      return originalRequest.apply(this, args);
    };
    module.get = function guardedGet(...args) {
      inspectHttp(`${name}.get`, protocol, args);
      return originalGet.apply(this, args);
    };
  }

  if (globalThis.WebSocket) {
    const OriginalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = class ProoflineGuardedWebSocket extends OriginalWebSocket {
      constructor(url, protocols) {
        assertUrl({ plane: "websocket", method: "CONNECT", value: url });
        super(url, protocols);
      }
    };
  }

  const forcedChildEnvironment = (provided = {}) => ({
    ...process.env,
    ...provided,
    PROOFLINE_ALLOWED_ORIGINS: immutableAllowedOrigins,
    PROOFLINE_GUARD_PRELOAD: immutablePreload,
    NODE_OPTIONS: mergeGuardNodeOptions(provided.NODE_OPTIONS ?? immutableNodeOptions),
  });
  const supportedNodeChild = (command, options = {}, argv = []) => {
    if (options.shell)
      throw new Error("Proofline unsupported-child-plane: shell child execution is denied.");
    let executable;
    try {
      executable = realpathSync(String(command));
    } catch {
      throw new Error(
        "Proofline unsupported-child-plane: child executable is not the trusted Node binary.",
      );
    }
    if (executable !== realpathSync(process.execPath))
      throw new Error(
        `Proofline unsupported-child-plane: executable ${path.basename(executable)} cannot inherit the Node preload.`,
      );
    assertSafeNodeArgv(argv);
  };
  const patchSpawn = (name) => {
    const original = childProcess[name];
    childProcess[name] = function guardedSpawn(command, argsOrOptions, maybeOptions) {
      const hasArgs = Array.isArray(argsOrOptions);
      const args = hasArgs ? argsOrOptions : undefined;
      const options = (hasArgs ? maybeOptions : argsOrOptions) ?? {};
      supportedNodeChild(command, options, args ?? []);
      const guardedOptions = { ...options, env: forcedChildEnvironment(options.env) };
      return args
        ? original.call(this, command, args, guardedOptions)
        : original.call(this, command, guardedOptions);
    };
  };
  patchSpawn("spawn");
  patchSpawn("spawnSync");
  const originalExecFile = childProcess.execFile;
  childProcess.execFile = function guardedExecFile(
    file,
    argsOrOptions,
    optionsOrCallback,
    callback,
  ) {
    const hasArgs = Array.isArray(argsOrOptions);
    const args = hasArgs ? argsOrOptions : [];
    const candidateOptions = hasArgs ? optionsOrCallback : argsOrOptions;
    const options =
      candidateOptions && typeof candidateOptions === "object" && !Array.isArray(candidateOptions)
        ? candidateOptions
        : {};
    const done =
      typeof callback === "function"
        ? callback
        : typeof optionsOrCallback === "function"
          ? optionsOrCallback
          : typeof argsOrOptions === "function"
            ? argsOrOptions
            : undefined;
    supportedNodeChild(file, options, args);
    const guardedOptions = { ...options, env: forcedChildEnvironment(options.env) };
    return done
      ? originalExecFile.call(this, file, args, guardedOptions, done)
      : originalExecFile.call(this, file, args, guardedOptions);
  };
  const originalExecFileSync = childProcess.execFileSync;
  childProcess.execFileSync = function guardedExecFileSync(file, argsOrOptions, maybeOptions) {
    const hasArgs = Array.isArray(argsOrOptions);
    const args = hasArgs ? argsOrOptions : [];
    const options = (hasArgs ? maybeOptions : argsOrOptions) ?? {};
    supportedNodeChild(file, options, args);
    return originalExecFileSync.call(this, file, args, {
      ...options,
      env: forcedChildEnvironment(options.env),
    });
  };
  const originalFork = childProcess.fork;
  childProcess.fork = function guardedFork(modulePath, argsOrOptions, maybeOptions) {
    const hasArgs = Array.isArray(argsOrOptions);
    const args = hasArgs ? argsOrOptions : [];
    const options = (hasArgs ? maybeOptions : argsOrOptions) ?? {};
    if (options.execPath && path.resolve(options.execPath) !== path.resolve(process.execPath))
      throw new Error(
        "Proofline unsupported-child-plane: fork requires the guarded Node executable.",
      );
    assertSafeNodeArgv(options.execArgv ?? []);
    if (options.silent === false && options.stdio && options.stdio !== "inherit")
      throw new Error("Proofline unsupported-child-plane: conflicting fork stdio.");
    return originalFork.call(this, modulePath, args, {
      ...options,
      env: forcedChildEnvironment(options.env),
    });
  };
  for (const name of ["exec", "execSync"]) {
    childProcess[name] = () => {
      throw new Error(`Proofline unsupported-child-plane: ${name} shell execution is denied.`);
    };
  }
  syncBuiltinESMExports();
}
