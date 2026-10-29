import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { readChangedFiles } from "./changed-files.ts";
import { selectImpact } from "./select.ts";
import type { ChangeManifest, DiscoveredTests, HarnessManifest } from "./types.ts";

const source = "modules/orders/src/value.ts";
const unit = { file: "modules/orders/src/value.test.ts", title: "value", line: 2 };
const browser = {
  path: "checks/browser/value.spec.ts",
  title: "journey",
  line: 2,
  tags: ["@value"],
};
const discovered: DiscoveredTests = {
  vitest: [unit, { ...unit, title: "sibling", line: 3 }],
  playwright: [browser, { ...browser, title: "sibling", line: 3 }],
};
const manifest = (): HarnessManifest =>
  ({
    browser: {
      projects: ["chromium"],
      crossBrowserSmokeProjects: [],
      localOrigins: ["http://127.0.0.1"],
      testEntrypoint: "serve",
    },
    adapters: { auth: source, api: source, testModeEnvironment: source, providers: [] },
    coverage: [],
    ruleRegistry: "rules.json",
    lifecycleMatrix: null,
    goldenWorkflowMatrix: "golden.json",
    version: 1,
    commands: {
      unit: { argv: ["pnpm", "test"], cwd: "." },
      browser: { argv: ["pnpm", "test:e2e"], cwd: "." },
    },
    workspaces: [
      { path: "modules/orders", unitCommand: "unit", browserCommands: [] },
      { path: "checks/browser", unitCommand: null, browserCommands: ["browser"] },
    ],
    ownership: [
      {
        glob: source,
        entrypoints: [source],
        ruleIds: ["ORD-001"],
        layers: ["domain", "playwright"],
        ruleLayers: [
          { ruleId: "ORD-001", layer: "domain" },
          { ruleId: "ORD-001", layer: "playwright" },
        ],
        testBindings: [
          {
            ...unit,
            runner: "vitest",
            testId: "value-unit",
            ruleId: "ORD-001",
            layer: "domain",
            commandKey: "unit",
          },
          {
            file: browser.path,
            title: browser.title,
            line: browser.line,
            tag: "@value",
            runner: "playwright",
            testId: "value-browser",
            ruleId: "ORD-001",
            layer: "playwright",
            commandKey: "browser",
          },
        ],
      },
    ],
  }) as HarnessManifest;
const changes = (file = source): ChangeManifest => ({
  base: "base",
  head: "head",
  files: [{ path: file, status: "modified" }],
  uncertainty: [],
});
const choose = (overrides: Partial<Parameters<typeof selectImpact>[0]> = {}) =>
  selectImpact({
    manifest: manifest(),
    changes: changes(),
    discovered,
    sourceFiles: { [source]: "export const value = 1;", [unit.file]: "", [browser.path]: "" },
    ...overrides,
  });

