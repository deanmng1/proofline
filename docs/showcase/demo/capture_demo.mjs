import { spawnSync } from "node:child_process";
import { closeSync, copyFileSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const assets = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(assets, "../../..");
const temporary = path.join(root, "output/demo-capture");
mkdirSync(temporary, { recursive: true });
copyFileSync(
  path.join(assets, "capture-workflow.ts.txt"),
  path.join(temporary, "capture-workflow.spec.ts"),
);
writeFileSync(
  path.join(temporary, "playwright.config.ts"),
  `import { defineConfig } from "@playwright/test";
import original from "../../apps/crm-e2e/playwright.config";
export default defineConfig({
  ...original,
  testDir: ".",
  globalSetup: "../../apps/crm-e2e/src/fixtures/scenario-global-setup.ts",
  testMatch: "capture-workflow.spec.ts",
  outputDir: "./test-results",
  reporter: [["list"]],
  workers: 1,
  retries: 0,
  projects: [{ name: "chromium", use: { browserName: "chromium", launchOptions: { slowMo: 90 } } }],
});
`,
);
const log = openSync(path.join(assets, "capture.log"), "w");
const run = (command, args) => {
  writeFileSync(log, `$ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: ["ignore", log, log],
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Capture command failed with status ${result.status}; see docs/showcase/demo/capture.log.`,
    );
};
try {
  run("pnpm", ["build:test"]);
  run(process.execPath, [
    "tools/proofline/canonical-runner.mjs",
    "playwright",
    "test",
    "--config",
    "output/demo-capture/playwright.config.ts",
  ]);
  console.log("Guarded demo capture passed. Assets: docs/showcase/demo/");
} finally {
  closeSync(log);
}
