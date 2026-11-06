import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
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
  guardImportOption,
  mergeGuardNodeOptions,
  normalizeAllowedChildCapabilities,
  parseAllowedChildCapabilitiesEnvironment,
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
let workerRequests = 0;
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
    if (request.url === "/worker-thread-sentinel") workerRequests += 1;
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
  server.on("upgrade", (request, socket) => {
    const accept = createHash("sha1")
      .update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.write(Buffer.from([0x81, 2, 0x6f, 0x6b]));
    socket.on("data", () => socket.end(Buffer.from([0x88, 0])));
    socket.on("error", () => socket.destroy());
  });
  const declaredOrigin = process.env.PROOFLINE_EGRESS_TEST_ORIGIN;
  const declaredUrl = declaredOrigin ? new URL(declaredOrigin) : undefined;
  if (declaredUrl && declaredUrl.hostname !== "127.0.0.1")
    throw new Error("Canonical egress fixture requires an IPv4 loopback origin.");
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(declaredUrl ? Number(declaredUrl.port) : 0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected an IPv4 test server");
  allowedOrigin = `http://127.0.0.1:${address.port}`;

  ipv6Server = createServer((_request, response) => {
    ipv6Requests += 1;
    response.end("ipv6-ok");
  });
  const declaredIpv6Origin = process.env.PROOFLINE_EGRESS_IPV6_TEST_ORIGIN;
  const declaredIpv6Url = declaredIpv6Origin ? new URL(declaredIpv6Origin) : undefined;
  if (declaredIpv6Url && declaredIpv6Url.hostname !== "[::1]")
    throw new Error("Canonical egress fixture requires an IPv6 loopback origin.");
  await new Promise<void>((resolve, reject) => {
    ipv6Server.once("error", reject);
    ipv6Server.listen(declaredIpv6Url ? Number(declaredIpv6Url.port) : 0, "::1", () => resolve());
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
    const capability = { executable: node, purpose: "git-local" as const };
    expect(normalizeAllowedChildCapabilities([capability])).toEqual([capability]);
    expect(parseAllowedChildCapabilitiesEnvironment(JSON.stringify([capability]))).toEqual([
      capability,
    ]);
    expect(() => normalizeAllowedChildCapabilities("node" as never)).toThrow(/must be an array/i);
    expect(() =>
      normalizeAllowedChildCapabilities([{ executable: "node", purpose: "git-local" }]),
    ).toThrow(/absolute executable path/i);
    expect(() =>
      normalizeAllowedChildCapabilities([
        { executable: path.join(temporaryRoot, "missing"), purpose: "git-local" },
      ]),
    ).toThrow(/resolve to a file/i);
    expect(() =>
      normalizeAllowedChildCapabilities([{ executable: temporaryRoot, purpose: "git-local" }]),
    ).toThrow(/resolve to a file/i);
    expect(() => normalizeAllowedChildCapabilities([capability, capability])).toThrow(
      /duplicates/i,
    );
    expect(() =>
      normalizeAllowedChildCapabilities([{ ...capability, purpose: "arbitrary" }]),
    ).toThrow(/unsupported purpose/i);
    expect(() => parseAllowedChildCapabilitiesEnvironment("{")).toThrow(/JSON array/i);
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
      allowedChildCapabilities: [{ executable: executableOnPath("git"), purpose: "git-local" }],
      cwd: temporaryRoot,
    });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      local: 0,
      remote: expect.stringContaining("network-capable git arguments are denied"),
    });
  });

  test("disables_repository_git_hooks_and_rejects_hook_path_overrides", async () => {
    const hooks = path.join(temporaryRoot, "hostile-hooks");
    const marker = path.join(temporaryRoot, "git-hook-ran");
    const file = script(
      "safe-git-hooks.mjs",
      `
        import { spawnSync } from "node:child_process";
        import { mkdirSync, writeFileSync } from "node:fs";
        import { mkdtempSync } from "node:fs";
        import { tmpdir } from "node:os";
        import path from "node:path";
        const cwd = mkdtempSync(path.join(tmpdir(), "proofline-safe-git-hooks-"));
        spawnSync("git", ["init", "-q"], { cwd });
        writeFileSync(path.join(cwd, ".git", "config"), [
          "[core]",
          "  hooksPath = " + process.env.TEST_HOOKS,
          "[user]",
          "  name = Proofline",
          "  email = proofline@example.invalid",
          "",
        ].join("\\n"), "utf8");
        const tree = spawnSync("git", ["mktree", "-z"], { cwd, input: "", encoding: "utf8" });
        const commit = spawnSync("git", ["commit-tree", tree.stdout.trim(), "-m", "guarded"], { cwd, encoding: "utf8" });
        if (commit.status !== 0) throw new Error(commit.stderr);
        const update = spawnSync("git", ["update-ref", "HEAD", commit.stdout.trim()], { cwd });
        if (update.status !== 0) throw new Error("ref update failed");
        let override;
        try {
          spawnSync("git", ["-c", "core.hooksPath=" + process.env.TEST_HOOKS, "status"], { cwd });
        } catch (error) { override = String(error.message); }
        console.log(JSON.stringify({ commit: commit.status, override }));
      `,
    );
    const hook = path.join(hooks, "reference-transaction");
    mkdirSync(hooks);
    writeFileSync(hook, `#!/bin/sh\nprintf ran > ${JSON.stringify(marker)}\n`, "utf8");
    chmodSync(hook, 0o755);
    const result = await withProoflineGuard([process.execPath, file], {
      allowedOrigins: [allowedOrigin],
      allowedChildCapabilities: [{ executable: executableOnPath("git"), purpose: "git-local" }],
      cwd: temporaryRoot,
      env: { TEST_HOOKS: hooks },
    });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      commit: 0,
      override: expect.stringContaining("unsafe git configuration is denied"),
    });
    expect(existsSync(marker)).toBe(false);
  });

  test("rejects_git_external_diff_helpers_before_native_dispatch", async () => {
    const marker = path.join(temporaryRoot, "git-external-diff-ran");
    const helper = path.join(temporaryRoot, "hostile-external-diff");
    writeFileSync(helper, `#!/bin/sh\nprintf ran > ${JSON.stringify(marker)}\n`, "utf8");
    chmodSync(helper, 0o755);
    const file = script(
      "safe-git-external-diff.mjs",
      `
        import { spawnSync } from "node:child_process";
        import { mkdtempSync, writeFileSync } from "node:fs";
        import { tmpdir } from "node:os";
        import path from "node:path";
        const cwd = mkdtempSync(path.join(tmpdir(), "proofline-safe-git-diff-"));
        const left = path.join(cwd, "left.txt");
        const right = path.join(cwd, "right.txt");
        writeFileSync(left, "left\\n", "utf8");
        writeFileSync(right, "right\\n", "utf8");
        const attempts = [
          {
            argv: ["diff", "--no-index", "--ext-diff", left, right],
            env: { ...process.env, GIT_EXTERNAL_DIFF: process.env.TEST_EXTERNAL_DIFF },
          },
          { argv: ["diff", "--no-index", "--textconv", left, right] },
          { argv: ["-c", "alias.status=!" + process.env.TEST_EXTERNAL_DIFF, "status"] },
          { argv: ["--config-env=alias.status=TEST_EXTERNAL_DIFF", "status"] },
          { argv: ["--paginate", "status"] },
          { argv: ["status"], env: { ...process.env, GIT_SSH_COMMAND: process.env.TEST_EXTERNAL_DIFF } },
        ];
        const denied = attempts.map(({ argv, env }) => {
          try { spawnSync("git", argv, { env, stdio: "pipe" }); }
          catch (error) { return String(error.message); }
          return "dispatched";
        });
        console.log(JSON.stringify({ denied }));
      `,
    );
    const result = await withProoflineGuard([process.execPath, file], {
      allowedOrigins: [allowedOrigin],
      allowedChildCapabilities: [{ executable: executableOnPath("git"), purpose: "git-local" }],
      cwd: temporaryRoot,
      env: { TEST_EXTERNAL_DIFF: helper },
    });
    expect(result.code, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as { denied: string[] };
    expect(output.denied).toHaveLength(6);
    for (const denial of output.denied) expect(denial).toContain("unsupported-child-plane");
    expect(existsSync(marker)).toBe(false);
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
        process.on("SIGUSR2", () => console.log(process.env.PROOFLINE_TEST_CAPABILITY));
        console.log(JSON.stringify({ origin: "http://127.0.0.1:4173" }));
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
      const [firstReady, secondReady] = await Promise.all([
        first.launch.ready,
        second.launch.ready,
      ]);
      // A native signal after readiness makes this a separate stdout delivery.
      expect(first.launch.stop("SIGUSR2")).toBe(true);
      expect(second.launch.stop("SIGUSR2")).toBe(true);
      const [firstObserved, secondObserved] = await Promise.all([first.observed, second.observed]);
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

  test("rejects_unstructured_or_extensible_child_capabilities", () => {
    expect(() => normalizeAllowedChildCapabilities([null] as never)).toThrow(/must be an object/i);
    expect(() =>
      normalizeAllowedChildCapabilities([
        {
          executable: executableOnPath("git"),
          purpose: "git-local",
          argv: ["status"],
        },
      ] as never),
    ).toThrow(/only executable and purpose/i);
  });
  test("rejects_node_execution_overrides_after_supported_option_operands", () => {
    for (const prefix of [
      ["--conditions", "proofline"],
      ["--conditions=proofline"],
      ["-C", "proofline"],
      ["--input-type", "module"],
    ]) {
      for (const forbidden of [
        "--require",
        "-r",
        "--import",
        "--loader",
        "--experimental-loader",
        "--inspect",
        "--inspect-brk",
        "--inspect-port",
        "--run",
      ]) {
        expect
          .soft(
            () => assertSafeNodeArgv([...prefix, forbidden, "sentinel", "-e", "0"]),
            `${prefix} ${forbidden}`,
          )
          .toThrow(/unsupported-child-plane/);
        expect
          .soft(() => assertSafeNodeArgv([...prefix, `${forbidden}=sentinel`, "-e", "0"]))
          .toThrow(/unsupported-child-plane/);
      }
    }
    for (const argv of [
      ["--unknown-option", "value", "--require", "sentinel"],
      ["--conditions"],
      ["--conditions="],
      ["--conditions", "--require", "sentinel"],
      ["-rsentinel"],
      ["--no-warnings=false"],
      ["--input-type", "invalid"],
      ["--max-old-space-size=0"],
      ["--max-old-space-size", "256"],
      ["--max-semi-space-size", "8"],
      ["--stack-trace-limit", "10"],
      ["--max-semi-space-size", "invalid"],
      ["--stack-trace-limit=-1"],
      ["--unhandled-rejections=invalid"],
    ])
      expect
        .soft(() => assertSafeNodeArgv(argv), JSON.stringify(argv))
        .toThrow(/unsupported-child-plane/);
  });

  test("preserves_supported_node_operands_and_true_script_boundaries", async () => {
    const child = script("argv-control.mjs", "console.log(JSON.stringify(process.argv.slice(2)));");
    const cases = [
      ["--conditions", "proofline", "-e", "console.log('[]')"],
      ["--conditions=proofline", child],
      ["-C", "proofline", child],
      ["--input-type", "module", "--no-warnings", "-e", "console.log('[]')"],
      [
        "--input-type=module",
        "--experimental-strip-types",
        "--enable-source-maps",
        "-e",
        "console.log('[]')",
      ],
      ["--unhandled-rejections", "strict", "--max-old-space-size=256", child],
      ["--max-semi-space-size=8", "--stack-trace-limit=10", "-p", "JSON.stringify([])"],
      [child, "--require", "ordinary-app-argument"],
      ["--", child, "--import=ordinary-app-argument"],
      [
        "-e",
        "console.log(JSON.stringify(process.argv.slice(1)))",
        "--",
        "--require",
        "ordinary-app-argument",
      ],
    ];
    const expected = [
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      ["--require", "ordinary-app-argument"],
      ["--import=ordinary-app-argument"],
      ["--require", "ordinary-app-argument"],
    ];
    for (const [index, argv] of cases.entries()) {
      const result = await withProoflineGuard([process.execPath, ...argv], {
        allowedOrigins: [allowedOrigin],
      });
      expect(result.code, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(expected[index]);
    }
  });

  test("rejects_direct_operand_hidden_preloads_before_sentinel_execution", async () => {
    const marker = path.join(temporaryRoot, "direct-preload-ran");
    const sentinel = script(
      "direct-preload.cjs",
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");`,
    );
    const attempts = [
      ...["--require", "--import"].map((option) => [
        "--conditions",
        "proofline",
        option,
        sentinel,
        "-e",
        "0",
      ]),
      ...["-p", "--print"].flatMap((option) => [
        [option, "-r", sentinel, "-e", "0"],
        [option, `-r${sentinel}`, "-e", "0"],
        [option, "--no-warnings", "-r", sentinel, "-e", "0"],
      ]),
      ["--print=1", "0", "-r", sentinel, "-e", "0"],
    ];
    for (const argv of attempts) {
      let denial = "dispatched";
      try {
        await withProoflineGuard([process.execPath, ...argv], { allowedOrigins: [allowedOrigin] });
      } catch (error) {
        denial = String(error);
      }
      expect.soft({ denial, sentinelRan: existsSync(marker) }, JSON.stringify(argv)).toEqual({
        denial: expect.stringContaining("unsupported-child-plane"),
        sentinelRan: false,
      });
      rmSync(marker, { force: true });
    }
  });

  test("rejects_unreviewed_node_options_syntax_before_startup", () => {
    const rejected = [
      '"--require" sentinel.cjs',
      '--require="sentinel.cjs"',
      "--require=sentinel.cjs",
      "-r sentinel.cjs",
      "-rsentinel.cjs",
      '--re""quire sentinel.cjs',
      '"--requ\\ire" sentinel.cjs',
      "'--require' sentinel.cjs",
      "--import=sentinel.mjs",
      "--loader=sentinel.mjs",
      "--experimental-loader sentinel.mjs",
      "--inspect",
      "--inspect=127.0.0.1:0",
      '"--inspect=127.0.0.1:0"',
      "--inspect-brk=0",
      "--inspect-port=0",
      "--unknown-option value",
      "--conditions",
      "--conditions --require sentinel.cjs",
      "--conditions=",
      "--conditions=--require",
      "--trace-warnings=1",
      "--max-old-space-size 256",
      "--max-old-space-size=0",
      "--input-type=invalid",
      "--eval=0",
      "-e 0",
      "--print",
      "--",
      "ordinary-operand",
      "--trace-warnings\t--require sentinel.cjs",
      "--trace-warnings\n--require sentinel.cjs",
      "--trace-warnings\0",
      '"--trace-warnings"',
      "--trace-warnings\\",
      "--trace-warnings\u00a0",
      `${guardImportOption}suffix`,
      `prefix${guardImportOption}`,
      `${guardImportOption} ${guardImportOption}`,
      `"${guardImportOption}"`,
      `--import ${guardImportOption.slice("--import=".length)}`,
      `--conditions ${guardImportOption}`,
      `--conditions=${guardImportOption}`,
      null,
      42,
      {},
    ];
    for (const value of rejected)
      expect
        .soft(() => mergeGuardNodeOptions(value), JSON.stringify(value))
        .toThrow(/NODE_OPTIONS.*reviewed/);
    const secret = "private-environment-value";
    expect(() => mergeGuardNodeOptions(`--unknown=${secret}`)).toThrow(/NODE_OPTIONS/);
    try {
      mergeGuardNodeOptions(`--unknown=${secret}`);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  test("rejects_direct_node_options_preloads_before_sentinel_execution", async () => {
    const marker = path.join(temporaryRoot, "environment-preload-ran");
    const sentinel = script(
      "environment-preload.cjs",
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");`,
    );
    for (const nodeOptions of [
      `"--require" ${sentinel}`,
      `--re""quire ${sentinel}`,
      `"--requ\\ire" ${sentinel}`,
      `--require="${sentinel}"`,
      `--require=${sentinel}`,
      `--import=${sentinel}`,
    ]) {
      let denial = "dispatched";
      try {
        await withProoflineGuard([process.execPath, "-e", "0"], {
          allowedOrigins: [allowedOrigin],
          env: { NODE_OPTIONS: nodeOptions },
        });
      } catch (error) {
        denial = String(error);
      }
      expect.soft({ denial, sentinelRan: existsSync(marker) }, nodeOptions).toEqual({
        denial: expect.stringMatching(/NODE_OPTIONS.*reviewed/),
        sentinelRan: false,
      });
      rmSync(marker, { force: true });
    }
  });

  test("preserves_reviewed_node_options_and_exact_guard_inheritance", async () => {
    expect(mergeGuardNodeOptions()).toBe(guardImportOption);
    expect(mergeGuardNodeOptions(`  --trace-warnings  ${guardImportOption}  `)).toBe(
      `--trace-warnings ${guardImportOption}`,
    );
    for (const nodeOptions of [
      "--trace-warnings --trace-deprecation --no-deprecation --no-warnings",
      "--enable-source-maps --experimental-strip-types --experimental-transform-types",
      "--experimental-import-meta-resolve --no-experimental-detect-module --no-experimental-require-module",
      "--conditions proofline -C development --conditions=test --input-type=module",
      "--unhandled-rejections strict --max-old-space-size=256 --max-semi-space-size=8 --stack-trace-limit=0",
      `--trace-warnings ${guardImportOption}`,
    ]) {
      const result = await withProoflineGuard(
        [process.execPath, "-e", "console.log('safe-options')"],
        {
          allowedOrigins: [allowedOrigin],
          env: { NODE_OPTIONS: nodeOptions },
        },
      );
      expect(result.code, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe("safe-options");
    }
  });

  test("preserves_exact_guard_token_in_apostrophe_checkout_paths", async () => {
    const relocated = path.join(temporaryRoot, "Dean's checkout");
    mkdirSync(relocated);
    for (const name of ["guard-policy.mjs", "egress-guard.mjs", "run-guarded.mjs"])
      writeFileSync(
        path.join(relocated, name),
        readFileSync(path.join(repositoryRoot, "tools/proofline", name)),
      );
    const probe = script(
      "relocated-policy-probe.mjs",
      `
      import { fileURLToPath } from "node:url";
      const policy = await import(${JSON.stringify(path.join(relocated, "guard-policy.mjs"))});
      const initial = policy.mergeGuardNodeOptions("");
      const inherited = policy.mergeGuardNodeOptions(initial);
      const repeated = policy.mergeGuardNodeOptions(inherited);
      console.log(JSON.stringify({ initial, inherited, repeated, resolved: fileURLToPath(policy.guardPreloadUrl) }));
    `,
    );
    const result = await runNode(probe);
    expect(result.code, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.initial).not.toMatch(/["'\\]/);
    expect(output.inherited).toBe(output.initial);
    expect(output.repeated).toBe(output.initial);
    expect(output.resolved).toBe(realpathSync(path.join(relocated, "egress-guard.mjs")));
  });

  test("rejects_node_worker_threads_before_local_requests_or_target_execution", async () => {
    const marker = path.join(temporaryRoot, "worker-thread-ran");
    const source = `
      const { parentPort } = require("node:worker_threads");
      require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");
      fetch(${JSON.stringify(`${allowedOrigin}/worker-thread-sentinel`)})
        .then(response => response.text()).then(value => parentPort.postMessage(value))
        .catch(error => parentPort.postMessage(String(error)));
    `;
    const probe = script(
      "worker-planes.mjs",
      `
      import prefixed, { Worker as NamedWorker } from "node:worker_threads";
      import legacy, * as legacyNamespace from "worker_threads";
      import { createRequire } from "node:module";
      import { existsSync, rmSync } from "node:fs";
      const require = createRequire(import.meta.url);
      const constructors = {
        named: NamedWorker, default: prefixed.Worker, legacyDefault: legacy.Worker,
        legacyNamed: legacyNamespace.Worker, requirePrefixed: require("node:worker_threads").Worker,
        requireLegacy: require("worker_threads").Worker,
        builtinPrefixed: process.getBuiltinModule("node:worker_threads").Worker,
        builtinLegacy: process.getBuiltinModule("worker_threads").Worker,
        prototypeConstructor: NamedWorker.prototype.constructor,
      };
      const results = [];
      for (const [api, Worker] of Object.entries(constructors)) {
        for (const mode of ["inherited", "empty", "replaced"]) {
          const options = mode === "inherited" ? { eval: true } : {
            eval: true, execArgv: [], env: mode === "empty" ? {} : {
              NODE_OPTIONS: "", PROOFLINE_ALLOWED_ORIGINS: ${JSON.stringify(JSON.stringify([allowedOrigin]))},
            },
          };
          let denial = "dispatched", created = false;
          try {
            const worker = new Worker(${JSON.stringify(source)}, options);
            created = true;
            await new Promise(resolve => {
              worker.on("error", () => {});
              worker.on("exit", resolve);
            });
          } catch (error) { denial = String(error); }
          results.push({ api, mode, denial, created, targetRan: existsSync(${JSON.stringify(marker)}) });
          rmSync(${JSON.stringify(marker)}, { force: true });
        }
      }
      // Refuse the outer thread before it can start a stripped-environment nested thread.
      const nested = 'new (require("node:worker_threads").Worker)(' + ${JSON.stringify(JSON.stringify(source))} + ', {eval:true, execArgv:[], env:{}})';
      let denial = "dispatched", created = false;
      try {
        const worker = new NamedWorker(nested, { eval: true, execArgv: [], env: {} });
        created = true;
        await new Promise(resolve => { worker.on("error", () => {}); worker.on("exit", resolve); });
      } catch (error) { denial = String(error); }
      results.push({ api: "nested", mode: "empty", denial, created, targetRan: existsSync(${JSON.stringify(marker)}) });
      console.log(JSON.stringify(results));
    `,
    );
    const before = workerRequests;
    const result = await runNode(probe, { allowedOrigins: ["http://127.0.0.1:1"] });
    expect(result.code, result.stderr).toBe(0);
    const outcomes = JSON.parse(result.stdout);
    expect(outcomes).toHaveLength(28);
    for (const outcome of outcomes)
      expect.soft(outcome, `${outcome.api} ${outcome.mode}`).toMatchObject({
        denial: expect.stringContaining("unsupported-worker-plane"),
        created: false,
        targetRan: false,
      });
    expect(workerRequests - before).toBe(0);
    expect(existsSync(marker)).toBe(false);
  });

  test("rejects_async_module_loader_threads_before_local_requests_or_target_execution", async () => {
    const marker = path.join(temporaryRoot, "loader-thread-ran");
    const loaderSource = `
      import { writeFileSync } from "node:fs";
      writeFileSync(${JSON.stringify(marker)}, "ran");
      await fetch(${JSON.stringify(`${allowedOrigin}/worker-thread-sentinel`)});
    `;
    const probe = script(
      "loader-planes.mjs",
      `
      import prefixed, { register, Module } from "node:module";
      import legacy, * as legacyNamespace from "module";
      import { createRequire } from "node:module";
      import { writeFileSync, existsSync, rmSync } from "node:fs";
      import { pathToFileURL } from "node:url";
      import path from "node:path";
      const require = createRequire(import.meta.url);
      const registrations = {
        named: register, default: prefixed.register, moduleClass: Module.register,
        legacyDefault: legacy.register, legacyNamed: legacyNamespace.register,
        requirePrefixed: require("node:module").register, requireLegacy: require("module").register,
        builtinPrefixed: process.getBuiltinModule("node:module").register,
        builtinLegacy: process.getBuiltinModule("module").register,
      };
      const results = [];
      for (const [api, registerLoader] of Object.entries(registrations)) {
        const file = path.join(${JSON.stringify(temporaryRoot)}, 'loader-' + api + '.mjs');
        writeFileSync(file, ${JSON.stringify(loaderSource)});
        let denial = "dispatched", registered = false;
        try { registerLoader(pathToFileURL(file).href); registered = true; }
        catch (error) { denial = String(error); }
        results.push({ api, denial, registered, targetRan: existsSync(${JSON.stringify(marker)}) });
        rmSync(${JSON.stringify(marker)}, { force: true });
      }
      console.log(JSON.stringify(results));
    `,
    );
    const before = workerRequests;
    const result = await runNode(probe, { allowedOrigins: ["http://127.0.0.1:1"] });
    expect(result.code, result.stderr).toBe(0);
    const outcomes = JSON.parse(result.stdout);
    expect(outcomes).toHaveLength(9);
    for (const outcome of outcomes)
      expect.soft(outcome, outcome.api).toMatchObject({
        denial: expect.stringContaining("unsupported-loader-plane"),
        registered: false,
        targetRan: false,
      });
    expect(workerRequests - before).toBe(0);
    expect(existsSync(marker)).toBe(false);
  });

  test("preserves_synchronous_module_hooks_inside_the_guarded_runtime", async () => {
    const probe = script(
      "synchronous-hooks.mjs",
      `
      import { registerHooks } from "node:module";
      let pending, hookRan = false;
      const hook = registerHooks({
        resolve(specifier, context, nextResolve) {
          if (specifier === "data:text/javascript,export default 1") {
            hookRan = true;
            pending = fetch(${JSON.stringify(`${allowedOrigin}/worker-thread-sentinel`)})
              .then(() => "dispatched", error => String(error));
          }
          return nextResolve(specifier, context);
        },
      });
      try {
        const target = await import("data:text/javascript,export default 1");
        console.log(JSON.stringify({ hookRan, denial: await pending, value: target.default }));
      } finally { hook.deregister(); }
    `,
    );
    const before = workerRequests;
    const result = await runNode(probe, { allowedOrigins: ["http://127.0.0.1:1"] });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      hookRan: true,
      denial: expect.stringContaining("Proofline egress denied plane=fetch"),
      value: 1,
    });
    expect(workerRequests - before).toBe(0);
  });

  test("snapshots_direct_launcher_argv_and_environment_before_validation", async () => {
    let argvReads = 0;
    let envReads = 0;
    let nodeOptionsReads = 0;
    let shellReads = 0;
    const command = [process.execPath, "-e", "console.log(process.env.SNAPSHOT_VALUE)"];
    Object.defineProperty(command, "2", {
      get() {
        argvReads += 1;
        return "console.log(process.env.SNAPSHOT_VALUE)";
      },
    });
    const result = await withProoflineGuard(command, {
      allowedOrigins: [allowedOrigin],
      get shell() {
        shellReads += 1;
        return false as const;
      },
      env: {
        get SNAPSHOT_VALUE() {
          envReads += 1;
          return "snapshot-safe";
        },
        get NODE_OPTIONS() {
          nodeOptionsReads += 1;
          return "--trace-warnings";
        },
      },
    });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("snapshot-safe");
    expect({ argvReads, envReads, nodeOptionsReads, shellReads }).toEqual({
      argvReads: 1,
      envReads: 1,
      nodeOptionsReads: 1,
      shellReads: 1,
    });
  });

  test("binds_http_effective_options_and_public_constructors_to_the_guard", async () => {
    const file = script(
      "http-stable-options.mjs",
      `
      import http from "node:http";
      const origin = new URL(process.env.TEST_ORIGIN);
      let portReads = 0;
      const read = options => new Promise((resolve, reject) => {
        http.get(options, response => { let body = ""; response.on("data", chunk => body += chunk); response.on("end", () => resolve(body)); }).on("error", reject);
      });
      const viaDefault = await read({ hostname: origin.hostname, defaultPort: Number(origin.port) });
      const viaGetter = await read({ hostname: origin.hostname, get port() { portReads += 1; return origin.port; } });
      const request = http.request(origin.href);
      const constructor = request.constructor;
      request.on("error", () => {}); request.destroy();
      console.log(JSON.stringify({ viaDefault, viaGetter, portReads,
        exportedPrototypeIsFunction: Object.getPrototypeOf(http.ClientRequest) === Function.prototype,
        instanceConstructorGuarded: constructor === http.ClientRequest,
        prototypeConstructorGuarded: http.ClientRequest.prototype.constructor === http.ClientRequest,
      }));
    `,
    );
    const result = await runNode(file, { env: { TEST_ORIGIN: allowedOrigin } });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      viaDefault: "loopback-ok",
      viaGetter: "loopback-ok",
      portReads: 1,
      exportedPrototypeIsFunction: true,
      instanceConstructorGuarded: true,
      prototypeConstructorGuarded: true,
    });
  });

  test("snapshots_websocket_urls_and_denies_custom_transport_options", async () => {
    const file = script(
      "websocket-stable-options.mjs",
      `
      let reads = 0;
      const value = { toString() { reads += 1; return process.env.TEST_ORIGIN.replace("http:", "ws:"); } };
      const socket = new WebSocket(value);
      socket.addEventListener("error", () => {}); socket.close();
      const errors = [];
      for (const options of [{ dispatcher: {} }, { agent: {} }, { proxy: "unused" }, { lookup() {} }, { createConnection() {} }]) {
        try { new WebSocket(process.env.TEST_ORIGIN.replace("http:", "ws:"), options); }
        catch (error) { errors.push(String(error)); }
      }
      console.log(JSON.stringify({ reads, errors,
        exportedPrototypeIsFunction: Object.getPrototypeOf(WebSocket) === EventTarget,
        instanceConstructorGuarded: socket.constructor === WebSocket,
        prototypeConstructorGuarded: WebSocket.prototype.constructor === WebSocket,
      }));
    `,
    );
    const result = await runNode(file, {
      allowedOrigins: [allowedOrigin.replace("http:", "ws:")],
      env: { TEST_ORIGIN: allowedOrigin },
    });
    expect(result.code, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      reads: 1,
      exportedPrototypeIsFunction: true,
      instanceConstructorGuarded: true,
      prototypeConstructorGuarded: true,
    });
    expect(output.errors).toHaveLength(5);
    for (const error of output.errors) expect(error).toContain("Proofline egress denied");
  });

  test("guards_socket_connect_aliases_and_preserves_allowed_numeric_loopback", async () => {
    const file = script(
      "socket-boundaries.mjs",
      `
      import net from "node:net";
      import tls from "node:tls";
      import http from "node:http";
      const allowed = new URL(process.env.TEST_ORIGIN);
      const forbidden = new URL(process.env.OTHER_ORIGIN);
      const attempt = create => new Promise(resolve => {
        try {
          const socket = create();
          socket.once("error", error => { socket.destroy(); resolve(String(error)); });
          socket.once("connect", () => { socket.destroy(); resolve("connected"); });
        } catch (error) { resolve(String(error)); }
      });
      const positive = await attempt(() => net.connect({ host: allowed.hostname, port: Number(allowed.port) }));
      const options = { host: forbidden.hostname.replaceAll("[", "").replaceAll("]", ""), port: Number(forbidden.port) };
      const results = [];
      for (const create of [() => net.connect(options), () => net.createConnection(options),
        () => new net.Socket().connect(options), () => new http.Agent().createConnection(options),
        () => tls.connect(options), () => new tls.TLSSocket().connect(options)]) results.push(await attempt(create));
      console.log(JSON.stringify({ positive, results }));
    `,
    );
    const result = await runNode(file, {
      env: { TEST_ORIGIN: allowedOrigin, OTHER_ORIGIN: ipv6Origin },
    });
    expect(result.code, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.positive).toBe("connected");
    expect(output.results).toHaveLength(6);
    for (const outcome of output.results) expect(outcome).toContain("Proofline egress denied");
  });

  test("rejects_unsupported_datagram_http2_and_dns_query_aliases_before_dispatch", async () => {
    const file = script(
      "unsupported-network-planes.mjs",
      `
      import dgram from "node:dgram";
      import http2 from "node:http2";
      import dns from "node:dns";
      import dnsPromises from "node:dns/promises";
      import { createRequire } from "node:module";
      const require = createRequire(import.meta.url);
      const results = [];
      const check = async call => {
        try { const result = await call(); result?.close?.(); results.push("accepted"); }
        catch (error) { results.push(String(error)); }
      };
      await check(() => dgram.createSocket("udp4"));
      await check(() => new dgram.Socket("udp4"));
      await check(() => dgram.Socket.prototype.send.call({}));
      await check(() => dgram.Socket.prototype.connect.call({}));
      await check(() => http2.connect());
      for (const module of [dns, dnsPromises, dns.promises, require("dns"), require("dns/promises")]) {
        for (const key of Object.keys(module).filter(key => key === "lookup" || key === "lookupService" || key === "reverse" || /^resolve/.test(key)))
          if (typeof module[key] === "function") await check(() => module[key]());
        for (const key of Object.getOwnPropertyNames(module.Resolver.prototype).filter(key => key === "reverse" || /^resolve/.test(key)))
          await check(() => module.Resolver.prototype[key].call(new module.Resolver()));
      }
      console.log(JSON.stringify(results));
    `,
    );
    const result = await runNode(file);
    expect(result.code, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.length).toBeGreaterThan(50);
    for (const outcome of output) expect(outcome).toContain("Proofline unsupported-network-plane");
  });

  test("resolves_only_synthetic_loopback_lookup_names_without_network_queries", async () => {
    const file = script(
      "synthetic-loopback-lookup.mjs",
      `
      import dns from "node:dns";
      import dnsPromises from "node:dns/promises";
      import { promisify } from "node:util";
      const callback = await new Promise((resolve, reject) => dns.lookup("localhost", (error, address, family) => error ? reject(error) : resolve({ address, family })));
      const promise = await dnsPromises.lookup("127.0.0.1");
      const all = await dns.promises.lookup("localhost", { all: true, family: 6 });
      const custom = await promisify(dns.lookup)("::1");
      console.log(JSON.stringify({ callback, promise, all, custom }));
    `,
    );
    const result = await runNode(file);
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      callback: { address: "127.0.0.1", family: 4 },
      promise: { address: "127.0.0.1", family: 4 },
      all: [{ address: "::1", family: 6 }],
      custom: { address: "::1", family: 6 },
    });
  });

  test("uses_stable_fetch_options_and_effective_websocket_protocols", async () => {
    const file = script(
      "effective-network-options.mjs",
      `
      let methodReads = 0;
      const response = await fetch(process.env.TEST_ORIGIN, { get method() { methodReads += 1; return "GET"; } });
      const socket = new WebSocket(process.env.TEST_ORIGIN);
      socket.addEventListener("error", () => {}); socket.close();
      let rejected;
      try { new WebSocket(process.env.TEST_ORIGIN.replace("http:", "ws:"), { _defaultAgent: {} }); }
      catch (error) { rejected = String(error); }
      console.log(JSON.stringify({ methodReads, response: await response.text(), rejected }));
    `,
    );
    const result = await runNode(file, {
      allowedOrigins: [allowedOrigin, allowedOrigin.replace("http:", "ws:")],
      env: { TEST_ORIGIN: allowedOrigin },
    });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      methodReads: 1,
      response: "loopback-ok",
      rejected: expect.stringContaining("Proofline egress denied"),
    });
    const deniedFile = script(
      "websocket-effective-protocol-denied.mjs",
      `
      try { new WebSocket(process.env.TEST_ORIGIN); }
      catch (error) { console.log(String(error)); }
    `,
    );
    const denied = await runNode(deniedFile, { env: { TEST_ORIGIN: allowedOrigin } });
    expect(denied.code, denied.stderr).toBe(0);
    expect(denied.stdout).toContain("Proofline egress denied");
  });

  test("rejects_unapproved_low_level_child_dispatch_before_native_execution", async () => {
    const file = script(
      "low-level-child-policy.mjs",
      `
      import childProcess, { ChildProcess } from "node:child_process";
      import { createRequire } from "node:module";
      const require = createRequire(import.meta.url);
      const results = [];
      for (const Constructor of [ChildProcess, childProcess.ChildProcess, require("child_process").ChildProcess]) {
        const child = new Constructor();
        let denial;
        try { child.spawn({ file: process.execPath, args: [process.execPath, "--version"], envPairs: [], stdio: "ignore" }); }
        catch (error) { denial = String(error); }
        if (child.pid) await new Promise(resolve => child.once("close", resolve));
        results.push({ denial, dispatched: !!child.pid });
      }
      console.log(JSON.stringify(results));
    `,
    );
    const result = await runNode(file);
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      Array.from({ length: 3 }, () => ({
        denial: expect.stringContaining("Proofline unsupported-child-plane"),
        dispatched: false,
      })),
    );
  });

  test("preserves_loopback_websocket_events_subclasses_and_static_constants", async () => {
    const file = script(
      "websocket-positive-control.mjs",
      `
      class LocalSocket extends WebSocket {}
      const result = await new Promise((resolve, reject) => {
        const socket = new LocalSocket(process.env.TEST_ORIGIN);
        let opened = false;
        socket.addEventListener("open", () => { opened = socket.readyState === WebSocket.OPEN; });
        socket.addEventListener("error", reject);
        socket.addEventListener("message", event => {
          const value = { opened, message: event.data, subclass: socket instanceof LocalSocket, base: socket instanceof WebSocket,
            constructor: socket.constructor === LocalSocket, constants: [WebSocket.CONNECTING, WebSocket.OPEN, WebSocket.CLOSING, WebSocket.CLOSED] };
          socket.addEventListener("close", () => resolve(value));
          socket.close();
        });
      });
      console.log(JSON.stringify(result));
    `,
    );
    const result = await runNode(file, {
      allowedOrigins: [allowedOrigin.replace("http:", "ws:")],
      env: { TEST_ORIGIN: allowedOrigin.replace("http:", "ws:") },
    });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      opened: true,
      message: "ok",
      subclass: true,
      base: true,
      constructor: true,
      constants: [0, 1, 2, 3],
    });
  });

  test("coerces_fetch_method_values_once_before_constructing_the_request", async () => {
    const file = script(
      "fetch-method-value.mjs",
      `
      let reads = 0;
      const method = { toString() { reads += 1; return "GET"; } };
      const response = await fetch(process.env.TEST_ORIGIN, { method });
      console.log(JSON.stringify({ reads, response: await response.text() }));
    `,
    );
    const result = await runNode(file, { env: { TEST_ORIGIN: allowedOrigin } });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ reads: 1, response: "loopback-ok" });
  });

  test("copies_raw_http_header_array_members_without_calling_collection_overrides", async () => {
    const file = script(
      "http-header-array.mjs",
      `
      import http from "node:http";
      let mapReads = 0, valueReads = 0;
      const headers = ["x-proofline", "preserved", "host", new URL(process.env.TEST_ORIGIN).host];
      headers.map = function(callback) { mapReads += 1; return Array.prototype.map.call(this, callback); };
      Object.defineProperty(headers, "1", { get() { valueReads += 1; return "preserved"; } });
      const body = await new Promise((resolve, reject) => http.get(process.env.TEST_ORIGIN + "/request-semantics", { headers }, response => {
        let body = ""; response.on("data", chunk => body += chunk); response.on("end", () => resolve(body));
      }).on("error", reject));
      console.log(JSON.stringify({ mapReads, valueReads, body }));
    `,
    );
    const result = await runNode(file, { env: { TEST_ORIGIN: allowedOrigin } });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ mapReads: 0, valueReads: 1, body: "preserved:" });
  });

  test("preserves_raw_and_array_valued_headers_without_array_species_or_iterators", async () => {
    const file = script(
      "http-header-plain-capture.mjs",
      `
      import http from "node:http";
      let speciesReads = 0, constructorReads = 0, mapReads = 0, iteratorReads = 0, rawReads = 0, namedReads = 0;
      class HeaderList extends Array {
        static get [Symbol.species]() { speciesReads += 1; return class HeaderRecord {}; }
      }
      const decorate = values => {
        Object.defineProperty(values, "constructor", { get() { constructorReads += 1; return HeaderList; } });
        Object.defineProperty(values, "map", { get() { mapReads += 1; return Array.prototype.map; } });
        Object.defineProperty(values, Symbol.iterator, { get() { iteratorReads += 1; return Array.prototype[Symbol.iterator]; } });
        return values;
      };
      const raw = decorate(new HeaderList("x-proofline", "preserved", "host", new URL(process.env.TEST_ORIGIN).host));
      Object.defineProperty(raw, "1", { get() { rawReads += 1; return "preserved"; } });
      const values = decorate(new HeaderList("first", "second"));
      Object.defineProperty(values, "0", { get() { namedReads += 1; return "first"; } });
      Object.defineProperty(values, "1", { get() { namedReads += 1; return "second"; } });
      const read = headers => new Promise((resolve, reject) => http.get(process.env.TEST_ORIGIN + "/request-semantics", { headers }, response => {
        let body = ""; response.on("data", chunk => body += chunk); response.on("end", () => resolve(body));
      }).on("error", reject));
      const rawBody = await read(raw);
      const namedBody = await read({ "x-proofline": values });
      console.log(JSON.stringify({ rawBody, namedBody, speciesReads, constructorReads, mapReads, iteratorReads, rawReads, namedReads }));
    `,
    );
    const result = await runNode(file, { env: { TEST_ORIGIN: allowedOrigin } });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      rawBody: "preserved:",
      namedBody: "first, second:",
      speciesReads: 0,
      constructorReads: 0,
      mapReads: 0,
      iteratorReads: 0,
      rawReads: 1,
      namedReads: 2,
    });
  });

  test("protects_in_process_nx_environment_in_default_overridden_and_nested_launches", async () => {
    const leaf = script(
      "guarded-tool-environment-leaf.mjs",
      `
      console.log(JSON.stringify({ daemon: process.env.NX_DAEMON, plugins: process.env.NX_ISOLATE_PLUGINS }));
    `,
    );
    const parent = script(
      "guarded-tool-environment-parent.mjs",
      `
      import { spawnSync } from "node:child_process";
      let daemonReads = 0, pluginReads = 0;
      const env = {
        get NX_DAEMON() { daemonReads += 1; return "true"; },
        get NX_ISOLATE_PLUGINS() { pluginReads += 1; return "true"; },
      };
      const child = spawnSync(process.execPath, [${JSON.stringify(leaf)}], { env, encoding: "utf8" });
      if (child.status !== 0) throw new Error(child.stderr);
      console.log(JSON.stringify({ current: { daemon: process.env.NX_DAEMON, plugins: process.env.NX_ISOLATE_PLUGINS },
        nested: JSON.parse(child.stdout), daemonReads, pluginReads }));
    `,
    );
    const expected = { daemon: "false", plugins: "false" };
    const defaults = await runNode(leaf);
    expect(defaults.code, defaults.stderr).toBe(0);
    expect(JSON.parse(defaults.stdout)).toEqual(expected);
    let daemonReads = 0,
      pluginReads = 0;
    const overridden = await runNode(parent, {
      env: {
        get NX_DAEMON() {
          daemonReads += 1;
          return "true";
        },
        get NX_ISOLATE_PLUGINS() {
          pluginReads += 1;
          return "true";
        },
      },
    });
    expect(overridden.code, overridden.stderr).toBe(0);
    expect(JSON.parse(overridden.stdout)).toEqual({
      current: expected,
      nested: expected,
      daemonReads: 1,
      pluginReads: 1,
    });
    expect({ daemonReads, pluginReads }).toEqual({ daemonReads: 1, pluginReads: 1 });
  });

  test("preserves_optional_print_expressions_without_hiding_node_options", async () => {
    const child = script(
      "print-control.mjs",
      "console.log(JSON.stringify(process.argv.slice(2)));",
    );
    for (const option of ["-p", "--print"]) {
      const cases = [
        { argv: [option], output: "undefined" },
        { argv: [option, "JSON.stringify([])"], output: "[]" },
        { argv: [option, "\\-1"], output: "-1" },
        { argv: [option, "-e", "JSON.stringify([])"], output: "[]" },
        { argv: [option, "--no-warnings", "-e", "JSON.stringify([])"], output: "[]" },
        {
          argv: [option, "--", child, "-r", "ordinary-app-argument"],
          output: '["-r","ordinary-app-argument"]',
        },
      ];
      for (const { argv, output } of cases) {
        let result: GuardedRunResult | undefined;
        let error: unknown;
        try {
          result = await withProoflineGuard([process.execPath, ...argv], {
            allowedOrigins: [allowedOrigin],
            env: { FORCE_COLOR: "0" },
          });
        } catch (caught) {
          error = caught;
        }
        expect.soft(error, JSON.stringify(argv)).toBeUndefined();
        expect.soft(result?.code, result?.stderr).toBe(0);
        expect.soft(result?.stdout.trim(), JSON.stringify(argv)).toBe(output);
      }
    }
    for (const argv of [
      ["--print=1"],
      ["-p=1"],
      ["-p", "-1"],
      ["--eval", "-r"],
      ["--conditions", "-r"],
    ])
      expect
        .soft(() => assertSafeNodeArgv(argv), JSON.stringify(argv))
        .toThrow(/unsupported-child-plane/);
  });
});
