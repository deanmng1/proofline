import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readChangedFiles } from "./changed-files.ts";
import { selectImpact } from "./select.ts";
import type { FeatureMap, PlaywrightCandidate, TestCandidates } from "./types.ts";

const sourceRoots = [
  "apps/crm-web/src",
  "apps/crm-e2e/src",
  "packages/domain/src",
  "packages/api-contracts/src",
  "packages/test-kit/src",
  "tools/impact/src",
];

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

const walkFiles = (cwd: string, directory: string): string[] => {
  const absoluteDirectory = path.join(cwd, directory);
  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(cwd, relative);
    }
    return entry.isFile() ? [relative] : [];
  });
};

const hasSourceExtension = (file: string) => sourceExtensions.has(path.extname(file));
const isVitest = (file: string) => file.endsWith(".test.ts") || file.endsWith(".test.tsx");
const isPlaywright = (file: string) => file.endsWith(".spec.ts") || file.endsWith(".spec.tsx");

export const discoverCandidates = (cwd: string) => {
  const files = sourceRoots.flatMap((root) => walkFiles(cwd, root)).sort();
  const sourceFiles = Object.fromEntries(
    files
      .filter(hasSourceExtension)
      .map((file) => [file, readFileSync(path.join(cwd, file), "utf8")]),
  );
  const candidates: TestCandidates = {
    vitest: files.filter(isVitest),
    playwright: files.filter(isPlaywright).map(
      (file): PlaywrightCandidate => ({
        path: file,
        tags: [...sourceFiles[file].matchAll(/(?<![\w-])@[a-z0-9-]+/gi)].map((match) => match[0]),
      }),
    ),
  };

  return { candidates, sourceFiles };
};

const loadFeatureMap = (cwd: string): FeatureMap => {
  const file = path.join(cwd, "test-impact/features.json");
  return JSON.parse(readFileSync(file, "utf8")) as FeatureMap;
};

const projectForVitest = (test: string) => {
  if (test.startsWith("apps/crm-web/")) return "crm-web";
  if (test.startsWith("packages/domain/")) return "domain";
  if (test.startsWith("packages/api-contracts/")) return "api-contracts";
  if (test.startsWith("packages/test-kit/")) return "test-kit";
  if (test.startsWith("tools/impact/")) return "impact-tools";
  return undefined;
};

const execute = (cwd: string, command: string, args: string[]) => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
};

const runSelection = (cwd: string, selection: ReturnType<typeof selectImpact>) => {
  const projects = [...new Set(selection.vitestFiles.map(projectForVitest).filter(Boolean))];
  if (projects.length > 0) {
    execute(cwd, "pnpm", ["nx", "run-many", "--target=test", `--projects=${projects.join(",")}`]);
  }
  if (selection.playwrightTests.length > 0) {
    execute(cwd, "pnpm", [
      "nx",
      "run",
      "crm-e2e:e2e",
      "--",
      "--project=chromium",
      ...selection.playwrightTests,
    ]);
  }
};

export const main = (cwd = process.cwd(), args = process.argv.slice(2)) => {
  const manifest = readChangedFiles({ cwd });
  const { candidates, sourceFiles } = discoverCandidates(cwd);
  const selection = selectImpact({
    manifest,
    featureMap: loadFeatureMap(cwd),
    candidates,
    sourceFiles,
  });
  const artifactDirectory = path.join(cwd, "artifacts/impact");
  mkdirSync(artifactDirectory, { recursive: true });
  writeFileSync(
    path.join(artifactDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(
    path.join(artifactDirectory, "selection.json"),
    `${JSON.stringify(selection, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify({ manifest, selection }, null, 2)}\n`);

  if (!args.includes("--dry-run")) {
    runSelection(cwd, selection);
  }
  if (selection.errors.length > 0) {
    process.exitCode = 1;
  }
};

if (process.argv[1] && statSync(process.argv[1]).isFile()) {
  main();
}
