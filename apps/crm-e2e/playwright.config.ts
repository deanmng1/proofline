import { randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

process.env.PROOFLINE_SCENARIO_RUN_ID ??= randomUUID();

const projects = [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }];
if (process.env.PROOFLINE_CROSS_BROWSER === "1")
  projects.push(
    {
      name: "firefox",
      grep: /@proofline-smoke/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      grep: /@proofline-smoke/,
      use: { ...devices["Desktop Safari"] },
    },
  );

export default defineConfig({
  testDir: "./src",
  globalSetup: "./src/fixtures/scenario-global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  workers: process.env.CI ? 2 : undefined,
  projects,
});
