import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, onTestFinished, test } from "vitest";
import { harnessManifestSchema, validateHarness } from "./harness-manifest.ts";
import type { discoverCandidates } from "./main.ts";
import { selectImpact } from "./select.ts";

// The probe deliberately exercises synchronous production APIs in a separate
// guarded process. Await its lifecycle so Vitest can service timers and RPC ACKs.
const runProbe = async <T>(mode: "discover" | "execute", input: unknown): Promise<T> => {
  const directory = mkdtempSync(path.join(tmpdir(), "proofline-real-manifest-"));
  const resultFile = path.join(directory, "result.json");
  try {
    const child = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        path.resolve(import.meta.dirname, "../fixtures/real-manifest-probe.mjs"),
        mode,
        resultFile,
      ],
      { cwd: process.cwd(), stdio: ["pipe", "inherit", "inherit"] },
    );
    onTestFinished(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    });
    await new Promise<void>((resolve, reject) => {
      let inputError: Error | undefined;
      child.once("error", reject);
      child.stdin.once("error", (error) => {
        inputError = error;
      });
      child.once("close", (code, signal) => {
        if (inputError) reject(inputError);
        else if (code !== 0 || signal !== null)
          reject(new Error(`Real manifest ${mode} probe failed: code=${code}, signal=${signal}.`));
        else resolve();
      });
      child.stdin.end(JSON.stringify(input));
    });
    return JSON.parse(readFileSync(resultFile, "utf8")) as T;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const loadSelection = async () => {
  const cwd = process.cwd();
  const manifest = harnessManifestSchema.parse(
    JSON.parse(readFileSync(path.join(cwd, "proofline.harness.json"), "utf8")),
  );
  const discovery = await runProbe<ReturnType<typeof discoverCandidates>>("discover", { manifest });
  expect(discovery.plans).not.toHaveLength(0);
  for (const plan of discovery.plans) {
    expect(plan.argv.slice(0, 3)).toEqual([
      process.execPath,
      manifest.adapters.runnerEgress,
      plan.runner,
    ]);
  }
  expect(discovery.identities.vitest.length).toBeGreaterThan(300);
  expect(discovery.identities.playwright.length).toBeGreaterThan(30);
  expect(validateHarness({ cwd, manifest, discovered: discovery.identities }).errors).toEqual([]);

  const source = "apps/crm-web/src/features/quotes/quote-form.tsx";
  const selection = selectImpact({
    manifest,
    changes: {
      base: "controlled-base",
      head: "controlled-head",
      files: [{ path: source, status: "modified" }],
      uncertainty: [],
    },
    discovered: discovery.identities,
    sourceFiles: discovery.sourceFiles,
  });
  expect(selection.fallback).toBe("none");
  expect(selection.errors).toEqual([]);
  expect(selection.identities.vitest).toEqual([
    expect.objectContaining({ file: "apps/crm-web/src/test/api.test.ts" }),
  ]);
  expect(selection.identities.playwright).toEqual([
    expect.objectContaining({
      path: "apps/crm-e2e/src/proofline/recovery-and-authority.spec.ts",
      title: "recovers_an_accepted_bind_without_duplicate_policy_or_ledger",
    }),
  ]);

  return { cwd, discovery, selection };
};

test("real_manifest_discovers_and_selects_exact_vitest_and_playwright_identities", async () => {
  let heartbeats = 0;
  const started = performance.now();
  const heartbeat = setInterval(() => {
    heartbeats += 1;
  }, 10);
  try {
    await loadSelection();
    expect(
      heartbeats,
      `Vitest worker heartbeat during actual discovery (${Math.round(performance.now() - started)}ms)`,
    ).toBeGreaterThan(0);
  } finally {
    clearInterval(heartbeat);
  }
}, 120_000);

test("real_manifest_executes_its_selected_vitest_and_playwright_identities", async () => {
  const { discovery, selection } = await loadSelection();
  // Focused execution enters each selected adapter directly. The production impact command
  // separately executes declared build dependencies before the exact browser identity.
  const result = await runProbe("execute", {
    selection: selection.identities,
    plans: discovery.plans.map((plan) => ({ ...plan, dependencies: [] })),
  });
  expect(result).toEqual({ executed: true });
}, 120_000);
