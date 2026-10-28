import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { readChangedFiles } from "./changed-files.ts";
import { normalizeRepoPath } from "./coverage-policy.ts";
import { parsePlaywrightIdentities } from "./playwright-discovery.ts";
import { playwrightCommand, selectImpact, selectRuleTests, vitestCommand } from "./select.ts";
import type { DiscoveredTests, FeatureMap, VitestIdentity } from "./types.ts";
import { renderRules, rulesSchema, validateRules } from "./validate.ts";

const walkFiles = (cwd: string, directory: string): string[] => {
  if (!existsSync(path.join(cwd, directory))) return [];
  return readdirSync(path.join(cwd, directory), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "dist") return [];
    const relative = path.posix.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(cwd, relative) : entry.isFile() ? [relative] : [];
  });
};

const capture = (cwd: string, args: string[]) => {
  const result = spawnSync("pnpm", args, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0)
    throw new Error(`Discovery failed: pnpm ${args.join(" ")}\n${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout);
};

export const discoverCandidates = (cwd: string) => {
  const files = ["apps/crm-web/src", "apps/crm-e2e/src", "packages", "tools/impact/src"]
    .flatMap((root) => walkFiles(cwd, root))
    .sort();
  const sourceFiles = Object.fromEntries(
    files
      .filter((file) => /\.[jt]sx?$/.test(file))
      .map((file) => [file, readFileSync(path.join(cwd, file), "utf8")]),
  );
  const discoverySchema = z
    .array(
      z.object({
        name: z.string().min(1),
        file: z.string().min(1),
        location: z.object({ line: z.number().int().positive() }),
      }),
    )
    .min(1);
  const vitest: VitestIdentity[] = [
    ["exec", "vitest", "list", "packages", "tools/impact/src", "--json", "--includeTaskLocation"],
    [
      "exec",
      "vitest",
      "list",
      "--config",
      "apps/crm-web/vite.config.ts",
      "--json",
      "--includeTaskLocation",
    ],
  ].flatMap((args) =>
    discoverySchema.parse(capture(cwd, args)).map((test) => ({
      file: normalizeRepoPath(test.file, cwd),
      title: test.name,
      line: test.location.line,
    })),
  );
  const playwright = parsePlaywrightIdentities(
    capture(cwd, [
      "exec",
      "playwright",
      "test",
      "--config",
      "apps/crm-e2e/playwright.config.ts",
      "--project=chromium",
      "--list",
      "--reporter=json",
    ]),
  );
  for (const test of playwright) test.path = normalizeRepoPath(test.path, cwd);
  for (const file of files.filter((file) => /\.test\.[jt]sx?$/.test(file))) {
    if (!vitest.some((test) => test.file === file))
      throw new Error(`Undiscovered Vitest file ${file}`);
  }
  for (const file of files.filter(
    (file) => file.startsWith("apps/crm-e2e/") && /\.spec\.[jt]sx?$/.test(file),
  )) {
    if (!playwright.some((test) => test.path === file))
      throw new Error(`Undiscovered Playwright file ${file}`);
  }
  for (const test of vitest) {
    if (
      vitest.filter(
        (other) =>
          other.file === test.file &&
          other.title.replaceAll(" > ", " ") === test.title.replaceAll(" > ", " "),
      ).length !== 1
    )
      throw new Error(`Ambiguous Vitest identity ${test.title}`);
  }
  for (const test of playwright) {
    if (
      playwright.filter((other) => other.path === test.path && other.line === test.line).length !==
      1
    )
      throw new Error(`Ambiguous Playwright identity ${test.path}:${test.line}`);
  }
  return {
    identities: { vitest, playwright },
    candidates: { vitest: [...new Set(vitest.map((test) => test.file))], playwright },
    sourceFiles,
  };
};

const execute = (cwd: string, args: string[]) => {
  const result = spawnSync("pnpm", args, { cwd, stdio: "inherit" });
  if (result.status !== 0)
    throw new Error(`Command failed (${result.status}): pnpm ${args.join(" ")}`);
};

export const runSelection = (cwd: string, selection: DiscoveredTests) => {
  for (const file of new Set(selection.vitest.map((test) => test.file))) {
    const tests = selection.vitest.filter((test) => test.file === file);
    const command = vitestCommand(tests[0]);
    command[command.length - 1] = tests
      .map((test) => `(?:${vitestCommand(test).at(-1)})`)
      .join("|");
    execute(cwd, command);
  }
  if (selection.playwright.length) {
    execute(cwd, ["nx", "run", "crm-web:build"]);
    execute(cwd, playwrightCommand(selection.playwright));
  }
};

const perform = (cwd: string, args: string[]) => {
  const registry = rulesSchema.parse(
    JSON.parse(readFileSync(path.join(cwd, "test-impact/rules.json"), "utf8")),
  );
  if (args.includes("--generate-rules")) {
    writeFileSync(path.join(cwd, "test-impact/rules.md"), renderRules(registry));
    return;
  }
  const manifest = readChangedFiles({ cwd });
  const { candidates, identities, sourceFiles } = discoverCandidates(cwd);
  const validation = validateRules(
    registry,
    identities,
    readFileSync(path.join(cwd, "test-impact/rules.md"), "utf8"),
  );
  if (validation.errors.length) throw new Error(validation.errors.join("\n"));
  const featureMap = JSON.parse(
    readFileSync(path.join(cwd, "test-impact/features.json"), "utf8"),
  ) as FeatureMap;
  const selection = selectImpact({ manifest, featureMap, candidates, sourceFiles });
  if (selection.errors.length) throw new Error(selection.errors.join("\n"));
  const rules = selectRuleTests(
    manifest.files.flatMap((file) => [
      file.path,
      ...(file.previousPath ? [file.previousPath] : []),
    ]),
    registry,
    identities,
  );
  const exact = {
    vitest: identities.vitest.filter(
      (test) => selection.vitestFiles.includes(test.file) || rules.vitest.includes(test),
    ),
    playwright: identities.playwright.filter(
      (test) => selection.playwrightIdentities.includes(test) || rules.playwright.includes(test),
    ),
  };
  const artifactDirectory = path.join(cwd, "artifacts/impact");
  mkdirSync(artifactDirectory, { recursive: true });
  writeFileSync(
    path.join(artifactDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const artifact = { ...selection, identities: exact, ruleReasons: rules.reasons };
  writeFileSync(
    path.join(artifactDirectory, "selection.json"),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  writeFileSync(
    path.join(artifactDirectory, "discovery.json"),
    `${JSON.stringify(identities, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({ fallback: selection.fallback, vitest: exact.vitest.length, playwright: exact.playwright.length, artifacts: "artifacts/impact" }, null, 2)}\n`,
  );
  if (!args.includes("--dry-run")) runSelection(cwd, exact);
};
export const main = (cwd = process.cwd(), args = process.argv.slice(2)) => {
  try {
    perform(cwd, args);
  } catch (error) {
    const directory = path.join(cwd, "artifacts/impact");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, "selection.json"),
      `${JSON.stringify({ fallback: "all-tests", executionBlocked: true, errors: [String(error)], reason: "Uncertain evidence requires full safety gates and correction before selected execution." }, null, 2)}\n`,
    );
    writeFileSync(
      path.join(directory, "manifest.json"),
      `${JSON.stringify(readChangedFiles({ cwd }), null, 2)}\n`,
    );
    throw error;
  }
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
