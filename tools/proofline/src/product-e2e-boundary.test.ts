import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { validateHarness } from "../../impact/src/harness-manifest.ts";

describe("Proofline product E2E boundary", () => {
  test("canonical_wrapper_descendant_retains_egress_guard", async () => {
    const origin = process.env.PROOFLINE_PROBE_ORIGIN;
    if (!origin) return;
    await fetch(`${origin}/vitest`);
  });

  test("product_e2e_specs_delegate_transport_and_storage_to_fixtures", async () => {
    const sourceRoot = path.resolve("apps/crm-e2e/src");
    const files = (await readdir(sourceRoot, { recursive: true }))
      .filter(
        (file) =>
          /\.tsx?$/.test(file) &&
          !file.startsWith(`fixtures${path.sep}`) &&
          !file.startsWith("fixtures/") &&
          !file.endsWith(".d.ts"),
      )
      .sort();
    const violations: string[] = [];
    for (const file of files) {
      const contents = await readFile(path.join(sourceRoot, file), "utf8");
      violations.push(...findProductE2EViolations(file, contents));
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  test.each([
    ["features/direct-customer-to-quotes.spec.ts", 'await page.goto("/app/crm/quotes");'],
    ["proofline/direct-quotes-to-policy.spec.ts", "await page.goto(policyPath);"],
  ])("rejects_forbidden_crm_screen_to_screen_goto in %s", (file, contents) => {
    expect(findProductE2EViolations(file, contents)).toEqual([
      `${file}:1 forbidden CRM screen navigation`,
    ]);
  });

  test("allows_declared_initial_and_guard_navigation_helpers", () => {
    expect(
      findProductE2EViolations(
        "helpers.ts",
        `export async function openInitialPath(page, path) {
  // proofline-navigation: initial
  await page.goto(path);
}
export async function revisitProtectedPath(page, path) {
  // proofline-navigation: guard
  await page.goto(path);
}`,
      ),
    ).toEqual([]);
    expect(
      findProductE2EViolations(
        "proofline/workflow.spec.ts",
        `await openInitialPath(page, "/app/crm/customers");
await revisitProtectedPath(page, policyPath);`,
      ),
    ).toEqual([]);
  });

  test("rejects_undeclared_navigation_even_inside_the_shared_helper_module", () => {
    expect(
      findProductE2EViolations(
        "helpers.ts",
        `export async function jumpBetweenScreens(page, path) {
  await page.goto(path);
}`,
      ),
    ).toEqual(["helpers.ts:2 forbidden CRM screen navigation"]);
  });

  test("canonical_test_commands_cannot_bypass_the_declared_runner_egress_adapter", async () => {
    const manifest = JSON.parse(await readFile("proofline.harness.json", "utf8"));
    expect(manifest.adapters.runnerEgress).toBe("tools/proofline/canonical-runner.mjs");
    expect(validateHarness({ cwd: process.cwd(), manifest }).errors).toEqual([]);
    manifest.commands.browser = {
      argv: ["pnpm", "exec", "playwright", "test"],
      cwd: ".",
    };
    expect(validateHarness({ cwd: process.cwd(), manifest }).commandErrors).toContain(
      "Test command browser bypasses the runner egress adapter",
    );
  });

  test("canonical_runner_child_authority_is_structured_and_forces_guard_policy_on_every_child", async () => {
    const runner = await readFile("tools/proofline/canonical-runner.mjs", "utf8");
    const guard = await readFile("tools/proofline/egress-guard.mjs", "utf8");
    const policy = await readFile("tools/proofline/guard-policy.mjs", "utf8");
    expect(runner).toContain("allowedChildCapabilities");
    expect(runner).not.toContain("allowedChildExecutables");
    for (const purpose of [
      "git-local",
      "pnpm-runner",
      "nx-build",
      "vitest-cli",
      "playwright-cli",
      "playwright-browser",
      "playwright-ffmpeg",
      "esbuild-service",
    ])
      expect(`${runner}\n${policy}`).toContain(`"${purpose}"`);
    expect(
      guard.match(
        /nativeChildInvocation\(capability, (?:args \?\? \[\]|args), options, delegated\)/g,
      ),
    ).toHaveLength(3);
    expect(guard).toContain("const env = forcedChildEnvironment(options.env, delegated)");
    expect(guard).toContain("pnpm is limited to reviewed Vitest, Playwright, and CRM build argv");
    expect(policy).toContain("must contain only executable and purpose");
  });

  test("scenario_fixture_declares_context_install_cleanup_and_retry_lifecycle", async () => {
    const source = await readFile("apps/crm-e2e/src/fixtures/scenario.ts", "utf8");
    expect(source).toContain('let lifecycle: "active" | "cleaning" | "cleanup-failed" | "closed"');
    expect(source).toContain("context = await options.browser.newContext");
    expect(source).toContain("await install(record)");
    expect(source).toContain('lifecycle = "cleanup-failed"');
    expect(source).toContain('lifecycle = "closed"');
  });

  test("scenario_fixture_declares_every_reviewed_browser_egress_plane", async () => {
    const source = await readFile("apps/crm-e2e/src/fixtures/scenario.ts", "utf8");
    expect(source).toContain('plane: "page" | "worker" | "service-worker" | "websocket"');
    expect(source).toContain('await context.route("**/*", httpHandler)');
    expect(source).toContain('await context.routeWebSocket("**/*"');
    expect(source).toContain('serviceWorkers: "block"');
  });

  test("scenario_commands_preserve_multi_worker_and_both_shard_isolation_gates", async () => {
    const manifest = JSON.parse(await readFile("proofline.harness.json", "utf8"));
    expect(manifest.commands.browserScenario.argv).toContain("--workers=2");
    expect(manifest.commands.browserScenarioShard1.argv).toContain("--shard=1/2");
    expect(manifest.commands.browserScenarioShard2.argv).toContain("--shard=2/2");
    for (const key of ["browserScenario", "browserScenarioShard1", "browserScenarioShard2"])
      expect(manifest.commands[key].argv.slice(0, 3)).toEqual([
        "node",
        "tools/proofline/canonical-runner.mjs",
        "playwright",
      ]);
  });
});

const forbidden = [
  { name: "raw BrowserContext", pattern: /\bbrowser\s*\.\s*newContext\s*\(/g },
  { name: "test-owned routing", pattern: /\.\s*(?:route|routeWebSocket)\s*\(/g },
  {
    name: "browser storage mutation",
    pattern: /\b(?:localStorage|sessionStorage)\s*\.\s*(?:setItem|removeItem|clear)\s*\(/g,
  },
];

const declaredNavigationHelpers = new Map([
  ["proofline-navigation: initial", "openInitialPath"],
  ["proofline-navigation: guard", "revisitProtectedPath"],
]);

function isDeclaredNavigation(file: string, contents: string, matchIndex: number): boolean {
  if (file !== "helpers.ts") return false;
  const prefix = contents.slice(0, matchIndex);
  const lines = prefix.split("\n");
  const annotation = lines
    .at(-2)
    ?.trim()
    .replace(/^\/\/\s*/, "");
  if (!annotation) return false;
  const expectedHelper = declaredNavigationHelpers.get(annotation);
  if (!expectedHelper) return false;
  const declarations = [...prefix.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)];
  return declarations.at(-1)?.[1] === expectedHelper;
}

function findProductE2EViolations(file: string, contents: string): string[] {
  const violations: string[] = [];
  for (const rule of forbidden)
    for (const match of contents.matchAll(rule.pattern)) {
      const line = contents.slice(0, match.index).split("\n").length;
      violations.push(`${file}:${line} ${rule.name}`);
    }
  for (const match of contents.matchAll(/\.\s*goto\s*\(/g)) {
    if (isDeclaredNavigation(file, contents, match.index)) continue;
    const line = contents.slice(0, match.index).split("\n").length;
    violations.push(`${file}:${line} forbidden CRM screen navigation`);
  }
  return violations;
}