describe("manifest-owned selection", () => {
  test("selects_declared_test_bindings_even_when_static_imports_are_absent", () => {
    const result = choose();
    expect(result.fallback).toBe("none");
    expect(result.identities).toEqual({ vitest: [unit], playwright: [browser] });
    expect(result.commandKeys).toEqual(["unit", "browser"]);
    expect(result.rationale[source]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownership: source,
          ruleId: "ORD-001",
          testId: "value-unit",
          identity: unit,
        }),
      ]),
    );
  });
  test("adds_static_import_evidence_without_treating_it_as_ownership", () => {
    const sourceFiles = {
      [source]: "export const value = 1;",
      [unit.file]: 'import "./value";',
      [browser.path]: "",
    };
    expect(choose({ sourceFiles }).rationale[source]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evidence: expect.arrayContaining(["static-import"]) }),
      ]),
    );
    const unowned = manifest();
    unowned.ownership = [];
    expect(choose({ manifest: unowned, sourceFiles }).fallback).toBe("canonical-full");
  });
  test("rejects_deleted_or_ambiguous_bindings", () => {
    for (const actual of [
      { vitest: [], playwright: [browser] },
      { vitest: [unit, unit], playwright: [browser] },
    ]) {
      const result = choose({ discovered: actual });
      expect(result.fallback).toBe("canonical-full");
      expect(result.commandKeys).toEqual(["unit", "browser"]);
      expect(result.errors.join(" ")).toMatch(/binding/);
    }
    const ambiguous = manifest();
    ambiguous.ownership.push(ambiguous.ownership[0]);
    expect(choose({ manifest: ambiguous }).fallback).toBe("canonical-full");
  });
  test("fails_closed_for_unresolvable_revisions_dynamic_dependencies_and_unmapped_workspaces", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "impact-revisions-"));
    try {
      for (const args of [
        ["init", "-q"],
        [
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=test@example.test",
          "commit",
          "--allow-empty",
          "-qm",
          "initial",
        ],
      ])
        execFileSync("git", args, { cwd });
      writeFileSync(path.join(cwd, "new.ts"), "export {};");
      for (const env of [
        { IMPACT_BASE: "HEAD", IMPACT_HEAD: "missing-head" },
        { IMPACT_BASE: "missing-base", IMPACT_HEAD: "HEAD" },
        { CI: "true", IMPACT_HEAD: "HEAD" },
        { CI: "1", IMPACT_HEAD: "HEAD" },
      ]) {
        const changed = readChangedFiles({ cwd, env });
        expect(changed.uncertainty.length).toBeGreaterThan(0);
        const result = choose({ changes: changed });
        expect(result.fallback).toBe("canonical-full");
        expect(result.commandKeys).toEqual(["unit", "browser"]);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
    for (const input of [
      { changes: changes("new/workspace/project.json") },
      { changes: changes("elsewhere/unregistered.ts") },
      { sourceFiles: { [source]: "export const load = (name) => import(name);" } },
      { sourceFiles: { [source]: 'export const load = () => import("./missing");' } },
      { changes: { ...changes(), files: [{ path: source, status: "deleted" as const }] } },
      { changes: { ...changes(), files: [{ path: source, status: "added" as const }] } },
    ]) {
      const result = choose(input);
      expect(result.fallback).toBe("canonical-full");
      expect(result.commandKeys).toEqual(["unit", "browser"]);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
  test("accepts_a_literal_dynamic_target_only_with_reviewed_entrypoint_bindings", () => {
    const owned = manifest();
    const target = "modules/orders/src/lazy.ts";
    owned.ownership.push({
      ...owned.ownership[0],
      glob: target,
      entrypoints: [target],
      testBindings: owned.ownership[0].testBindings.map((binding) => ({
        ...binding,
        testId: `${binding.testId}-lazy`,
        title: "sibling",
        line: 3,
      })),
    });
    const sourceFiles = {
      [source]: 'export const load = () => import("./lazy");',
      [target]: "export {};",
    };
    const selection = choose({ manifest: owned, sourceFiles });
    expect(selection.fallback).toBe("none");
    expect(selection.identities.vitest).toEqual(discovered.vitest);
    expect(selection.identities.playwright).toEqual(discovered.playwright);
    expect(choose({ sourceFiles }).fallback).toBe("canonical-full");
  });
});

test("retains_path_reasons_and_registered_workspace_fallback_commands", () => {
  const configured = manifest();
  configured.commands.additional = {
    argv: ["pnpm", "test:additional"],
    cwd: ".",
    runner: "vitest",
  };
  configured.workspaces.push({
    path: "additional",
    unitCommand: "additional",
    browserCommands: [],
    browserOptOutReason: "unit",
  });
  const result = choose({ manifest: configured, changes: changes("new/project.json") });
  expect(result.commandKeys).toEqual(["unit", "browser", "additional"]);
  expect(result.pathReasons["new/project.json"]).toContain("configuration:new/project.json");
});
test("requires_full_history_and_a_checked_out_discovery_head", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "impact-history-"));
  try {
    for (const args of [
      ["init", "-q"],
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=test@example.test",
        "commit",
        "--allow-empty",
        "-qm",
        "initial",
      ],
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=test@example.test",
        "commit",
        "--allow-empty",
        "-qm",
        "second",
      ],
    ])
      execFileSync("git", args, { cwd });
    expect(
      readChangedFiles({
        cwd,
        env: { IMPACT_BASE: "HEAD~1", IMPACT_HEAD: "HEAD~1" },
      }).uncertainty.join(" "),
    ).toMatch(/checkout/);
    expect(
      readChangedFiles({ cwd, env: { CI: "1", IMPACT_HEAD: "HEAD" } }).uncertainty.join(" "),
    ).toMatch(/missing CI base/);
    writeFileSync(
      path.join(cwd, ".git/shallow"),
      execFileSync("git", ["rev-parse", "HEAD"], { cwd }),
    );
    expect(
      readChangedFiles({ cwd, env: { IMPACT_BASE: "HEAD", IMPACT_HEAD: "HEAD" } }).uncertainty.join(
        " ",
      ),
    ).toMatch(/shallow/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("adds_importing_identities_beyond_the_declared_binding_and_covers_owned_assets", () => {
  const extra = { file: "modules/orders/src/other.test.ts", title: "extra", line: 1 };
  const result = choose({
    discovered: { ...discovered, vitest: [...discovered.vitest, extra] },
    sourceFiles: { [source]: "export {};", [extra.file]: 'import "./value";' },
  });
  expect(result.identities.vitest).toEqual([unit, extra]);
  expect(result.rationale[source]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ identity: extra, evidence: ["static-import"] }),
    ]),
  );
  const asset = manifest();
  asset.ownership[0].glob = "modules/orders/src/icon.svg";
  expect(
    choose({ manifest: asset, changes: changes("modules/orders/src/icon.svg") }).identities.vitest,
  ).toEqual([unit]);
  expect(choose({ changes: changes(unit.file) }).fallback).toBe("canonical-full");
});

