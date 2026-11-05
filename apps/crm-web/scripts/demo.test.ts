import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
// @ts-expect-error Reference-only launcher is plain JavaScript.
import { launchBuiltDemo, runDemo } from "./demo.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const launcher = path.join(root, "apps/crm-web/scripts/demo.mjs");

test("launches_fresh_guarded_loopback_sessions_and_closes_the_listener", async () => {
  const first = launchBuiltDemo();
  const second = launchBuiltDemo();
  try {
    const [one, two] = await Promise.all([first.ready, second.ready]);
    expect(new URL(one.url).hostname).toBe("127.0.0.1");
    expect(new URL(one.url).pathname).toBe("/app/crm/customers");
    expect(one.capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(one.capability).not.toBe(two.capability);
    expect(one.origin).not.toBe(two.origin);
    const html = readFileSync(path.join(root, "dist/crm-web-demo/index.html"), "utf8");
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
    first.stop();
    expect((await first.completion).code).toBe(0);
    expect(first.stop()).toBe(false);
  } finally {
    first.stop();
    second.stop();
    await Promise.all([first.completion, second.completion]);
  }
});

test("preserves_context_adapter_network_semantics_in_the_existing_test_artifact", () => {
  const html = readFileSync(path.join(root, "dist/crm-web-test/index.html"), "utf8");
  expect(html).not.toContain("Content-Security-Policy");
  expect(html).toContain("fonts.googleapis.com");
});

test("rejects_host_port_and_other_unreviewed_demo_arguments", async () => {
  for (const args of [["--host", "0.0.0.0"], ["--port", "80"], ["--no-build"]]) {
    await expect(runDemo(args)).rejects.toThrow("The reference demo accepts no arguments");
    const result = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [launcher, ...args], {
        cwd: root,
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, stderr }));
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("The reference demo accepts no arguments");
  }
});

test("keeps_demo_policy_and_seeded_adapters_out_of_the_production_document", () => {
  const html = readFileSync(path.join(root, "dist/crm-web/index.html"), "utf8");
  expect(html).toContain("fonts.googleapis.com");
  expect(html).not.toContain("Content-Security-Policy");
  expect(html).not.toContain("__PROOFLINE_TEST_BOOTSTRAP__");
});
