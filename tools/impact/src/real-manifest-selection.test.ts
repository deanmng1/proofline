import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { harnessManifestSchema, validateHarness } from "./harness-manifest.ts";
import { discoverCandidates, runSelection } from "./main.ts";
import { selectImpact } from "./select.ts";

const loadSelection = () => {
  const cwd = process.cwd();
  const manifest = harnessManifestSchema.parse(
    JSON.parse(readFileSync(path.join(cwd, "proofline.harness.json"), "utf8")),
  );
  const discovery = discoverCandidates(cwd, manifest);
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

test("real_manifest_discovers_and_selects_exact_vitest_and_playwright_identities", () => {
  loadSelection();
}, 120_000);

test("real_manifest_executes_its_selected_vitest_and_playwright_identities", () => {
  const { cwd, discovery, selection } = loadSelection();
  // Focused execution enters each selected adapter directly. The production impact command
  // separately executes declared build dependencies before the exact browser identity.
  runSelection(
    cwd,
    selection.identities,
    discovery.plans.map((plan) => ({ ...plan, dependencies: [] })),
  );
}, 120_000);