test("deduplicates_runnable_identities_while_retaining_each_owner_and_binding", () => {
  const configured = manifest();
  const second = "modules/orders/src/another.ts";
  configured.ownership.push({
    ...configured.ownership[0],
    glob: second,
    entrypoints: [second],
    testBindings: configured.ownership[0].testBindings.map((binding) => ({
      ...binding,
      testId: `${binding.testId}-another`,
    })),
  });
  const result = choose({
    manifest: configured,
    changes: { ...changes(), files: [...changes().files, { path: second, status: "modified" }] },
  });
  expect(result.identities).toEqual({ vitest: [unit], playwright: [browser] });
  expect(result.rationale[source].map((row) => row.testId)).toEqual([
    "value-unit",
    "value-browser",
  ]);
  expect(result.rationale[second].map((row) => row.testId)).toEqual([
    "value-unit-another",
    "value-browser-another",
  ]);
});

test("fails_closed_when_vitest_file_filter_could_match_another_identity", () => {
  const result = choose({
    discovered: {
      ...discovered,
      vitest: [...discovered.vitest, { ...unit, file: `${unit.file}.backup.test.ts` }],
    },
  });
  expect(result.fallback).toBe("canonical-full");
});

test("rejects_filename_collisions_for_unbound_static_import_additions", () => {
  const extra = { file: "modules/orders/src/foo.test.ts", title: "extra", line: 2 };
  const result = choose({
    discovered: {
      ...discovered,
      vitest: [...discovered.vitest, extra, { ...extra, file: `${extra.file}.backup.test.ts` }],
    },
    sourceFiles: { [source]: "export {};", [extra.file]: 'import "./value";' },
  });
  expect(result.fallback).toBe("canonical-full");
  expect(result.identities.vitest).toEqual([]);
  expect(result.errors.join(" ")).toMatch(/ambiguous.*selected.*Vitest/i);
});

test("attributes_additive_identities_to_the_most_specific_workspace", () => {
  const configured = manifest();
  configured.commands.nested = {
    argv: ["pnpm", "test:nested"],
    cwd: "modules/orders/nested",
    runner: "vitest",
  };
  configured.workspaces.push({
    path: "modules/orders/nested",
    unitCommand: "nested",
    browserCommands: [],
    browserOptOutReason: "unit",
  });
  const extra = { file: "modules/orders/nested/foo.test.ts", title: "nested", line: 2 };
  const result = choose({
    manifest: configured,
    discovered: { ...discovered, vitest: [...discovered.vitest, extra] },
    sourceFiles: { [source]: "export {};", [extra.file]: 'import "../src/value";' },
  });
  expect(result.rationale[source].find((row) => row.identity.title === "nested")?.commandKey).toBe(
    "nested",
  );
});
