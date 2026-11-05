import childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import dgram from "node:dgram";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import nodeModule, { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath, urlToHttpOptions } from "node:url";
import { promisify } from "node:util";
import workerThreads from "node:worker_threads";
import {
  assertSafeNodeArgv,
  guardedToolEnvironment,
  guardImportOption,
  mergeGuardNodeOptions,
  parseAllowedChildCapabilitiesEnvironment,
  parseAllowedOriginsEnvironment,
  prooflineDelegatedPolicy,
  snapshotChildOptions,
  snapshotOptions,
  snapshotStringArray,
  unsafeGitEnvironmentKey,
} from "./guard-policy.mjs";

const installKey = Symbol.for("proofline.egress-guard.installed");
if (!globalThis[installKey]) {
  globalThis[installKey] = true;
  installGuard();
}

function installGuard() {
  // Async loaders run in Node's internal thread, outside the public Worker API.
  // Synchronous registerHooks stays in this guarded runtime (used by Playwright).
  nodeModule.register = () => {
    throw new Error(
      "Proofline unsupported-loader-plane: asynchronous module loaders are not supported.",
    );
  };
  // A Worker starts a separate JS runtime and can discard environment/execArgv.
  // Threads are unsupported until they have their own reviewed startup guard.
  // Do not inherit the original constructor or prototype: either would expose it.
  workerThreads.Worker = class ProoflineUnsupportedWorker {
    constructor() {
      throw new Error("Proofline unsupported-worker-plane: Node Worker threads are not supported.");
    }
  };
  const allowedOrigins = new Set(
    parseAllowedOriginsEnvironment(process.env.PROOFLINE_ALLOWED_ORIGINS),
  );
  const immutableAllowedOrigins = JSON.stringify([...allowedOrigins]);
  const allowedChildCapabilities = parseAllowedChildCapabilitiesEnvironment(
    process.env.PROOFLINE_ALLOWED_CHILD_CAPABILITIES,
  );
  const immutableAllowedChildCapabilities = JSON.stringify(allowedChildCapabilities);
  const allowedChildCapabilityIdentities = new Set(
    allowedChildCapabilities.map(({ executable, purpose }) => `${executable}\0${purpose}`),
  );
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

  // Enforce the actual public Socket connect boundary too: HTTP agents retain
  // references to native createConnection functions, so module exports alone do
  // not cover the eventual destination. Numeric addresses avoid resolver routing.
  const socketOptions = (args, plane) => {
    if (Array.isArray(args[0])) args = args[0]; // Node's normalized connect overload.
    let options;
    let callback;
    if (args[0] && typeof args[0] === "object") {
      options = snapshotOptions(args[0], ["host", "hostname", "port", "path", "lookup", "socket"]);
      callback = args[1];
    } else {
      options = { port: args[0] };
      if (typeof args[1] === "string") {
        options.host = args[1];
        callback = args[2];
      } else callback = args[1];
    }
    if (options.path || options.lookup || options.socket)
      throw new Error(`Proofline egress denied plane=${plane} reason=unsupported-socket-route`);
    const host = String(options.host ?? options.hostname ?? "localhost");
    const port = String(options.port ?? "");
    const normalizedHost = host === "::1" ? "[::1]" : host;
    if (
      !/^\d+$/.test(port) ||
      ![...allowedOrigins].some((origin) => {
        const url = new URL(origin);
        return (
          url.hostname === normalizedHost &&
          Number(url.port || (url.protocol === "https:" || url.protocol === "wss:" ? 443 : 80)) ===
            Number(port)
        );
      })
    )
      throw new Error(
        `Proofline egress denied plane=${plane} reason=undeclared-numeric-destination`,
      );
    return {
      options: {
        ...options,
        host: host.replace(/^\[|\]$/g, ""),
        hostname: undefined,
        port: Number(port),
      },
      callback,
    };
  };
  const originalSocketConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedSocketConnect(...args) {
    const { options, callback } = socketOptions(args, "socket.connect");
    return originalSocketConnect.call(this, options, callback);
  };
  const originalTlsConnect = tls.connect;
  tls.connect = function guardedTlsConnect(...args) {
    // TLS also permits (port, host, options, callback); collapse it once.
    if (typeof args[0] !== "object") {
      const values = [...args];
      const port = values.shift();
      const host = typeof values[0] === "string" ? values.shift() : undefined;
      const supplied = values[0] && typeof values[0] === "object" ? values.shift() : {};
      args = [
        { ...snapshotOptions(supplied), port, ...(host === undefined ? {} : { host }) },
        values[0],
      ];
    }
    const { options, callback } = socketOptions(args, "tls.connect");
    return originalTlsConnect.call(this, options, callback);
  };
  const unsupportedNetwork = (name) =>
    function unsupportedNetworkOperation() {
      throw new Error(`Proofline unsupported-network-plane: ${name} is not supported.`);
    };
  // These transports are not used by the supported harness. Deny before native
  // validation/dispatch, including prototypes held by newly configured resolvers.
  http2.connect = unsupportedNetwork("http2.connect");
  const OriginalDatagram = dgram.Socket;
  for (const key of ["send", "sendto", "connect"])
    if (typeof OriginalDatagram.prototype[key] === "function")
      OriginalDatagram.prototype[key] = unsupportedNetwork(`dgram.Socket.${key}`);
  dgram.createSocket = unsupportedNetwork("dgram.createSocket");
  dgram.Socket = unsupportedNetwork("dgram.Socket");
  dgram.Socket.prototype = OriginalDatagram.prototype;
  Object.defineProperty(OriginalDatagram.prototype, "constructor", {
    value: dgram.Socket,
    writable: true,
    configurable: true,
  });
  for (const module of new Set([dns, dnsPromises, dns.promises])) {
    for (const key of Object.keys(module))
      if (
        (key === "lookup" ||
          key === "lookupService" ||
          key === "reverse" ||
          /^resolve/.test(key)) &&
        typeof module[key] === "function"
      )
        module[key] = unsupportedNetwork(`dns.${key}`);
    for (const key of Object.getOwnPropertyNames(module.Resolver.prototype))
      if (key === "reverse" || /^resolve/.test(key))
        module.Resolver.prototype[key] = unsupportedNetwork(`dns.Resolver.${key}`);
  }

  const syntheticLookup = (hostname, supplied = {}) => {
    if (
      typeof hostname !== "string" ||
      !(
        hostname === "localhost" ||
        hostname === "::1" ||
        /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
      )
    )
      throw new Error(
        "Proofline unsupported-network-plane: dns.lookup supports synthetic loopback names only.",
      );
    const options = typeof supplied === "number" ? { family: supplied } : snapshotOptions(supplied);
    const family =
      options.family === "IPv6" ? 6 : options.family === "IPv4" ? 4 : (options.family ?? 0);
    if (![0, 4, 6].includes(family)) throw new TypeError("Unsupported lookup family.");
    const result =
      hostname === "localhost"
        ? { address: family === 6 ? "::1" : "127.0.0.1", family: family === 6 ? 6 : 4 }
        : { address: hostname, family: net.isIP(hostname) };
    if (!result.family || (family && family !== result.family))
      throw new Error("Proofline unsupported-network-plane: dns.lookup address family mismatch.");
    return options.all ? [result] : result;
  };
  const promiseLookup = async (hostname, options) => syntheticLookup(hostname, options);
  dnsPromises.lookup = promiseLookup;
  dns.promises.lookup = promiseLookup;
  dns.lookup = function guardedLookup(hostname, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    const result = syntheticLookup(hostname, options);
    if (typeof callback !== "function") throw new TypeError("lookup requires a callback.");
    process.nextTick(() =>
      Array.isArray(result)
        ? callback(null, result)
        : callback(null, result.address, result.family),
    );
  };
  Object.defineProperty(dns.lookup, promisify.custom, { value: promiseLookup });

  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (originalFetch) {
    globalThis.fetch = async (input, init = {}) => {
      init = snapshotOptions(init, [
        "method",
        "headers",
        "body",
        "signal",
        "redirect",
        "dispatcher",
        "agent",
        "credentials",
        "mode",
        "cache",
        "referrer",
        "referrerPolicy",
        "integrity",
        "keepalive",
        "duplex",
      ]);
      if (!(input instanceof Request)) input = String(input);
      if (init.method !== undefined) init.method = String(init.method);
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
        if (!location || response.status < 300 || response.status > 399 || redirect === "manual") {
          if (redirects > 0)
            Object.defineProperty(response, "redirected", {
              configurable: true,
              value: true,
            });
          return response;
        }
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

  const transportKeys = [
    "_defaultAgent",
    "defaultAgent",
    "agent",
    "createConnection",
    "lookup",
    "socketPath",
    "proxy",
    "dispatcher",
    "socket",
    "connection",
    "connect",
  ];
  const captureHeaderArray = (values) => {
    const length = values.length;
    const captured = [];
    // Indexed capture never consults caller collection helpers, constructor,
    // Symbol.species or iterator, and always produces an ordinary array.
    for (let index = 0; index < length; index += 1) captured.push(String(values[index]));
    return captured;
  };
  const connectionOptions = (value, plane) => {
    const options = snapshotOptions(value ?? {}, [
      ...transportKeys,
      "protocol",
      "hostname",
      "host",
      "port",
      "defaultPort",
      "path",
      "method",
      "auth",
      "headers",
    ]);
    for (const key of transportKeys)
      if (options[key] !== undefined && options[key] !== false && options[key] !== null)
        throw new Error(`Proofline egress denied plane=${plane} reason=proxy-or-custom-dispatcher`);
    for (const key of [
      "protocol",
      "hostname",
      "host",
      "port",
      "defaultPort",
      "path",
      "method",
      "auth",
    ])
      if (options[key] !== undefined) options[key] = String(options[key]);
    if (options.headers !== undefined) {
      const headers = options.headers;
      if (Array.isArray(headers)) {
        // Node HTTP accepts a flat raw-header list.
        options.headers = captureHeaderArray(headers);
      } else {
        options.headers = Object.fromEntries(
          Object.entries(snapshotOptions(headers)).map(([key, value]) => [
            key,
            Array.isArray(value) ? captureHeaderArray(value) : String(value),
          ]),
        );
      }
    }
    return options;
  };
  const inspectHttp = (plane, protocol, args) => {
    let input;
    let supplied = {};
    let callback;
    if (typeof args[0] === "string" || args[0] instanceof URL) {
      // Coerce once and dispatch the resulting plain options, never this URL object.
      input = String(args[0]);
      if (typeof args[1] === "function") callback = args[1];
      else {
        supplied = args[1] ?? {};
        callback = args[2];
      }
    } else {
      supplied = args[0] ?? {};
      callback = args[1];
    }
    const options = connectionOptions(supplied, plane);
    const method = (options.method ?? "GET").toUpperCase();
    let base;
    try {
      base = input === undefined ? new URL(`${protocol}//127.0.0.1`) : new URL(input);
    } catch {
      throw new Error(
        `Proofline egress denied plane=${plane} method=${method} origin=<invalid> url=<invalid> reason=malformed-url`,
      );
    }
    const inputOptions = input === undefined ? {} : urlToHttpOptions(base);
    const effective = { ...inputOptions, ...options };
    const effectiveProtocol = effective.protocol ?? protocol;
    const hostname = effective.hostname ?? effective.host ?? "localhost";
    const host = hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname;
    const port =
      effective.port ?? effective.defaultPort ?? (effectiveProtocol === "https:" ? "443" : "80");
    try {
      base = new URL(`${effectiveProtocol}//${host}:${port}`);
    } catch {
      throw new Error(
        `Proofline egress denied plane=${plane} method=${method} origin=<invalid> url=<invalid> reason=malformed-url`,
      );
    }
    const requestedPath = effective.path ?? "/";
    if (method === "CONNECT" || !requestedPath.startsWith("/"))
      throw denied({ plane, method, url: base, reason: method === "CONNECT" ? "tunnel" : "proxy" });
    const parsedPath = new URL(requestedPath, base);
    if (parsedPath.origin !== base.origin)
      throw denied({ plane, method, url: parsedPath, reason: "proxy" });
    base.pathname = parsedPath.pathname;
    base.search = parsedPath.search;
    if (effective.auth) throw denied({ plane, method, url: base, reason: "credentials" });
    const headers = effective.headers;
    const headerEntries = Array.isArray(headers)
      ? Array.from({ length: headers.length / 2 }, (_, index) => [
          headers[index * 2],
          headers[index * 2 + 1],
        ])
      : Object.entries(headers ?? {});
    for (const [key, value] of headerEntries)
      if (key.toLowerCase() === "host" && String(value).toLowerCase() !== base.host.toLowerCase())
        throw denied({ plane, method, url: base, reason: "host-header-override" });
    assertUrl({ plane, method, value: base });
    return {
      method,
      url: base,
      args: [
        {
          ...effective,
          protocol: base.protocol,
          hostname: base.hostname.replace(/^\[|\]$/g, ""),
          host: undefined,
          port: Number(port),
          defaultPort: undefined,
          path: requestedPath,
          method,
        },
        callback,
      ],
    };
  };

  for (const [module, protocol, name] of [
    [http, "http:", "http"],
    [https, "https:", "https"],
  ]) {
    const originalRequest = module.request;
    const originalGet = module.get;
    module.request = function guardedRequest(...args) {
      return originalRequest.apply(this, inspectHttp(`${name}.request`, protocol, args).args);
    };
    module.get = function guardedGet(...args) {
      return originalGet.apply(this, inspectHttp(`${name}.get`, protocol, args).args);
    };
    const OriginalClientRequest = module.ClientRequest;
    if (typeof OriginalClientRequest === "function") {
      function ProoflineGuardedClientRequest(...args) {
        const { method, url } = inspectHttp(`${name}.ClientRequest`, protocol, args);
        throw denied({ plane: `${name}.ClientRequest`, method, url, reason: "direct-constructor" });
      }
      // Share the instance prototype for native methods and instanceof, but replace
      // its constructor and never inherit the original static constructor.
      ProoflineGuardedClientRequest.prototype = OriginalClientRequest.prototype;
      Object.defineProperty(OriginalClientRequest.prototype, "constructor", {
        value: ProoflineGuardedClientRequest,
        writable: true,
        configurable: true,
      });
      module.ClientRequest = ProoflineGuardedClientRequest;
    }
  }

  if (globalThis.WebSocket) {
    const OriginalWebSocket = globalThis.WebSocket;
    function ProoflineGuardedWebSocket(value, protocols) {
      if (!new.target) throw new TypeError("WebSocket requires new.");
      const stableValue = new URL(String(value));
      if (stableValue.protocol === "http:") stableValue.protocol = "ws:";
      if (stableValue.protocol === "https:") stableValue.protocol = "wss:";
      const url = assertUrl({ plane: "websocket", method: "CONNECT", value: stableValue });
      let normalized = protocols;
      if (protocols && typeof protocols === "object" && !Array.isArray(protocols)) {
        normalized = connectionOptions(protocols, "websocket");
        if (normalized.protocols !== undefined)
          normalized.protocols = Array.isArray(normalized.protocols)
            ? snapshotStringArray(normalized.protocols, "WebSocket protocols")
            : String(normalized.protocols);
      } else if (Array.isArray(protocols))
        normalized = snapshotStringArray(protocols, "WebSocket protocols");
      else if (protocols !== undefined) normalized = String(protocols);
      return Reflect.construct(OriginalWebSocket, [url.href, normalized], new.target);
    }
    Object.setPrototypeOf(ProoflineGuardedWebSocket, Object.getPrototypeOf(OriginalWebSocket));
    ProoflineGuardedWebSocket.prototype = OriginalWebSocket.prototype;
    Object.defineProperty(OriginalWebSocket.prototype, "constructor", {
      value: ProoflineGuardedWebSocket,
      writable: true,
      configurable: true,
    });
    for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"])
      Object.defineProperty(
        ProoflineGuardedWebSocket,
        key,
        Object.getOwnPropertyDescriptor(OriginalWebSocket, key),
      );
    globalThis.WebSocket = ProoflineGuardedWebSocket;
  }

  const delegatedPolicy = (provided) => {
    const delegatedOrigins = parseAllowedOriginsEnvironment(provided.PROOFLINE_ALLOWED_ORIGINS);
    const delegatedCapabilities = parseAllowedChildCapabilitiesEnvironment(
      provided.PROOFLINE_ALLOWED_CHILD_CAPABILITIES,
    );
    if (
      delegatedOrigins.some((origin) => !allowedOrigins.has(origin)) ||
      delegatedCapabilities.some(
        ({ executable, purpose }) =>
          !allowedChildCapabilityIdentities.has(`${executable}\0${purpose}`),
      )
    )
      throw new Error(
        "Proofline delegated policy cannot broaden installed origins or child capabilities.",
      );
    return {
      origins: JSON.stringify(delegatedOrigins),
      capabilities: JSON.stringify(delegatedCapabilities),
    };
  };
  // These command-scope values override repository/worktree includes. No admitted operation
  // reads worktree content through Git: attributes, filters, diff drivers and converters never run.
  const gitConfig = {
    "core.hooksPath": "/dev/null",
    "commit.gpgSign": "false",
    "tag.gpgSign": "false",
    "core.pager": "",
    "core.fsmonitor": "false",
    "core.attributesFile": "/dev/null",
    "core.excludesFile": "/dev/null",
    "maintenance.auto": "false",
    "gc.auto": "0",
    "protocol.allow": "never",
  };
  const fixedGitEnvironment = {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_PAGER: "",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_CONFIG_COUNT: String(Object.keys(gitConfig).length),
    ...Object.fromEntries(
      Object.entries(gitConfig).flatMap(([key, value], index) => [
        [`GIT_CONFIG_KEY_${index}`, key],
        [`GIT_CONFIG_VALUE_${index}`, value],
      ]),
    ),
  };
  const forcedChildEnvironment = (provided = {}, delegated = false) => {
    const policy = delegated
      ? delegatedPolicy(provided)
      : {
          origins: immutableAllowedOrigins,
          capabilities: immutableAllowedChildCapabilities,
        };
    return {
      ...process.env,
      ...provided,
      PROOFLINE_ALLOWED_ORIGINS: policy.origins,
      PROOFLINE_ALLOWED_CHILD_CAPABILITIES: policy.capabilities,
      PROOFLINE_GUARD_PRELOAD: immutablePreload,
      NODE_OPTIONS: mergeGuardNodeOptions(provided.NODE_OPTIONS ?? immutableNodeOptions),
      ...fixedGitEnvironment,
      ...guardedToolEnvironment,
      GIT_AUTHOR_NAME: "Proofline Guarded",
      GIT_AUTHOR_EMAIL: "proofline@example.invalid",
      GIT_COMMITTER_NAME: "Proofline Guarded",
      GIT_COMMITTER_EMAIL: "proofline@example.invalid",
    };
  };
  const resolveExecutable = (command, environment = process.env) => {
    if (typeof command !== "string")
      throw new Error("Proofline child executable must be a primitive string.");
    const value = command;
    const candidates = value.includes(path.sep)
      ? [value]
      : String(environment?.PATH ?? process.env.PATH ?? "")
          .split(path.delimiter)
          .filter(Boolean)
          .map((directory) => path.join(directory, value));
    for (const candidate of candidates)
      try {
        accessSync(candidate, constants.X_OK);
        return realpathSync(candidate);
      } catch {
        // Continue through PATH; exact allowlist comparison happens after resolution.
      }
    throw new Error(
      `Proofline unsupported-child-plane: child executable ${path.basename(value)} cannot be resolved to an exact reviewed file.`,
    );
  };
  const safeGitRevision = (value) =>
    typeof value === "string" &&
    /^(?:HEAD|[0-9a-f]{7,64}|(?:refs\/(?:heads|remotes)\/)?[A-Za-z0-9][A-Za-z0-9._/-]*)(?:[~^][0-9]*)?(?:\^\{commit\})?$/.test(
      value,
    ) &&
    !value.includes("..") &&
    !value.includes("//") &&
    !value.includes("@{");
  const safeGitObject = (value) =>
    typeof value === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value);
  const safeGitPath = (value) =>
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("-") &&
    !value.startsWith(":") &&
    !path.isAbsolute(value) &&
    !value.split(/[\\/]/).some((part) => part === ".." || part === "." || !part) &&
    !/[\0\r\n]/.test(value);
  const unsafeGitEnvironment = (environment = {}) => {
    for (const [key, value] of Object.entries(environment)) {
      if (key in fixedGitEnvironment && String(value) === fixedGitEnvironment[key]) continue;
      if (unsafeGitEnvironmentKey(key)) return key;
    }
    return undefined;
  };
  const assertSafeGitArgv = (argv, environment) => {
    const unsafeEnvironment = unsafeGitEnvironment(environment);
    if (unsafeEnvironment)
      throw new Error(
        `Proofline unsupported-child-plane: unsafe git environment ${unsafeEnvironment} is denied.`,
      );
    const [subcommand, ...args] = argv;
    const exact = (...expected) =>
      args.length === expected.length && expected.every((value, index) => args[index] === value);
    const blob = args[1];
    const separator = typeof blob === "string" ? blob.indexOf(":") : -1;
    const accepted =
      (subcommand === "init" && exact("-q")) ||
      (subcommand === "hash-object" && exact("-w", "--stdin", "--no-filters")) ||
      (subcommand === "mktree" && exact("-z")) ||
      (subcommand === "commit-tree" &&
        ((args.length === 3 && safeGitObject(args[0]) && args[1] === "-m" && Boolean(args[2])) ||
          (args.length === 5 &&
            safeGitObject(args[0]) &&
            args[1] === "-p" &&
            safeGitObject(args[2]) &&
            args[3] === "-m" &&
            Boolean(args[4])))) ||
      (subcommand === "ls-files" &&
        (exact("--others", "--exclude-standard", "-z") ||
          exact("--stage", "-z") ||
          exact("--cached", "--others", "--exclude-standard", "-z"))) ||
      (subcommand === "ls-tree" &&
        ((args.length === 4 &&
          args[0] === "-r" &&
          args[1] === "--name-only" &&
          args[2] === "-z" &&
          safeGitRevision(args[3])) ||
          (args.length === 3 &&
            args[0] === "-r" &&
            args[1] === "-z" &&
            safeGitRevision(args[2])))) ||
      (subcommand === "merge-base" &&
        args.length === 3 &&
        args[0] === "--all" &&
        safeGitRevision(args[1]) &&
        safeGitRevision(args[2])) ||
      (subcommand === "rev-parse" &&
        (exact("--is-shallow-repository") ||
          (args.length === 1 && safeGitRevision(args[0])) ||
          (args.length === 2 && args[0] === "--verify" && safeGitRevision(args[1])))) ||
      (subcommand === "cat-file" &&
        args.length === 2 &&
        args[0] === "blob" &&
        separator > 0 &&
        safeGitRevision(blob.slice(0, separator)) &&
        safeGitPath(blob.slice(separator + 1))) ||
      (subcommand === "update-ref" &&
        args.length === 2 &&
        (args[0] === "HEAD" ||
          /^refs\/(?:heads|remotes)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(args[0])) &&
        !args[0].includes("..") &&
        !args[0].includes("//") &&
        safeGitObject(args[1]));
    if (!accepted) {
      if (subcommand?.startsWith("-") || args.some((argument) => argument.startsWith("--config")))
        throw new Error("Proofline unsupported-child-plane: unsafe git configuration is denied.");
      if (["fetch", "ls-remote", "pull", "push", "remote", "send-pack"].includes(subcommand))
        throw new Error(
          "Proofline unsupported-child-plane: network-capable git arguments are denied.",
        );
      throw new Error(
        "Proofline unsupported-child-plane: unsafe git argv is denied; only exact reviewed repository commands are allowed.",
      );
    }
  };
  const nativeChildInvocation = (capability, argv, options, delegated) => {
    const env = forcedChildEnvironment(options.env, delegated);
    if (capability.purpose !== "git-local") return { argv, options: { ...options, env } };
    // Never inherit loader/library, HOME/XDG, executable search, config or helper authority.
    const cwd = options.cwd ?? process.cwd();
    if (
      typeof cwd !== "string" ||
      !path.isAbsolute(cwd) ||
      !statSync(cwd).isDirectory() ||
      options.argv0 !== undefined
    )
      throw new Error(
        "Proofline unsupported-child-plane: git requires an absolute directory and its reviewed argv0.",
      );
    const policy = Object.fromEntries(
      Object.entries(env).filter(
        ([key]) => key.startsWith("PROOFLINE_") || key === "NODE_OPTIONS" || key.startsWith("GIT_"),
      ),
    );
    for (const key of Object.keys(policy))
      if (unsafeGitEnvironmentKey(key) && !(key in fixedGitEnvironment)) delete policy[key];
    return {
      argv: [
        "--no-pager",
        "--no-lazy-fetch",
        "--no-replace-objects",
        "--literal-pathspecs",
        ...argv,
        ...(argv[0] === "init"
          ? ["--template=", "--initial-branch=main", "--object-format=sha1", "--ref-format=files"]
          : []),
        ...(argv[0] === "commit-tree" ? ["--no-gpg-sign"] : []),
      ],
      options: {
        ...options,
        cwd: realpathSync(cwd),
        env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", ...policy },
      },
    };
  };
  const assertSafePnpmArgv = (argv) => {
    const runner = argv.slice(0, 3).join(" ");
    if (runner === "exec vitest run") return assertRunnerArgv(argv.slice(2), "Vitest", "run");
    if (runner === "exec playwright test")
      return assertRunnerArgv(argv.slice(2), "Playwright", "test");
    if (
      argv.length === 4 &&
      argv[0] === "nx" &&
      argv[1] === "run" &&
      ["crm-web:build", "crm-web:build-test"].includes(argv[2]) &&
      argv[3] === "--skip-nx-cache"
    )
      return;
    throw new Error(
      "Proofline unsupported-child-plane: pnpm is limited to reviewed Vitest, Playwright, and CRM build argv.",
    );
  };
  const assertSafeNxArgv = (argv) => {
    if (
      argv.length === 3 &&
      argv[0] === "run" &&
      ["crm-web:build", "crm-web:build-test"].includes(argv[1]) &&
      argv[2] === "--skip-nx-cache"
    )
      return;
    throw new Error(
      "Proofline unsupported-child-plane: Nx is limited to reviewed CRM build targets.",
    );
  };
  const assertRunnerArgv = (argv, runner, verb) => {
    if (argv[0] !== verb)
      throw new Error(
        `Proofline unsupported-child-plane: ${runner} is limited to its reviewed ${verb} mode.`,
      );
    if (
      argv.some((argument) =>
        /^(?:--inspect|--inspect-brk|--loader|--experimental-loader|--import|--require|-r)(?:=|$)/.test(
          argument,
        ),
      )
    )
      throw new Error(
        `Proofline unsupported-child-plane: ${runner} cannot add a loader, preload, or inspector.`,
      );
  };
  const chromiumFlags = new Set([
    "--allow-pre-commit-input",
    "--blink-settings",
    "--disable-back-forward-cache",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-breakpad",
    "--disable-client-side-phishing-detection",
    "--disable-component-extensions-with-background-pages",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-dev-shm-usage",
    "--disable-edgeupdater",
    "--disable-extensions",
    "--disable-features",
    "--disable-field-trial-config",
    "--disable-hang-monitor",
    "--disable-infobars",
    "--disable-ipc-flooding-protection",
    "--disable-popup-blocking",
    "--disable-prompt-on-repost",
    "--disable-renderer-backgrounding",
    "--disable-search-engine-choice-screen",
    "--disable-sync",
    "--disable-updater-scheduler",
    "--edge-skip-compat-layer-relaunch",
    "--enable-features",
    "--enable-unsafe-swiftshader",
    "--export-tagged-pdf",
    "--force-color-profile",
    "--headless",
    "--hide-scrollbars",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-sandbox",
    "--no-service-autorun",
    "--no-startup-window",
    "--password-store",
    "--remote-debugging-pipe",
    "--unsafely-disable-devtools-self-xss-warnings",
    "--use-mock-keychain",
    "--user-data-dir",
  ]);
  const assertSafeBrowserArgv = (executable, argv) => {
    const name = executable.toLowerCase();
    if (name.includes("chromium") || name.includes("chrome-headless-shell")) {
      for (const argument of argv) {
        if (!argument.startsWith("--"))
          throw new Error(
            "Proofline unsupported-child-plane: Chromium positional launch arguments are denied.",
          );
        const flag = argument.split("=", 1)[0];
        if (!chromiumFlags.has(flag))
          throw new Error(
            `Proofline unsupported-child-plane: unsupported Chromium launch flag ${flag}.`,
          );
        if (
          flag === "--user-data-dir" &&
          (!argument.includes("=") ||
            !path
              .basename(argument.slice(argument.indexOf("=") + 1))
              .startsWith("playwright_chromiumdev_profile-"))
        )
          throw new Error(
            "Proofline unsupported-child-plane: Chromium requires a Playwright-owned profile.",
          );
      }
      if (
        !argv.includes("--remote-debugging-pipe") ||
        !argv.some((arg) => arg.startsWith("--user-data-dir="))
      )
        throw new Error(
          "Proofline unsupported-child-plane: Chromium requires the reviewed pipe/profile launch contract.",
        );
      return;
    }
    if (name.includes("firefox")) {
      const allowed = new Set(["-no-remote", "-headless", "-juggler-pipe", "-silent", "-profile"]);
      for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "-profile") {
          const profile = argv[++index];
          if (!profile || !path.basename(profile).startsWith("playwright_firefoxdev_profile-"))
            throw new Error(
              "Proofline unsupported-child-plane: Firefox requires a Playwright-owned profile.",
            );
        } else if (!allowed.has(argument))
          throw new Error(
            `Proofline unsupported-child-plane: unsupported Firefox launch argument ${argument}.`,
          );
      }
      if (!argv.includes("-juggler-pipe"))
        throw new Error("Proofline unsupported-child-plane: Firefox requires the juggler pipe.");
      return;
    }
    if (name.includes("webkit")) {
      const allowed = new Set(["--headless", "--inspector-pipe"]);
      if (!argv.includes("--inspector-pipe") || argv.some((argument) => !allowed.has(argument)))
        throw new Error(
          "Proofline unsupported-child-plane: WebKit requires the reviewed inspector-pipe launch contract.",
        );
      return;
    }
    throw new Error("Proofline unsupported-child-plane: unknown Playwright browser executable.");
  };
  const assertSafeEsbuildArgv = (argv) => {
    if (argv.length === 2 && /^--service=\d+\.\d+\.\d+$/.test(argv[0]) && argv[1] === "--ping")
      return;
    throw new Error(
      "Proofline unsupported-child-plane: esbuild is limited to its reviewed service argv.",
    );
  };
  const assertSafeFfmpegArgv = (argv) => {
    const expected = [
      "-loglevel",
      "error",
      "-f",
      "matroska",
      "-fpsprobesize",
      "0",
      "-probesize",
      "32",
      "-analyzeduration",
      "0",
      "-i",
      "pipe:0",
      "-y",
      "-an",
      "-r",
      "25",
      "-c:v",
      "vp8",
      "-qmin",
      "0",
      "-qmax",
      "50",
      "-crf",
      "8",
      "-deadline",
      "realtime",
      "-speed",
      "8",
      "-b:v",
      "1M",
      "-threads",
      "1",
      "-vf",
    ];
    if (
      argv.length === expected.length + 2 &&
      expected.every((value, index) => argv[index] === value) &&
      /^[\w=,:.-]+$/.test(argv[expected.length]) &&
      path.isAbsolute(argv[expected.length + 1]) &&
      argv[expected.length + 1].endsWith(".webm")
    )
      return;
    throw new Error(
      "Proofline unsupported-child-plane: ffmpeg is limited to Playwright's reviewed WebM recording argv.",
    );
  };
  const assertCapabilityArgv = (capability, argv, environment) => {
    if (capability.purpose === "git-local") return assertSafeGitArgv(argv, environment);
    if (capability.purpose === "pnpm-runner") return assertSafePnpmArgv(argv);
    if (capability.purpose === "nx-build") return assertSafeNxArgv(argv);
    if (capability.purpose === "vitest-cli") return assertRunnerArgv(argv, "Vitest", "run");
    if (capability.purpose === "playwright-cli")
      return assertRunnerArgv(argv, "Playwright", "test");
    if (capability.purpose === "playwright-browser")
      return assertSafeBrowserArgv(capability.executable, argv);
    if (capability.purpose === "esbuild-service") return assertSafeEsbuildArgv(argv);
    if (capability.purpose === "playwright-ffmpeg") return assertSafeFfmpegArgv(argv);
    throw new Error("Proofline unsupported-child-plane: unknown child capability purpose.");
  };
  const supportedChild = (command, options = {}, argv = []) => {
    if (options.shell)
      throw new Error("Proofline unsupported-child-plane: shell child execution is denied.");
    let executable;
    try {
      executable = resolveExecutable(command, options.env);
    } catch {
      throw new Error(
        `Proofline unsupported-child-plane: child executable ${path.basename(String(command))} cannot be resolved to an exact reviewed file.`,
      );
    }
    if (executable === realpathSync(process.execPath)) {
      assertSafeNodeArgv(argv);
      return { executable, purpose: "guarded-node" };
    }
    const capabilities = allowedChildCapabilities.filter(
      (capability) => capability.executable === executable,
    );
    let capabilityError;
    for (const capability of capabilities) {
      try {
        assertCapabilityArgv(capability, argv, options.env ?? process.env);
        return capability;
      } catch (error) {
        capabilityError ??= error;
        // Another purpose for the same exact executable may match.
      }
    }
    if (capabilityError) throw capabilityError;
    throw new Error(
      `Proofline unsupported-child-plane: executable ${path.basename(executable)} is not an exact reviewed child.`,
    );
  };
  // Native execFile reconstructs its options, so a Symbol option cannot carry
  // authority to ChildProcess.spawn. Carry a one-use private token through a fresh
  // environment instead; remove it before native dispatch and bind it to the
  // exact file/argv/environment/cwd that the reviewed wrapper already captured.
  const approvalEnvironmentKey = "PROOFLINE_INTERNAL_CHILD_APPROVAL";
  const nativeApprovals = new Map();
  const invocationIdentity = (file, argv, pairs, cwd) =>
    JSON.stringify([
      file,
      argv,
      [...pairs].sort(),
      cwd instanceof URL ? fileURLToPath(cwd) : (cwd ?? null),
    ]);
  const approvedNativeDispatch = (file, argv, options, invoke) => {
    const environment = { ...options.env };
    delete environment[approvalEnvironmentKey];
    const pairs = Object.entries(environment)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`);
    const identity = invocationIdentity(file, [options.argv0 ?? file, ...argv], pairs, options.cwd);
    const token = randomBytes(32).toString("hex");
    nativeApprovals.set(token, identity);
    try {
      return invoke({ ...options, env: { ...environment, [approvalEnvironmentKey]: token } });
    } finally {
      nativeApprovals.delete(token);
    }
  };
  const originalNativeSpawn = childProcess.ChildProcess.prototype.spawn;
  childProcess.ChildProcess.prototype.spawn = function guardedNativeSpawn(provided) {
    const options = snapshotOptions(provided);
    const argv = snapshotStringArray(options.args ?? []);
    const pairs = snapshotStringArray(options.envPairs ?? [], "native child environment");
    let token;
    const environment = [];
    for (const pair of pairs) {
      if (pair.startsWith(`${approvalEnvironmentKey}=`)) {
        if (token !== undefined)
          throw new Error("Proofline unsupported-child-plane: duplicate native approval.");
        token = pair.slice(approvalEnvironmentKey.length + 1);
      } else environment.push(pair);
    }
    const approved = nativeApprovals.get(token);
    nativeApprovals.delete(token);
    if (
      approved === undefined ||
      typeof options.file !== "string" ||
      approved !== invocationIdentity(options.file, argv, environment, options.cwd)
    )
      throw new Error(
        "Proofline unsupported-child-plane: unapproved low-level child dispatch is denied.",
      );
    if (Array.isArray(options.stdio)) options.stdio = Array.from(options.stdio);
    return originalNativeSpawn.call(this, { ...options, args: argv, envPairs: environment });
  };

  const patchSpawn = (name) => {
    const original = childProcess[name];
    childProcess[name] = function guardedSpawn(command, argsOrOptions, maybeOptions) {
      const hasArgs = Array.isArray(argsOrOptions);
      const args = hasArgs ? snapshotStringArray(argsOrOptions) : undefined;
      const options = snapshotChildOptions((hasArgs ? maybeOptions : argsOrOptions) ?? {});
      const capability = supportedChild(command, options, args ?? []);
      const delegated = options[prooflineDelegatedPolicy] === true;
      const invocation = nativeChildInvocation(capability, args ?? [], options, delegated);
      if (name === "spawnSync")
        return original.call(this, capability.executable, invocation.argv, invocation.options);
      return approvedNativeDispatch(
        capability.executable,
        invocation.argv,
        invocation.options,
        (options) => original.call(this, capability.executable, invocation.argv, options),
      );
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
    const args = hasArgs ? snapshotStringArray(argsOrOptions) : [];
    const candidateOptions = hasArgs ? optionsOrCallback : argsOrOptions;
    const options =
      candidateOptions && typeof candidateOptions === "object" && !Array.isArray(candidateOptions)
        ? snapshotChildOptions(candidateOptions)
        : {};
    const done =
      typeof callback === "function"
        ? callback
        : typeof optionsOrCallback === "function"
          ? optionsOrCallback
          : typeof argsOrOptions === "function"
            ? argsOrOptions
            : undefined;
    const capability = supportedChild(file, options, args);
    const delegated = options[prooflineDelegatedPolicy] === true;
    const invocation = nativeChildInvocation(capability, args, options, delegated);
    return approvedNativeDispatch(
      capability.executable,
      invocation.argv,
      invocation.options,
      (options) =>
        done
          ? originalExecFile.call(this, capability.executable, invocation.argv, options, done)
          : originalExecFile.call(this, capability.executable, invocation.argv, options),
    );
  };
  const originalExecFileSync = childProcess.execFileSync;
  childProcess.execFileSync = function guardedExecFileSync(file, argsOrOptions, maybeOptions) {
    const hasArgs = Array.isArray(argsOrOptions);
    const args = hasArgs ? snapshotStringArray(argsOrOptions) : [];
    const options = snapshotChildOptions((hasArgs ? maybeOptions : argsOrOptions) ?? {});
    const capability = supportedChild(file, options, args);
    const delegated = options[prooflineDelegatedPolicy] === true;
    const invocation = nativeChildInvocation(capability, args, options, delegated);
    return originalExecFileSync.call(
      this,
      capability.executable,
      invocation.argv,
      invocation.options,
    );
  };
  const originalFork = childProcess.fork;
  childProcess.fork = function guardedFork(modulePath, argsOrOptions, maybeOptions) {
    const hasArgs = Array.isArray(argsOrOptions);
    const args = hasArgs ? snapshotStringArray(argsOrOptions) : [];
    const options = snapshotChildOptions((hasArgs ? maybeOptions : argsOrOptions) ?? {});
    if (options.execPath && path.resolve(options.execPath) !== path.resolve(process.execPath))
      throw new Error(
        "Proofline unsupported-child-plane: fork requires the guarded Node executable.",
      );
    assertSafeNodeArgv(options.execArgv ?? []);
    if (options.shell)
      throw new Error("Proofline unsupported-child-plane: shell child execution is denied.");
    if (typeof modulePath !== "string" && !(modulePath instanceof URL))
      throw new Error("Proofline fork module path must be a string or URL.");
    if (modulePath instanceof URL) modulePath = new URL(modulePath.href);
    if (options.silent === false && options.stdio && options.stdio !== "inherit")
      throw new Error("Proofline unsupported-child-plane: conflicting fork stdio.");
    const execArgv = snapshotStringArray(options.execArgv ?? process.execArgv, "fork execArgv");
    if (options.execArgv === undefined) {
      // Node's normal fork behavior excludes the parent's eval expression.
      const evalIndex = Math.max(execArgv.lastIndexOf("-e"), execArgv.lastIndexOf("--eval"));
      if (evalIndex >= 0) execArgv.splice(evalIndex, 2);
    }
    assertSafeNodeArgv(execArgv);
    const forkOptions = { ...options, execArgv, env: forcedChildEnvironment(options.env) };
    const nativeModulePath = modulePath instanceof URL ? fileURLToPath(modulePath) : modulePath;
    return approvedNativeDispatch(
      forkOptions.execPath || process.execPath,
      [...execArgv, nativeModulePath, ...args],
      forkOptions,
      (options) => originalFork.call(this, nativeModulePath, args, options),
    );
  };
  for (const name of ["exec", "execSync"]) {
    childProcess[name] = () => {
      throw new Error(`Proofline unsupported-child-plane: ${name} shell execution is denied.`);
    };
  }
  syncBuiltinESMExports();
}
