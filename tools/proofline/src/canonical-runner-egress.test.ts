import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";

let origin = "";
let hits = 0;
let server: http.Server;
const temporary = mkdtempSync(path.join(tmpdir(), "proofline-canonical-egress-"));

beforeAll(async () => {
  server = http.createServer((_request, response) => {
    hits += 1;
    response.end("reached");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Probe did not bind TCP.");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  rmSync(temporary, { recursive: true, force: true });
});

const request = (transport: typeof http | typeof https, url: string) =>
  new Promise<string>((resolve) => {
    try {
      const outgoing = transport.get(url, (response) => {
        response.resume();
        response.on("end", () => resolve("dispatched"));
      });
      outgoing.on("error", (error) => resolve(String(error)));
    } catch (error) {
      resolve(String(error));
    }
  });

const runChild = (file: string) =>
  new Promise<{ status: number | null; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [file], {
      env: { ...process.env, PROOFLINE_PROBE_ORIGIN: origin },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (status) => resolve({ status, stderr }));
  });

test("canonical_unit_runner_denies_fetch_http_https_websocket_and_inherited_child_egress", async () => {
  const child = path.join(temporary, "child.mjs");
  writeFileSync(child, "await fetch(process.env.PROOFLINE_PROBE_ORIGIN + '/child');\n");
  const outcomes = {
    fetch: await fetch(`${origin}/fetch`).then(
      () => "dispatched",
      (error) => String(error),
    ),
    http: await request(http, `${origin}/http`),
    https: await request(https, `${origin.replace("http:", "https:")}/https`),
    websocket: (() => {
      try {
        const socket = new WebSocket(`${origin.replace("http:", "ws:")}/socket`);
        socket.addEventListener("error", () => undefined);
        socket.close();
        return "dispatched";
      } catch (error) {
        return String(error);
      }
    })(),
    child: await runChild(child),
  };
  for (const plane of ["fetch", "http", "https", "websocket"] as const)
    expect(outcomes[plane], plane).toContain("Proofline egress denied");
  expect(outcomes.child.status).not.toBe(0);
  expect(outcomes.child.stderr).toContain("Proofline egress denied plane=fetch");
  expect(hits).toBe(0);
});

test("canonical_unit_runner_rejects_package_manager_wrapper_escape_with_stripped_env", async () => {
  const child = path.join(temporary, "wrapper-child.mjs");
  writeFileSync(child, "await fetch(process.env.PROOFLINE_PROBE_ORIGIN + '/wrapper');\n");
  const runAttempt = (command: string, args: string[]) =>
    new Promise<{ status: number | null; output: string }>((resolve) => {
      let wrapper: ReturnType<typeof spawn>;
      try {
        wrapper = spawn(command, args, {
          env: {
            PATH: process.env.PATH,
            PROOFLINE_PROBE_ORIGIN: origin,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        resolve({ status: null, output: String(error) });
        return;
      }
      if (!wrapper.stdout || !wrapper.stderr) {
        resolve({ status: null, output: "Proofline probe child did not expose piped output." });
        return;
      }
      let output = "";
      wrapper.stdout.setEncoding("utf8");
      wrapper.stderr.setEncoding("utf8");
      wrapper.stdout.on("data", (chunk) => (output += chunk));
      wrapper.stderr.on("data", (chunk) => (output += chunk));
      wrapper.on("close", (status) => resolve({ status, output }));
    });
  const rejected = await Promise.all([
    runAttempt("pnpm", ["exec", "node", child]),
    runAttempt("pnpm", ["exec", "pnpm", "exec", "node", child]),
    runAttempt(path.resolve("node_modules/.bin/nx"), ["exec", "--", "node", child]),
    runAttempt(path.resolve("node_modules/.bin/playwright"), ["codegen", origin]),
    runAttempt(path.resolve("node_modules/.bin/vitest"), ["--inspect", child]),
  ]);
  for (const attempt of rejected) {
    expect(attempt.status, attempt.output).not.toBe(0);
    expect(attempt.output).toContain("Proofline unsupported-child-plane");
  }
  const guardedTest = path.resolve("tools/proofline/src/product-e2e-boundary.test.ts");
  const guardedWrapper = await runAttempt("pnpm", [
    "exec",
    "vitest",
    "run",
    guardedTest,
    "-t",
    "canonical_wrapper_descendant_retains_egress_guard",
    "--reporter=dot",
  ]);
  expect(hits).toBe(0);
  expect(guardedWrapper.status, guardedWrapper.output).not.toBe(0);
  expect(guardedWrapper.output).toContain("Proofline egress denied");
});

test("canonical_unit_runner_rejects_forged_delegated_policy_broadening", async () => {
  const child = path.join(temporary, "delegated-policy-child.mjs");
  writeFileSync(child, "await fetch(process.env.PROOFLINE_PROBE_ORIGIN + '/delegated');\n");
  const runDelegated = (env: NodeJS.ProcessEnv) =>
    new Promise<{ status: number | null; output: string }>((resolve) => {
      let spawned: ReturnType<typeof spawn>;
      try {
        spawned = spawn(process.execPath, [child], {
          env,
          stdio: ["ignore", "ignore", "pipe"],
          [Symbol.for("proofline.egress-guard.delegated-policy")]: true,
        });
      } catch (error) {
        resolve({ status: null, output: String(error) });
        return;
      }
      if (!spawned.stderr) {
        resolve({ status: null, output: "Proofline delegated probe did not expose stderr." });
        return;
      }
      let output = "";
      spawned.stderr.setEncoding("utf8");
      spawned.stderr.on("data", (chunk) => (output += chunk));
      spawned.on("close", (status) => resolve({ status, output }));
    });
  const originBroadening = await runDelegated({
    ...process.env,
    PROOFLINE_ALLOWED_ORIGINS: JSON.stringify([origin]),
    PROOFLINE_ALLOWED_CHILD_CAPABILITIES: "[]",
    PROOFLINE_PROBE_ORIGIN: origin,
  });
  const installedCapabilities = JSON.parse(
    process.env.PROOFLINE_ALLOWED_CHILD_CAPABILITIES ?? "[]",
  ) as unknown[];
  const capabilityBroadening = await runDelegated({
    ...process.env,
    PROOFLINE_ALLOWED_CHILD_CAPABILITIES: JSON.stringify([
      ...installedCapabilities,
      { executable: "/bin/echo", purpose: "git-local" },
    ]),
    PROOFLINE_PROBE_ORIGIN: origin,
  });
  for (const result of [originBroadening, capabilityBroadening]) {
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toMatch(/delegated policy|Proofline egress denied/i);
  }
  expect(hits).toBe(0);
});
