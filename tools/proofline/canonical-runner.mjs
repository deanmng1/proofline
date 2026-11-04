import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";
import {
  parseAllowedChildCapabilitiesEnvironment,
  parseAllowedOriginsEnvironment,
} from "./guard-policy.mjs";
import { withProoflineGuard } from "./run-guarded.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const deniedRunnerOrigin = "http://127.0.0.1:1";
const vitestCli = path.join(repositoryRoot, "node_modules/vitest/vitest.mjs");
const playwrightCli = path.join(repositoryRoot, "node_modules/@playwright/test/cli.js");
const executableOnPath = (name) => {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(directory, name);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Canonical runner cannot resolve required executable: ${name}`);
};

const runVisible = (command) => {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
};

const projectFiles = (directory = repositoryRoot) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name.startsWith(".") ||
      [
        "node_modules",
        "dist",
        "artifacts",
        "coverage",
        "test-results",
        "playwright-report",
      ].includes(entry.name)
    )
      return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return projectFiles(absolute);
    return entry.isFile() && entry.name === "project.json" ? [absolute] : [];
  });

const unitArguments = () =>
  projectFiles()
    .map((file) => JSON.parse(readFileSync(file, "utf8")).targets?.test?.command)
    .filter((command) => typeof command === "string")
    .map((command) => {
      const parts = command.trim().split(/\s+/);
      if (parts[0] !== "pnpm" || parts[1] !== "exec" || parts[2] !== "vitest" || parts[3] !== "run")
        throw new Error(`Unsupported canonical Vitest target: ${command}`);
      return parts.slice(3);
    });

const playwrightChildren = () => {
  const candidates = [chromium.executablePath(), firefox.executablePath(), webkit.executablePath()];
  const marker = `${path.sep}ms-playwright${path.sep}`;
  const browserPath = candidates.find((candidate) => candidate.includes(marker));
  const cacheRoot = browserPath
    ? `${browserPath.slice(0, browserPath.indexOf(marker))}${path.sep}ms-playwright`
    : "";
  const chromiumRevision = browserPath?.match(/chromium-(\d+)/)?.[1];
  // Video recording is a declared scenario capability. The package pins the revision; only exact
  // installed browser/ffmpeg files are admitted at this native child boundary.
  if (existsSync(cacheRoot))
    for (const entry of readdirSync(cacheRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith("ffmpeg-")) {
        for (const child of readdirSync(path.join(cacheRoot, entry.name))) {
          const executable = path.join(cacheRoot, entry.name, child);
          if (child.startsWith("ffmpeg") && statSync(executable).isFile())
            candidates.push(executable);
        }
      } else if (
        entry.isDirectory() &&
        chromiumRevision &&
        entry.name === `chromium_headless_shell-${chromiumRevision}`
      ) {
        const walk = (directory) => {
          for (const child of readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, child.name);
            if (child.isDirectory()) walk(absolute);
            else if (
              child.isFile() &&
              ["chrome-headless-shell", "headless_shell", "headless_shell.exe"].includes(child.name)
            )
              candidates.push(absolute);
          }
        };
        walk(path.join(cacheRoot, entry.name));
      }
    }
  return [...new Set(candidates.filter(existsSync))].map((executable) => ({
    executable,
    purpose: path.basename(executable).startsWith("ffmpeg")
      ? "playwright-ffmpeg"
      : "playwright-browser",
  }));
};

const transformChildren = () => {
  const store = path.join(repositoryRoot, "node_modules/.pnpm");
  if (!existsSync(store)) return [];
  const files = [];
  const walk = (directory, depth) => {
    if (depth > 6) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute, depth + 1);
      else if (entry.isFile() && ["esbuild", "esbuild.exe"].includes(entry.name))
        files.push(absolute);
    }
  };
  for (const entry of readdirSync(store, { withFileTypes: true }))
    if (
      entry.isDirectory() &&
      (entry.name.startsWith("esbuild@") || entry.name.startsWith("@esbuild+"))
    )
      walk(path.join(store, entry.name), 0);
  return files.map((executable) => ({ executable, purpose: "esbuild-service" }));
};

const reserveLoopbackOrigin = (host) =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error(`Canonical runner could not reserve ${host}.`));
        return;
      }
      const origin = `http://${host.includes(":") ? `[${host}]` : host}:${address.port}`;
      server.close((error) => (error ? reject(error) : resolve(origin)));
    });
  });

