import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  assertSafeNodeArgv,
  normalizeAllowedChildExecutables,
  parseAllowedChildExecutablesEnvironment,
  // @ts-expect-error The preload policy stays runtime-native JavaScript; this test exercises it directly.
} from "../guard-policy.mjs";
import {
  type GuardedRunResult,
  launchProoflineTestApp,
  withProoflineGuard,
} from "../run-guarded.mjs";

let server: Server;
let ipv6Server: Server;
let allowedOrigin: string;
let ipv6Origin: string;
let ipv6Requests = 0;
const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const temporaryRoot = mkdtempSync(path.join(tmpdir(), "proofline-egress-"));
const executableOnPath = (name: string) => {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(directory, name);
    if (existsSync(candidate)) return realpathSync(candidate);
  }
  throw new Error(`Missing test executable: ${name}`);
};

const script = (name: string, source: string) => {
  const file = path.join(temporaryRoot, name);
  writeFileSync(file, source);
  return file;
};

const runNode = (
  file: string,
  options: { allowedOrigins?: string[]; env?: NodeJS.ProcessEnv } = {},
): Promise<GuardedRunResult> =>
  withProoflineGuard([process.execPath, file], {
    allowedOrigins: options.allowedOrigins ?? [allowedOrigin],
    env: options.env,
    cwd: temporaryRoot,
  });

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "https://example.com/credential?token=secret" });
      response.end();
      return;
    }
    if (request.url === "/malformed-redirect") {
      response.writeHead(302, { location: "http://%" });
      response.end();
      return;
    }
    if (request.url === "/same-origin-redirect") {
      response.writeHead(302, { location: "/same-origin-final" });
      response.end();
      return;
    }
    if (request.url === "/same-origin-final") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("redirect-final");
      return;
    }
    if (request.url === "/request-semantics") {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end(`${request.headers["x-proofline"] ?? ""}:${body}`);
      });
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("loopback-ok");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected an IPv4 test server");
  allowedOrigin = `http://127.0.0.1:${address.port}`;

  ipv6Server = createServer((_request, response) => {
    ipv6Requests += 1;
    response.end("ipv6-ok");
  });
  await new Promise<void>((resolve, reject) => {
    ipv6Server.once("error", reject);
    ipv6Server.listen(0, "::1", () => resolve());
  });
  const ipv6Address = ipv6Server.address();
  if (!ipv6Address || typeof ipv6Address === "string") throw new Error("Expected an IPv6 server");
  ipv6Origin = `http://[::1]:${ipv6Address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await new Promise<void>((resolve, reject) =>
    ipv6Server.close((error) => (error ? reject(error) : resolve())),
  );
  rmSync(temporaryRoot, { recursive: true, force: true });
});

describe("Proofline egress guard", () => {
  test("validates_exact_child_executable_policy_and_node_preload_argv", () => {
    const node = realpathSync(process.execPath);
    expect(normalizeAllowedChildExecutables([node])).toEqual([node]);
    expect(parseAllowedChildExecutablesEnvironment(JSON.stringify([node]))).toEqual([node]);
    expect(() => normalizeAllowedChildExecutables("node" as never)).toThrow(/must be an array/i);
    expect(() => normalizeAllowedChildExecutables(["node"])).toThrow(/absolute path/i);
    expect(() => normalizeAllowedChildExecutables([path.join(temporaryRoot, "missing")])).toThrow(
      /resolve to a file/i,
    );
    expect(() => normalizeAllowedChildExecutables([temporaryRoot])).toThrow(/resolve to a file/i);
    expect(() => normalizeAllowedChildExecutables([node, node])).toThrow(/duplicates/i);
    expect(() => parseAllowedChildExecutablesEnvironment("{")).toThrow(/JSON array/i);
    expect(() => assertSafeNodeArgv(["--loader=replace", "target.mjs"])).toThrow(
      /cannot replace preload execution/i,
    );
    expect(() => assertSafeNodeArgv(["--inspect-brk=0", "target.mjs"])).toThrow(
      /cannot replace preload execution/i,
    );
    expect(() => assertSafeNodeArgv(["--run=target"])).toThrow(/cannot replace preload execution/i);
    expect(() => assertSafeNodeArgv(["--", "--import=ordinary-argument"])).not.toThrow();
  });

  test("resolves_an_exact_PATH_child_but_rejects_network_capable_git_arguments", async () => {
    const file = script(
      "safe-git-child.mjs",
      `
        import { spawnSync } from "node:child_process";
        import { mkdtempSync } from "node:fs";
        import { tmpdir } from "node:os";
        import path from "node:path";
        const cwd = mkdtempSync(path.join(tmpdir(), "proofline-safe-git-"));
        const local = spawnSync("git", ["init", "-q"], { cwd, encoding: "utf8" });
        let remote;
        try { spawnSync("git", ["ls-remote", "https://example.com/repository.git"]); }
        catch (error) { remote = String(error.message); }
        console.log(JSON.stringify({ local: local.status, remote }));
      `,
    );
    const result = await withProoflineGuard([process.execPath, file], {
      allowedOrigins: [allowedOrigin],
      allowedChildExecutables: [executableOnPath("git")],
      cwd: temporaryRoot,
    });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      local: 0,
      remote: expect.stringContaining("network-capable git arguments are denied"),
    });
  });

  test("allows_only_declared_loopback_runner_requests", async () => {
    const file = script(
      "allowed-overloads.mjs",
      `
        import http from "node:http";
        const origin = process.env.TEST_ORIGIN;
        const asRequest = await fetch(new Request(origin + "/fetch"));
        const semantics = await fetch(new Request(origin + "/request-semantics", {
          method: "POST",
          headers: { "x-proofline": "preserved" },
          body: "request-body",
        }));
        const viaUrl = await new Promise((resolve, reject) => {
          http.get(new URL(origin + "/url"), (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => body += chunk);
            response.on("end", () => resolve(body));
          }).on("error", reject);
        });
        const parsed = new URL(origin);
        const viaOptions = await new Promise((resolve, reject) => {
          const request = http.request({
            protocol: "http:",
            hostname: parsed.hostname,
            port: parsed.port,
            path: "/options",
            method: "get",
          }, (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => body += chunk);
            response.on("end", () => resolve(body));
          });
          request.on("error", reject);
          request.end();
        });
        let otherPort;
        try { await fetch("http://127.0.0.1:1/blocked"); }
        catch (error) { otherPort = String(error.message); }
        console.log(JSON.stringify({ fetch: await asRequest.text(), semantics: await semantics.text(), viaUrl, viaOptions, otherPort }));
      `,
    );
    const result = await runNode(file, {
      env: { TEST_ORIGIN: allowedOrigin },
    });
    expect(result).toMatchObject({ code: 0, signal: null });
    const value = JSON.parse(result.stdout.trim()) as Record<string, string>;
    expect(value).toMatchObject({
      fetch: "loopback-ok",
      semantics: "preserved:request-body",
      viaUrl: "loopback-ok",
      viaOptions: "loopback-ok",
    });
    expect(value.otherPort).toContain(
      "plane=fetch method=GET origin=http://127.0.0.1:1 url=http://127.0.0.1:1/blocked",
    );
  });

  test("normalizes_ipv6_default_ports_precedence_credentials_and_malformed_requests", async () => {
    const file = script(
      "normalization.mjs",
      `
        import http from "node:http";
        const errors = {};
        const ipv6 = await fetch(process.env.IPV6_ORIGIN + "/ok");
        try { await fetch("HTTP://EXAMPLE.COM:80/default?credential=secret"); }
        catch (error) { errors.defaultPort = String(error.message); }
        try { http.get(new URL(process.env.IPV6_ORIGIN + "/precedence"), { hostname: "example.com", port: 80 }); }
        catch (error) { errors.precedence = String(error.message); }
        try { http.get("http://user:supersecret@example.com/private"); }
        catch (error) { errors.userinfo = String(error.message); }
        try { http.get("not a url"); }
        catch (error) { errors.malformed = String(error.message); }
        try { await fetch("not a url", { method: "PATCH" }); }
        catch (error) { errors.fetchMalformed = String(error.message); }
        try { await fetch("http://user:supersecret@127.0.0.1/private", { method: "DELETE" }); }
        catch (error) { errors.fetchCredentials = String(error.message); }
        try { await fetch(process.env.IPV6_ORIGIN, { method: "POST", dispatcher: {} }); }
        catch (error) { errors.fetchDispatcher = String(error.message); }
        console.log(JSON.stringify({ ipv6: await ipv6.text(), errors }));
      `,
    );
    const result = await runNode(file, {
      allowedOrigins: [ipv6Origin],
      env: { IPV6_ORIGIN: ipv6Origin },
    });
    expect(result.code, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as {
      ipv6: string;
      errors: Record<string, string>;
    };
    expect(output.ipv6).toBe("ipv6-ok");
    expect(output.errors.defaultPort).toContain("origin=http://example.com");
    expect(output.errors.precedence).toContain("origin=http://example.com");
    expect(output.errors.userinfo).toContain("reason=credentials");
    expect(output.errors.userinfo).not.toContain("supersecret");
    expect(output.errors.malformed).toContain(
      "plane=http.get method=GET origin=<invalid> url=<invalid> reason=malformed-url",
    );
    expect(output.errors.fetchMalformed).toContain(
      "plane=fetch method=PATCH origin=<invalid> url=<invalid> reason=malformed-url",
    );
    expect(output.errors.fetchCredentials).toContain("plane=fetch method=DELETE");
    expect(output.errors.fetchCredentials).toContain("reason=credentials");
    expect(output.errors.fetchCredentials).not.toContain("supersecret");
    expect(output.errors.fetchDispatcher).toContain("plane=fetch method=POST");

    const ipv6Port = new URL(ipv6Origin).port;
    const bypass = script(
      "ipv6-hostname-bypass.mjs",
      `
        import http from "node:http";
        try { http.get({ hostname: "::1", port: ${JSON.stringify(ipv6Port)}, path: "/bypass" }); }
        catch (error) { console.log(String(error.message)); }
      `,
    );
    const bypassResult = await runNode(bypass, { allowedOrigins: [allowedOrigin] });
    expect(bypassResult.code, bypassResult.stderr).toBe(0);
    expect(bypassResult.stdout).toContain(`origin=${ipv6Origin}`);
  });

  test("denies_fetch_http_https_websocket_and_inherited_child_egress", async () => {
    const inheritedChild = script(
      "inherited-child.mjs",
      'await fetch("https://example.com/child-secret?token=secret");',
    );
    const file = script(
      "denied-planes.mjs",
      `
        import http from "node:http";
        import { request as httpsRequest } from "node:https";
        import { spawnSync } from "node:child_process";
        const errors = {};
        try { await fetch("HTTP://EXAMPLE.COM:80/private?token=secret"); }
        catch (error) { errors.fetch = String(error.message); }
        try { http.get("http://example.com/http-secret?token=secret"); }
        catch (error) { errors.http = String(error.message); }
        try { httpsRequest(new URL("https://example.com/https-secret?token=secret")); }
        catch (error) { errors.https = String(error.message); }
        try { new WebSocket("wss://example.com/socket?token=secret"); }
        catch (error) { errors.websocket = String(error.message); }
        const child = spawnSync(process.execPath, [${JSON.stringify(inheritedChild)}], {
          encoding: "utf8",
          env: {
            ...process.env,
            NODE_OPTIONS: "--trace-warnings",
            PROOFLINE_ALLOWED_ORIGINS: '["https://example.com"]',
          },
        });
        errors.child = child.stderr;
        errors.childStatus = child.status;
        console.log(JSON.stringify(errors));
      `,
    );
    const result = await runNode(file);
    expect(result.code, result.stderr).toBe(0);
    const errors = JSON.parse(result.stdout.trim()) as Record<string, string | number>;
    expect(errors.fetch).toContain(
      "plane=fetch method=GET origin=http://example.com url=http://example.com/private",
    );
    expect(errors.http).toContain(
      "plane=http.get method=GET origin=http://example.com url=http://example.com/http-secret",
    );
    expect(errors.https).toContain(
      "plane=https.request method=GET origin=https://example.com url=https://example.com/https-secret",
    );
    expect(errors.websocket).toContain(
      "plane=websocket method=CONNECT origin=wss://example.com url=wss://example.com/socket",
    );
    expect(errors.child).toContain(
      "plane=fetch method=GET origin=https://example.com url=https://example.com/child-secret",
    );
    expect(errors.childStatus).not.toBe(0);
    expect(JSON.stringify(errors)).not.toContain("token=secret");
  });

  test("denies_direct_client_request_construction_in_root_and_inherited_children", async () => {
    const inheritedChild = script(
      "direct-client-request-child.mjs",
      `
        import { ClientRequest } from "node:http";
        const outcome = await new Promise((resolve) => {
          try {
            const request = new ClientRequest(process.env.SECOND_ORIGIN + "/child", (response) => {
              response.resume();
              response.on("end", () => resolve({ dispatched: response.statusCode }));
            });
            request.on("error", (error) => resolve({ error: String(error.message) }));
            request.end();
          } catch (error) { resolve({ error: String(error.message) }); }
        });
        console.log(JSON.stringify(outcome));
      `,
    );
    const root = script(
      "direct-client-request-root.mjs",
      `
        import http, { ClientRequest } from "node:http";
        import { spawnSync } from "node:child_process";
        const attempt = (Constructor, path) => new Promise((resolve) => {
          try {
            const request = new Constructor(process.env.SECOND_ORIGIN + path, (response) => {
              response.resume();
              response.on("end", () => resolve({ dispatched: response.statusCode }));
            });
            request.on("error", (error) => resolve({ error: String(error.message) }));
            request.end();
          } catch (error) { resolve({ error: String(error.message) }); }
        });
        const defaultExport = await attempt(http.ClientRequest, "/default-export");
        const namedExport = await attempt(ClientRequest, "/named-export");
        const child = spawnSync(process.execPath, [${JSON.stringify(inheritedChild)}], {
          encoding: "utf8",
          env: { ...process.env, SECOND_ORIGIN: process.env.SECOND_ORIGIN },
        });
        console.log(JSON.stringify({ defaultExport, namedExport, child: JSON.parse(child.stdout), childStatus: child.status }));
      `,
    );
    const requestsBefore = ipv6Requests;
    const result = await runNode(root, { env: { SECOND_ORIGIN: ipv6Origin } });
    expect(result.code, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as {
      defaultExport: { error?: string; dispatched?: number };
      namedExport: { error?: string; dispatched?: number };
      child: { error?: string; dispatched?: number };
      childStatus: number;
    };
    for (const [plane, outcome] of Object.entries({
      defaultExport: output.defaultExport,
      namedExport: output.namedExport,
      child: output.child,
    })) {
      expect(outcome.dispatched, plane).toBeUndefined();
      expect(outcome.error, plane).toContain("plane=http.ClientRequest");
      expect(outcome.error, plane).toContain(`origin=${ipv6Origin}`);
    }
    expect(output.childStatus).toBe(0);
    expect(ipv6Requests).toBe(requestsBefore);
  });

  test("preserves_allowed_fetch_redirect_modes_and_followed_response_metadata", async () => {
    const file = script(
      "redirect-semantics.mjs",
      `
        const start = process.env.TEST_ORIGIN + "/same-origin-redirect";
        const followed = await fetch(start);
        const followedValue = {
          status: followed.status,
          redirected: followed.redirected,
          url: followed.url,
          body: await followed.text(),
        };
        const manual = await fetch(start, { redirect: "manual" });
        const manualValue = {
          status: manual.status,
          redirected: manual.redirected,
          url: manual.url,
          location: manual.headers.get("location"),
        };
        let error;
        try { await fetch(start, { redirect: "error" }); }
        catch (caught) { error = String(caught.message); }
        console.log(JSON.stringify({ followed: followedValue, manual: manualValue, error }));
      `,
    );
    const result = await runNode(file, { env: { TEST_ORIGIN: allowedOrigin } });
    expect(result.code, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as {
      followed: { status: number; redirected: boolean; url: string; body: string };
      manual: {
        status: number;
        redirected: boolean;
        url: string;
        location: string | null;
      };
      error: string;
    };
    expect(output.followed).toEqual({
      status: 200,
      redirected: true,
      url: `${allowedOrigin}/same-origin-final`,
      body: "redirect-final",
    });
    expect(output.manual).toEqual({
      status: 302,
      redirected: false,
      url: `${allowedOrigin}/same-origin-redirect`,
      location: "/same-origin-final",
    });
    expect(output.error).toContain("plane=fetch method=GET");
    expect(output.error).toContain("reason=redirect");
  });

  test("denies_redirect_proxy_tunnel_and_child_override_bypasses", async () => {
    const overrideChild = script(
      "override-child.mjs",
      'await fetch("https://example.com/override");',
    );
    const file = script(
      "bypass-attempts.mjs",
      `
        import http from "node:http";
        import { execFileSync, spawnSync } from "node:child_process";
        const errors = {};
        try { await fetch(process.env.TEST_ORIGIN + "/redirect"); }
        catch (error) { errors.redirect = String(error.message); }
        try { await fetch(process.env.TEST_ORIGIN + "/malformed-redirect"); }
        catch (error) { errors.malformedRedirect = String(error.message); }
        try { http.request({ hostname: "127.0.0.1", port: new URL(process.env.TEST_ORIGIN).port, path: "http://example.com/proxy" }); }
        catch (error) { errors.proxy = String(error.message); }
        try { http.request({ hostname: "127.0.0.1", port: new URL(process.env.TEST_ORIGIN).port, method: "CONNECT", path: "example.com:443" }); }
        catch (error) { errors.connect = String(error.message); }
        try { execFileSync("curl", ["https://example.com"]); }
        catch (error) { errors.externalChild = String(error.message); }
        const child = spawnSync(process.execPath, [${JSON.stringify(overrideChild)}], {
          encoding: "utf8",
          env: { NODE_OPTIONS: "--trace-warnings", PROOFLINE_ALLOWED_ORIGINS: '["https://example.com"]' },
        });
        errors.override = child.stderr;
        console.log(JSON.stringify(errors));
      `,
    );
    const result = await runNode(file, { env: { TEST_ORIGIN: allowedOrigin } });
    expect(result.code).toBe(0);
    const errors = JSON.parse(result.stdout.trim()) as Record<string, string>;
    expect(errors.redirect).toContain("origin=https://example.com");
    expect(errors.malformedRedirect).toContain(
      "plane=fetch method=GET origin=<invalid> url=<invalid> reason=malformed-url",
    );
    expect(errors.proxy).toContain("proxy");
    expect(errors.connect).toContain("method=CONNECT");
    expect(errors.externalChild).toContain("unsupported-child-plane");
    expect(errors.override).toContain("plane=fetch");
  });

  test("guards_or_rejects_every_spawn_fork_exec_and_execfile_child_plane", async () => {
    const grandchild = script(
      "grandchild-egress.mjs",
      'await fetch("https://example.com/grandchild"); console.log("BYPASS");',
    );
    const mutatedChild = script("mutated-child.mjs", "await fetch(process.env.SECOND_ORIGIN);");
    const fakeNode = script(
      "node",
      `#!/bin/sh\nunset NODE_OPTIONS\nexec ${JSON.stringify(process.execPath)} "$@"\n`,
    );
    chmodSync(fakeNode, 0o755);
    const file = script(
      "child-planes.mjs",
      `
        import { exec, execFile, execSync, fork, spawn, spawnSync } from "node:child_process";
        const grandchild = ${JSON.stringify(grandchild)};
        const options = {
          env: { NODE_OPTIONS: "--trace-warnings", PROOFLINE_ALLOWED_ORIGINS: '["https://example.com"]' },
        };
        const collectSpawn = () => new Promise((resolve) => {
          const child = spawn(process.execPath, [grandchild], { ...options, stdio: ["ignore", "pipe", "pipe"] });
          let stderr = "";
          child.stderr.setEncoding("utf8");
          child.stderr.on("data", (chunk) => stderr += chunk);
          child.on("close", (status) => resolve({ status, stderr }));
        });
        const collectExecFile = () => new Promise((resolve) => {
          execFile(process.execPath, [grandchild], { ...options, encoding: "utf8" }, (error, _stdout, stderr) =>
            resolve({ status: error?.code, stderr }));
        });
        const collectFork = () => new Promise((resolve) => {
          const child = fork(grandchild, { ...options, silent: true });
          let stderr = "";
          child.stderr.setEncoding("utf8");
          child.stderr.on("data", (chunk) => stderr += chunk);
          child.on("exit", (status) => resolve({ status, stderr }));
        });
        const errors = {};
        errors.spawn = await collectSpawn();
        errors.execFile = await collectExecFile();
        errors.fork = await collectFork();
        const sync = spawnSync(process.execPath, [grandchild], { encoding: "utf8", env: {} });
        errors.spawnSync = { status: sync.status, stderr: sync.stderr };
        try { exec("unsupported shell command"); }
        catch (error) { errors.exec = String(error.message); }
        try { execSync("unsupported shell command"); }
        catch (error) { errors.execSync = String(error.message); }
        try { spawn(process.execPath, [grandchild], { shell: true }); }
        catch (error) { errors.shell = String(error.message); }
        try { fork(grandchild, { execPath: "/usr/bin/env", execArgv: ["-u", "NODE_OPTIONS", process.execPath] }); }
        catch (error) { errors.forkOverride = String(error.message); }
        try { spawnSync(${JSON.stringify(fakeNode)}, [grandchild], { encoding: "utf8" }); }
        catch (error) { errors.fakeNode = String(error.message); }
        try { spawnSync(process.execPath, ["--import", grandchild, grandchild], { encoding: "utf8" }); }
        catch (error) { errors.argvOverride = String(error.message); }
        try { spawnSync(process.execPath, ["--run", "egress"], { encoding: "utf8" }); }
        catch (error) { errors.childRun = String(error.message); }
        process.env.PROOFLINE_ALLOWED_ORIGINS = JSON.stringify([process.env.SECOND_ORIGIN]);
        const mutated = spawnSync(process.execPath, [${JSON.stringify(mutatedChild)}], { encoding: "utf8" });
        errors.mutated = { status: mutated.status, stderr: mutated.stderr };
        console.log(JSON.stringify(errors));
      `,
    );
    const result = await runNode(file, { env: { SECOND_ORIGIN: ipv6Origin } });
    expect(result.code, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as Record<
      string,
      string | { status: number | null; stderr: string }
    >;
    for (const plane of ["spawn", "execFile", "fork", "spawnSync", "mutated"]) {
      const child = output[plane] as { status: number | null; stderr: string };
      expect(child.status, plane).not.toBe(0);
      expect(child.stderr, plane).toContain("Proofline egress denied plane=fetch");
    }
    for (const plane of [
      "exec",
      "execSync",
      "shell",
      "forkOverride",
      "fakeNode",
      "argvOverride",
      "childRun",
    ])
      expect(output[plane], plane).toContain("unsupported-child-plane");
  });

  test("installs_the_preload_before_actual_server_runtime_startup", async () => {
    const marker = path.join(temporaryRoot, "startup-after-egress.txt");
    const denied = script(
      "startup-denied.mjs",
      `
        import { writeFileSync } from "node:fs";
        await fetch("https://example.com/startup");
        writeFileSync(${JSON.stringify(marker)}, "dispatched");
      `,
    );
    const deniedResult = await runNode(denied);
    expect(deniedResult.code).not.toBe(0);
    expect(deniedResult.stderr).toContain(
      "plane=fetch method=GET origin=https://example.com url=https://example.com/startup",
    );
    expect(() => readFileSync(marker, "utf8")).toThrow();

    const allowed = script(
      "startup-allowed.mjs",
      `
        const response = await fetch(process.env.TEST_ORIGIN + "/startup");
        console.log(await response.text());
      `,
    );
    const allowedResult = await runNode(allowed, { env: { TEST_ORIGIN: allowedOrigin } });
    expect(allowedResult).toMatchObject({ code: 0, signal: null });
    expect(allowedResult.stdout.trim()).toBe("loopback-ok");
  });

  test("rejects_malformed_or_non_loopback_allowlists_before_target_code", async () => {
    const target = script("must-not-start.mjs", 'console.log("TARGET_STARTED");');
    expect(() => runNode(target, { allowedOrigins: ["https://example.com"] })).toThrow(/loopback/i);
    expect(() => runNode(target, { allowedOrigins: ["http://127.0.0.1.example.com"] })).toThrow(
      /loopback/i,
    );
    expect(() =>
      runNode(target, { allowedOrigins: ["http://user:password@127.0.0.1:4173"] }),
    ).toThrow(/credentials/i);
    expect(() => runNode(target, { allowedOrigins: ["http://127.0.0.1:*"] })).toThrow(/origin/i);
  });

  test("generates_private_distinct_capabilities_for_programmatic_test_app_launches", async () => {
    const callerCapability = "Proofline_Caller_Selected_Capability_123456789";
    const target = script(
      "programmatic-test-app.mjs",
      `
        console.log(JSON.stringify({ origin: "http://127.0.0.1:4173" }));
        console.log(process.env.PROOFLINE_TEST_CAPABILITY);
        setInterval(() => {}, 1_000);
      `,
    );
    const launchOnce = () => {
      let observedBuffer = "";
      let resolveObserved: (value: string) => void = () => undefined;
      const observed = new Promise<string>((resolve) => {
        resolveObserved = resolve;
      });
      const launch = launchProoflineTestApp([process.execPath, target], {
        allowedOrigins: [allowedOrigin],
        cwd: temporaryRoot,
        env: { PROOFLINE_TEST_CAPABILITY: callerCapability },
        onStdout: (chunk) => {
          observedBuffer += chunk;
          const newline = observedBuffer.indexOf("\n");
          if (newline >= 0) resolveObserved(observedBuffer.slice(0, newline));
        },
      });
      return { launch, observed };
    };
    const first = launchOnce();
    const second = launchOnce();
    try {
      const [firstReady, secondReady, firstObserved, secondObserved] = await Promise.all([
        first.launch.ready,
        second.launch.ready,
        first.observed,
        second.observed,
      ]);
      expect(firstReady.capability).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
      expect(secondReady.capability).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
      expect(firstReady.capability).not.toBe(secondReady.capability);
      expect(firstReady.capability).not.toBe(callerCapability);
      expect(secondReady.capability).not.toBe(callerCapability);
      expect(firstObserved).toBe(firstReady.capability);
      expect(secondObserved).toBe(secondReady.capability);
    } finally {
      expect(first.launch.stop()).toBe(true);
      expect(second.launch.stop()).toBe(true);
      await Promise.all([first.launch.completion, second.launch.completion]);
    }

    const invalidReadiness = script("invalid-readiness.mjs", 'console.log("not-json");');
    const invalid = launchProoflineTestApp([process.execPath, invalidReadiness], {
      allowedOrigins: [allowedOrigin],
      cwd: temporaryRoot,
    });
    await expect(invalid.ready).rejects.toThrow(/invalid readiness/i);
    await invalid.completion;

    const fragmentedReadiness = script(
      "fragmented-readiness.mjs",
      `
        process.stdout.write('{"origin":"http://127.0.0.1:');
        setTimeout(() => process.stdout.write('4173"}\\n'), 50);
        setInterval(() => {}, 1_000);
      `,
    );
    const fragmented = launchProoflineTestApp([process.execPath, fragmentedReadiness], {
      allowedOrigins: [allowedOrigin],
      cwd: temporaryRoot,
    });
    expect(await fragmented.ready).toMatchObject({ origin: "http://127.0.0.1:4173" });
    expect(fragmented.stop()).toBe(true);
    await fragmented.completion;

    const nonLoopbackReadiness = script(
      "non-loopback-readiness.mjs",
      'console.log(JSON.stringify({ origin: "https://example.com" }));',
    );
    const nonLoopback = launchProoflineTestApp([process.execPath, nonLoopbackReadiness], {
      allowedOrigins: [allowedOrigin],
      cwd: temporaryRoot,
    });
    await expect(nonLoopback.ready).rejects.toThrow(/invalid readiness/i);
    await nonLoopback.completion;

    const exitsBeforeReadiness = script("no-readiness.mjs", "process.exit(4);");
    const earlyExit = launchProoflineTestApp([process.execPath, exitsBeforeReadiness], {
      allowedOrigins: [allowedOrigin],
      cwd: temporaryRoot,
    });
    await expect(earlyExit.ready).rejects.toThrow(/before readiness.*code=4/i);
    await earlyExit.completion;

    const callbackFailure = launchProoflineTestApp([process.execPath, exitsBeforeReadiness], {
      allowedOrigins: [allowedOrigin],
      cwd: temporaryRoot,
      onSpawn: () => {
        throw new Error("injected spawn callback failure");
      },
    });
    await expect(callbackFailure.ready).rejects.toThrow(/injected spawn callback failure/i);
    await expect(callbackFailure.completion).rejects.toThrow(/injected spawn callback failure/i);
  });

  test("preserves_structured_argv_exit_signal_stdout_and_stderr", async () => {
    expect(() => withProoflineGuard([] as never, { allowedOrigins: [allowedOrigin] })).toThrow(
      /non-empty structured argv/i,
    );
    expect(() =>
      withProoflineGuard([process.execPath, 42] as never, { allowedOrigins: [allowedOrigin] }),
    ).toThrow(/non-empty structured argv/i);
    expect(() =>
      withProoflineGuard([process.execPath, "target.mjs"], {
        allowedOrigins: [allowedOrigin],
        shell: true,
      } as never),
    ).toThrow(/never execute through a shell/i);
    expect(() =>
      withProoflineGuard([path.join(temporaryRoot, "missing-node")], {
        allowedOrigins: [allowedOrigin],
      }),
    ).toThrow(/trusted Node executable/i);
    const overridePreload = script("override-preload.mjs", "globalThis.fetch = () => undefined;");
    expect(() =>
      withProoflineGuard(["/usr/bin/curl", "https://example.com"], {
        allowedOrigins: [allowedOrigin],
      }),
    ).toThrow(/cannot inherit the Node preload|rejects targets/i);
    expect(() =>
      withProoflineGuard([process.execPath, "--import", overridePreload, overridePreload], {
        allowedOrigins: [allowedOrigin],
      }),
    ).toThrow(/cannot replace preload execution/i);
    expect(() =>
      withProoflineGuard([process.execPath, "--run", "egress"], {
        allowedOrigins: [allowedOrigin],
      }),
    ).toThrow(/cannot replace preload execution/i);
    const output = script(
      "output.mjs",
      `
        console.log(JSON.stringify(process.argv.slice(2)));
        console.error("guarded-stderr");
        process.exitCode = 7;
      `,
    );
    const result = await withProoflineGuard(
      [process.execPath, output, "argument with spaces", "literal;$HOME"],
      { allowedOrigins: [allowedOrigin], cwd: temporaryRoot },
    );
    expect(result).toMatchObject({ code: 7, signal: null });
    expect(JSON.parse(result.stdout.trim())).toEqual(["argument with spaces", "literal;$HOME"]);
    expect(result.stderr).toContain("guarded-stderr");

    const canonicalTarget = script("canonical-target.mjs", 'console.log("canonical-ok");');
    const canonical = execFileSync(
      process.execPath,
      [
        path.join(repositoryRoot, "tools/proofline/run-guarded.mjs"),
        "--allow-origin",
        allowedOrigin,
        "--",
        "node",
        canonicalTarget,
      ],
      { encoding: "utf8", cwd: repositoryRoot },
    );
    expect(canonical.trim()).toBe("canonical-ok");

    const signal = script("signal.mjs", 'process.kill(process.pid, "SIGTERM");');
    const signalResult = await runNode(signal);
    expect(signalResult).toMatchObject({ code: null, signal: "SIGTERM" });
  });
});
