import childProcess from "node:child_process";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import {
  assertSafeNodeArgv,
  guardImportOption,
  mergeGuardNodeOptions,
  parseAllowedChildCapabilitiesEnvironment,
  parseAllowedOriginsEnvironment,
  prooflineDelegatedPolicy,
  unsafeGitEnvironmentKey,
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
    return { method, url: base };
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
    const OriginalClientRequest = module.ClientRequest;
    if (typeof OriginalClientRequest === "function") {
      function ProoflineGuardedClientRequest(...args) {
        const { method, url } = inspectHttp(`${name}.ClientRequest`, protocol, args);
        throw denied({
          plane: `${name}.ClientRequest`,
          method,
          url,
          reason: "direct-constructor",
        });
      }
      Object.setPrototypeOf(ProoflineGuardedClientRequest, OriginalClientRequest);
      ProoflineGuardedClientRequest.prototype = OriginalClientRequest.prototype;
      module.ClientRequest = ProoflineGuardedClientRequest;
    }
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
      GIT_AUTHOR_NAME: "Proofline Guarded",
      GIT_AUTHOR_EMAIL: "proofline@example.invalid",
      GIT_COMMITTER_NAME: "Proofline Guarded",
      GIT_COMMITTER_EMAIL: "proofline@example.invalid",
    };
  };
  const resolveExecutable = (command, environment = process.env) => {
    const value = String(command);
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
  const patchSpawn = (name) => {
    const original = childProcess[name];
    childProcess[name] = function guardedSpawn(command, argsOrOptions, maybeOptions) {
      const hasArgs = Array.isArray(argsOrOptions);
      const args = hasArgs ? argsOrOptions : undefined;
      const options = (hasArgs ? maybeOptions : argsOrOptions) ?? {};
      const capability = supportedChild(command, options, args ?? []);
      const delegated = options[prooflineDelegatedPolicy] === true;
      const invocation = nativeChildInvocation(capability, args ?? [], options, delegated);
      return original.call(this, capability.executable, invocation.argv, invocation.options);
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
    const capability = supportedChild(file, options, args);
    const delegated = options[prooflineDelegatedPolicy] === true;
    const invocation = nativeChildInvocation(capability, args, options, delegated);
    return done
      ? originalExecFile.call(
          this,
          capability.executable,
          invocation.argv,
          invocation.options,
          done,
        )
      : originalExecFile.call(this, capability.executable, invocation.argv, invocation.options);
  };
  const originalExecFileSync = childProcess.execFileSync;
  childProcess.execFileSync = function guardedExecFileSync(file, argsOrOptions, maybeOptions) {
    const hasArgs = Array.isArray(argsOrOptions);
    const args = hasArgs ? argsOrOptions : [];
    const options = (hasArgs ? maybeOptions : argsOrOptions) ?? {};
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