const guarded = async (runner, args) => {
  const inheritedGuard = globalThis[Symbol.for("proofline.egress-guard.installed")] === true;
  const reservedOrigins = inheritedGuard
    ? []
    : await Promise.all([
        reserveLoopbackOrigin("127.0.0.1"),
        reserveLoopbackOrigin("::1"),
        reserveLoopbackOrigin("127.0.0.1"),
        reserveLoopbackOrigin("127.0.0.1"),
      ]);
  const [egressOrigin, egressIpv6Origin, productionOriginOne, productionOriginTwo] =
    reservedOrigins;
  const initialCapabilities = [
    { executable: executableOnPath("git"), purpose: "git-local" },
    { executable: executableOnPath("pnpm"), purpose: "pnpm-runner" },
    {
      executable: path.join(repositoryRoot, "node_modules/.bin/nx"),
      purpose: "nx-build",
    },
    {
      executable: path.join(repositoryRoot, "node_modules/.bin/playwright"),
      purpose: "playwright-cli",
    },
    {
      executable: path.join(repositoryRoot, "node_modules/.bin/vitest"),
      purpose: "vitest-cli",
    },
    ...transformChildren(),
    ...playwrightChildren(),
  ];
  const allowedOrigins = inheritedGuard
    ? parseAllowedOriginsEnvironment(process.env.PROOFLINE_ALLOWED_ORIGINS)
    : [
        deniedRunnerOrigin,
        "http://127.0.0.1",
        egressOrigin,
        egressIpv6Origin,
        productionOriginOne,
        productionOriginTwo,
      ];
  const allowedChildCapabilities = inheritedGuard
    ? parseAllowedChildCapabilitiesEnvironment(process.env.PROOFLINE_ALLOWED_CHILD_CAPABILITIES)
    : initialCapabilities;
  const command =
    runner === "vitest"
      ? [process.execPath, vitestCli, ...args]
      : [process.execPath, playwrightCli, ...args];
  const result = await withProoflineGuard(command, {
    cwd: repositoryRoot,
    allowedOrigins,
    env: inheritedGuard
      ? undefined
      : {
          PROOFLINE_EGRESS_TEST_ORIGIN: egressOrigin,
          PROOFLINE_EGRESS_IPV6_TEST_ORIGIN: egressIpv6Origin,
          PROOFLINE_PRODUCTION_TEST_ORIGIN_ONE: productionOriginOne,
          PROOFLINE_PRODUCTION_TEST_ORIGIN_TWO: productionOriginTwo,
        },
    allowedChildCapabilities,
    onStdout: (chunk) => process.stdout.write(chunk),
    onStderr: (chunk) => process.stderr.write(chunk),
  });
  return result.code ?? 1;
};

export const main = async (args = process.argv.slice(2)) => {
  const [mode, ...rest] = args;
  if (mode === "vitest") return guarded("vitest", rest);
  if (mode === "playwright") return guarded("playwright", rest);
  if (mode === "unit") {
    const build = runVisible(["pnpm", "build:test"]);
    if (build !== 0) return build;
    const failures = [];
    for (const target of unitArguments()) {
      const code = await guarded("vitest", [...target, ...rest]);
      if (code !== 0) failures.push(target.join(" "));
    }
    if (failures.length) throw new Error(`Canonical Vitest targets failed: ${failures.join(", ")}`);
    return 0;
  }
  if (mode === "browser") {
    const build = runVisible(["pnpm", "build:test"]);
    if (build !== 0) return build;
    return guarded("playwright", [
      "test",
      "--config",
      "apps/crm-e2e/playwright.config.ts",
      ...rest,
    ]);
  }
  throw new Error("Usage: canonical-runner.mjs <unit|browser|vitest|playwright> [runner args...]");
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
      process.exitCode = 1;
    },
  );
