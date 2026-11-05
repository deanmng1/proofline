import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCLI } from "vitest/node";
import {
  allocateInvocation,
  assertControlledOutputs,
  finishInvocation,
  readJson,
} from "./execution-artifacts.mjs";
import {
  parseDiscovery,
  reconcileExecution,
  requiredBindings,
  verifyAggregate,
} from "./execution-verification.mjs";
import {
  parseAllowedChildCapabilitiesEnvironment,
  parseAllowedOriginsEnvironment,
} from "./guard-policy.mjs";
import { withProoflineGuard } from "./run-guarded.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const deniedRunnerOrigin = "http://127.0.0.1:1";
const vitestCli = path.join(repositoryRoot, "node_modules/vitest/vitest.mjs");
const vitestExecutionCli = path.join(repositoryRoot, "tools/proofline/vitest-execution.mjs");
const playwrightCli = path.join(repositoryRoot, "node_modules/@playwright/test/cli.js");
const harness = JSON.parse(
  readFileSync(path.join(repositoryRoot, "proofline.harness.json"), "utf8"),
);

const executableOnPath = (name) => {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(directory, name);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Canonical runner cannot resolve required executable: ${name}`);
};

const runVisible = (command, cwd = repositoryRoot) => {
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
};

const runManifestCommands = (keys) => {
  for (const key of keys) {
    const command = harness.commands?.[key];
    if (
      !command ||
      !Array.isArray(command.argv) ||
      command.argv.length === 0 ||
      typeof command.cwd !== "string"
    )
      throw new Error(`Canonical runner requires manifest command ${key}.`);
    const cwd = realpathSync(path.resolve(repositoryRoot, command.cwd));
    const relative = path.relative(repositoryRoot, cwd);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error(`Canonical runner manifest command ${key} escapes the repository.`);
    const code = runVisible(command.argv, cwd);
    if (code !== 0) return code;
  }
  return 0;
};

const containedDirectory = (value) => {
  if (typeof value !== "string") throw new Error("Missing execution cwd");
  const directory = realpathSync(path.resolve(repositoryRoot, value));
  const relative = path.relative(repositoryRoot, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("Execution cwd escapes repository");
  return directory;
};
export const validateExecutionMetadata = (manifest = harness, root = repositoryRoot) => {
  const execution = manifest.execution;
  if (
    !execution ||
    !Array.isArray(execution.unitTargets) ||
    !execution.unitTargets.length ||
    !Array.isArray(execution.unitBuildCommands) ||
    !Array.isArray(execution.browserBuildCommands) ||
    !Array.isArray(execution.browserArgs) ||
    execution.browserArgs[0] !== "test" ||
    !execution.browserArgs.some((arg) => arg === "--config" || arg.startsWith("--config="))
  )
    throw new Error("Canonical execution requires explicit manifest execution metadata");
  for (const target of execution.unitTargets) {
    if (
      !Array.isArray(target.argv) ||
      target.argv[0] !== "run" ||
      target.argv.some((arg) => typeof arg !== "string")
    )
      throw new Error("Unsupported canonical Vitest target");
    const targetDirectory = realpathSync(path.resolve(root, target.cwd));
    const relativeCwd = path.relative(root, targetDirectory);
    if (
      typeof target.cwd !== "string" ||
      relativeCwd.startsWith("..") ||
      path.isAbsolute(relativeCwd)
    )
      throw new Error("Execution cwd escapes repository");
    assertControlledOutputs(target.argv, {
      cwd: targetDirectory,
      protectedRoot: path.join(root, "artifacts/proofline"),
    });
  }
  assertControlledOutputs(execution.browserArgs, {
    cwd: root,
    protectedRoot: path.join(root, "artifacts/proofline"),
  });
  for (const key of [...execution.unitBuildCommands, ...execution.browserBuildCommands]) {
    const command = manifest.commands?.[key];
    if (
      typeof key !== "string" ||
      !Array.isArray(command?.argv) ||
      !command.argv.length ||
      command.argv.some((arg) => typeof arg !== "string" || !arg) ||
      typeof command.cwd !== "string"
    )
      throw new Error(`Unknown or invalid execution build command: ${key}`);
    const relativeCwd = path.relative(root, realpathSync(path.resolve(root, command.cwd)));
    if (relativeCwd.startsWith("..") || path.isAbsolute(relativeCwd))
      throw new Error("Build cwd escapes repository");
  }
  for (const [args, cwd] of [
    ...execution.unitTargets.map((target) => [target.argv, target.cwd]),
    [execution.browserArgs, "."],
  ]) {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (typeof arg !== "string" || !arg) throw new Error("Invalid runner argv");
      const value = /^(?:--config|--root)=/.test(arg)
        ? arg.slice(arg.indexOf("=") + 1)
        : ["--config", "--root", "-c", "-r"].includes(arg)
          ? args[++i]
          : undefined;
      if (value !== undefined) {
        const relativePath = path.relative(root, realpathSync(path.resolve(root, cwd, value)));
        if (
          path.isAbsolute(value) ||
          relativePath.startsWith("..") ||
          path.isAbsolute(relativePath)
        )
          throw new Error("Execution config/root escapes repository");
      }
    }
  }
  return execution;
};

export const playwrightChildren = (installedRegistry) => {
  // Resolve through the test runner's own dependency graph: an independent target need not
  // declare playwright-core directly. Its package-pinned registry owns revisions and platform
  // layouts, including PLAYWRIGHT_BROWSERS_PATH=0; never scan a cache for executable lookalikes.
  let registry = installedRegistry;
  if (registry === undefined) {
    try {
      const testRequire = createRequire(import.meta.resolve("@playwright/test"));
      const playwrightRequire = createRequire(testRequire.resolve("playwright/package.json"));
      registry = playwrightRequire("playwright-core/lib/coreBundle").registry.registry;
    } catch (cause) {
      throw new Error(
        "Proofline cannot load the installed Playwright executable registry. Use the verified Playwright version or review its registry API before upgrading.",
        { cause },
      );
    }
  }
  if (typeof registry?.findExecutable !== "function")
    throw new Error("Proofline requires the installed Playwright executable registry API.");
  const capabilities = [];
  for (const name of ["chromium", "chromium-headless-shell", "firefox", "webkit", "ffmpeg"]) {
    const entry = registry.findExecutable(name);
    if (typeof entry?.directory !== "string" || typeof entry?.executablePath !== "function")
      throw new Error(`Proofline requires Playwright registry metadata for ${name}.`);
    const executable = entry.executablePath();
    // Unsupported platforms have no executable path. Uninstalled optional browsers do not
    // acquire authority; attempting to launch any missing binary still fails normally.
    if (executable === undefined || executable === "") continue;
    if (
      typeof executable !== "string" ||
      !path.isAbsolute(executable) ||
      !path.isAbsolute(entry.directory)
    )
      throw new Error(`Proofline requires absolute Playwright registry paths for ${name}.`);
    if (!existsSync(executable)) continue;
    const resolved = realpathSync(executable);
    const directory = realpathSync(entry.directory);
    const installation = path.relative(realpathSync(path.dirname(entry.directory)), directory);
    if (
      installation === ".." ||
      installation.startsWith(`..${path.sep}`) ||
      path.isAbsolute(installation)
    )
      throw new Error(`Proofline Playwright ${name} installation resolves outside its cache.`);
    const relative = path.relative(directory, resolved);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new Error(`Proofline Playwright ${name} executable resolves outside its installation.`);
    if (!statSync(resolved).isFile())
      throw new Error(`Proofline Playwright ${name} executable must resolve to a regular file.`);
    capabilities.push({
      executable: resolved,
      purpose: name === "ffmpeg" ? "playwright-ffmpeg" : "playwright-browser",
    });
  }
  return capabilities;
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

const guarded = async (runner, args, options = {}) => {
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
    ...(existsSync(path.join(repositoryRoot, "node_modules/.bin/nx"))
      ? [
          {
            executable: path.join(repositoryRoot, "node_modules/.bin/nx"),
            purpose: "nx-build",
          },
        ]
      : []),
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
      ? [process.execPath, options.execution ? vitestExecutionCli : vitestCli, ...args]
      : [process.execPath, playwrightCli, ...args];
  const result = await withProoflineGuard(command, {
    cwd: options.cwd ?? repositoryRoot,
    allowedOrigins,
    env: {
      ...options.env,
      ...(inheritedGuard
        ? {}
        : {
            PROOFLINE_EGRESS_TEST_ORIGIN: egressOrigin,
            PROOFLINE_EGRESS_IPV6_TEST_ORIGIN: egressIpv6Origin,
            PROOFLINE_PRODUCTION_TEST_ORIGIN_ONE: productionOriginOne,
            PROOFLINE_PRODUCTION_TEST_ORIGIN_TWO: productionOriginTwo,
          }),
    },
    allowedChildCapabilities,
    onStdout: options.quiet ? undefined : (chunk) => process.stdout.write(chunk),
    onStderr: options.quiet ? undefined : (chunk) => process.stderr.write(chunk),
  });
  return result;
};

const option = (args, name) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  return inline
    ? inline.slice(name.length + 1)
    : args.includes(name)
      ? args[args.indexOf(name) + 1]
      : null;
};
export const executionScope = (runner, args) => {
  if (runner === "vitest") {
    const { filter, options } = parseCLI(["vitest", "run", ...args]);
    const shardTotal = options.shard ? Number(String(options.shard).split("/")[1]) : 1;
    return filter.length ||
      options.testNamePattern ||
      options.project?.length ||
      options.exclude?.length ||
      options.changed ||
      options.related?.length ||
      options.config ||
      options.root ||
      shardTotal > 1
      ? "subset"
      : "full";
  }
  const valueOptions = new Set([
    "--workers",
    "-j",
    "--retries",
    "--timeout",
    "--global-timeout",
    "--max-failures",
    "--repeat-each",
    "--trace",
    "--update-source-method",
  ]);
  const flags = new Set([
    "--debug",
    "--headed",
    "--forbid-only",
    "--fail-on-flaky-tests",
    "--fully-parallel",
    "--no-deps",
    "--pass-with-no-tests",
    "--update-snapshots",
    "-u",
    "-x",
    "--quiet",
  ]);
  const filters = new Set([
    "--grep",
    "-g",
    "--grep-invert",
    "--project",
    "--test-list",
    "--test-list-invert",
    "--last-failed",
    "--only-changed",
    "--config",
    "-c",
  ]);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const name = arg.split("=")[0];
    if (filters.has(name)) return "subset";
    if (name === "--shard") {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : args[++index];
      if (!/^\d+\/\d+$/.test(value ?? "")) throw new Error("Invalid shard applicability");
      if (Number(value.split("/")[1]) > 1) return "subset";
    } else if (valueOptions.has(name)) {
      if (!arg.includes("=")) {
        if (!args[index + 1] || args[index + 1].startsWith("-"))
          throw new Error(`Missing option value: ${name}`);
        index++;
      }
    } else if (flags.has(name)) continue;
    else if (!arg.startsWith("-")) return "subset";
    else throw new Error(`Unsupported canonical browser option: ${arg}`);
  }
  return "full";
};

const sourceCommit = () => {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" });
  if (result.status !== 0 || !/^[a-f0-9]{40}$/.test(result.stdout.trim()))
    throw new Error("Execution evidence requires source commit");
  return result.stdout.trim();
};
const context = (gateKey, scope) => ({
  sourceCommit: sourceCommit(),
  repositoryRoot,
  sessionId: process.env.PROOFLINE_SESSION_ID ?? randomUUID(),
  ciRunId: process.env.PROOFLINE_CI_RUN_ID ?? process.env.GITHUB_RUN_ID ?? null,
  ciRunAttempt: process.env.PROOFLINE_CI_RUN_ATTEMPT ?? process.env.GITHUB_RUN_ATTEMPT ?? null,
  repository: process.env.GITHUB_REPOSITORY ?? null,
  workflow: process.env.GITHUB_WORKFLOW_REF ?? null,
  gateKey: process.env.PROOFLINE_PARENT_INVOCATION_ID
    ? `${process.env.PROOFLINE_GATE_KEY ?? gateKey}:nested`
    : (process.env.PROOFLINE_GATE_KEY ?? gateKey),
  gateExecutionId: process.env.PROOFLINE_PARENT_INVOCATION_ID
    ? randomUUID()
    : (process.env.PROOFLINE_GATE_EXECUTION_ID ?? randomUUID()),
  scope,
});
const runExecution = async (
  runner,
  args,
  ctx,
  { cwd = repositoryRoot, requiredOnly = false, fullRequired = false, gateComplete = false } = {},
) => {
  const invocation = allocateInvocation(repositoryRoot);
  const nativePath = path.join(invocation.directory, "native-report.json");
  const eventPath = path.join(invocation.directory, "native-events.json");
  const artifacts = {
    nativeReport: `${invocation.relative}/native-report.json`,
    stdout: `${invocation.relative}/stdout.log`,
    stderr: `${invocation.relative}/stderr.log`,
    discovery: `${invocation.relative}/discovery.json`,
  };
  if (runner === "vitest") artifacts.nativeEvents = `${invocation.relative}/native-events.json`;
  const shardText = option(args, "--shard");
  const shard = shardText
    ? { current: Number(shardText.split("/")[0]), total: Number(shardText.split("/")[1]) }
    : null;
  const record = {
    version: 1,
    invocationId: invocation.invocationId,
    runner,
    ...ctx,
    argv: [],
    requestedArgs: args,
    cwd,
    exitCode: 1,
    outcome: "failed",
    expected: [],
    observed: [],
    errors: [],
    children: [],
    artifacts,
    metadata: { projects: [], workers: option(args, "--workers"), shard },
    gateComplete,
  };
  try {
    assertControlledOutputs(args, {
      cwd,
      protectedRoot: path.join(repositoryRoot, "artifacts/proofline"),
    });
    if (runner === "vitest" ? args[0] !== "run" : args[0] !== "test")
      throw new Error("Unsupported executing runner form");
    const discoveryArgs =
      runner === "vitest"
        ? ["list", ...args.slice(1), "--json", "--includeTaskLocation"]
        : [...args, "--list", "--reporter=json"];
    const discovery = await guarded(runner, discoveryArgs, { cwd, quiet: true });
    writeFileSync(path.join(invocation.directory, "discovery.stdout.log"), discovery.stdout);
    writeFileSync(path.join(invocation.directory, "discovery.stderr.log"), discovery.stderr);
    if (discovery.code !== 0)
      throw new Error(`Pre-execution discovery failed: ${discovery.stderr}`);
    const discoveredReport = JSON.parse(discovery.stdout);
    writeFileSync(
      path.join(invocation.directory, "discovery.json"),
      JSON.stringify(discoveredReport, null, 2),
    );
    const discovered = parseDiscovery(runner, discoveredReport, repositoryRoot);
    const bindings = requiredBindings(harness, runner);
    record.expected = requiredOnly
      ? discovered.filter((test) =>
          bindings.some((binding) => binding.file === test.file && binding.title === test.title),
        )
      : discovered;
    if (process.env.PROOFLINE_SELECTED_IDENTITY) {
      const selected = JSON.parse(process.env.PROOFLINE_SELECTED_IDENTITY);
      if (
        selected.runner !== runner ||
        discovered.length !== 1 ||
        discovered[0].file !== selected.file ||
        discovered[0].title !== selected.title
      )
        throw new Error("Selected identity does not match pre-execution applicability");
      record.expected = discovered;
      record.scope = "selected";
    }
    record.metadata.projects = [...new Set(discovered.map((test) => test.project))];
    if (runner === "playwright" && Number.isInteger(discoveredReport.config?.workers))
      record.metadata.workers = String(discoveredReport.config.workers);
    if (fullRequired)
      for (const binding of bindings)
        if (
          !record.expected.some(
            (test) => test.file === binding.file && test.title === binding.title,
          )
        )
          record.errors.push(
            `Required identity omitted before execution: ${binding.file}:${binding.title}`,
          );
    if (!discovered.length && !(runner === "vitest" && args.includes("--passWithNoTests")))
      throw new Error("Zero selected tests");
    const runnerArgs =
      runner === "vitest"
        ? [
            ...args,
            "--reporter=default",
            "--reporter=json",
            `--reporter=${path.join(repositoryRoot, "tools/proofline/vitest-native-reporter.mjs")}`,
            `--outputFile.json=${nativePath}`,
          ]
        : [
            ...args,
            "--reporter=list,json,html",
            `--output=${path.join(invocation.directory, "test-results")}`,
          ];
    record.argv = [
      process.execPath,
      runner === "vitest" ? vitestExecutionCli : playwrightCli,
      ...runnerArgs,
    ];
    const result = await guarded(runner, runnerArgs, {
      cwd,
      execution: true,
      env: {
        ...(runner === "vitest"
          ? { PROOFLINE_NATIVE_EVENTS: eventPath }
          : {
              PLAYWRIGHT_JSON_OUTPUT_FILE: nativePath,
              PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(invocation.directory, "html-report"),
              PLAYWRIGHT_HTML_OPEN: "never",
            }),
        PROOFLINE_INVOCATION_DIR: invocation.directory,
        PROOFLINE_PARENT_INVOCATION_ID: invocation.invocationId,
        PROOFLINE_SELECTED_IDENTITY: "",
      },
    });
    record.exitCode = result.code ?? 1;
    writeFileSync(path.join(invocation.directory, "stdout.log"), result.stdout);
    writeFileSync(path.join(invocation.directory, "stderr.log"), result.stderr);
    const resultVerification = reconcileExecution({
      runner,
      expected: record.expected,
      nativeReport: readJson(nativePath),
      nativeEvents: runner === "vitest" ? readJson(eventPath) : undefined,
      root: repositoryRoot,
      exitCode: record.exitCode,
      allowEmpty:
        runner === "vitest" && args.includes("--passWithNoTests") && !record.expected.length,
    });
    record.observed = resultVerification.observed;
    record.errors.push(...resultVerification.errors);
    record.outcome = record.errors.length ? "failed" : "passed";
  } catch (error) {
    record.errors.push(String(error));
  }
  for (const name of ["stdout.log", "stderr.log"])
    if (!existsSync(path.join(invocation.directory, name)))
      writeFileSync(path.join(invocation.directory, name), record.errors.join("\n"));
  if (record.outcome !== "passed")
    process.stderr.write(`Proofline execution verification failed: ${record.errors.join("; ")}\n`);
  return { record, reference: finishInvocation(invocation, record) };
};
export const main = async (args = process.argv.slice(2)) => {
  const [mode, ...rest] = args;
  if (mode === "vitest" || mode === "playwright") {
    if (rest[0] === "list" || rest.includes("--list")) return (await guarded(mode, rest)).code ?? 1;
    const ctx = context(
      mode,
      mode === "playwright" && !process.env.PROOFLINE_SELECTED_IDENTITY ? "subset" : "selected",
    );
    const result = await runExecution(mode, rest, ctx, { gateComplete: mode === "playwright" });
    return result.record.outcome === "passed" ? 0 : 1;
  }
  if (mode === "unit") {
    const execution = validateExecutionMetadata();
    const ctx = context("unit", executionScope("vitest", rest));
    const aggregate = allocateInvocation(repositoryRoot);
    const record = {
      version: 1,
      invocationId: aggregate.invocationId,
      runner: "aggregate",
      ...ctx,
      argv: [process.execPath, ...process.argv.slice(1)],
      cwd: repositoryRoot,
      exitCode: 1,
      outcome: "failed",
      expected: requiredBindings(harness, "vitest"),
      observed: [],
      errors: [],
      children: [],
      artifacts: {},
      metadata: { projects: [], workers: null, shard: null },
      gateComplete: true,
    };
    try {
      const build = runManifestCommands(execution.unitBuildCommands);
      if (build !== 0) throw new Error(`Canonical unit build failed: ${build}`);
      const children = [];
      for (const target of execution.unitTargets) {
        const child = await runExecution("vitest", [...target.argv, ...rest], ctx, {
          cwd: containedDirectory(target.cwd),
          requiredOnly: true,
        });
        children.push(child.record);
        record.children.push(child.reference);
      }
      if (ctx.scope === "subset") record.expected = children.flatMap((child) => child.expected);
      Object.assign(record, verifyAggregate({ expected: record.expected, children }));
      record.exitCode = record.outcome === "passed" ? 0 : 1;
    } catch (error) {
      record.errors.push(String(error));
    }
    finishInvocation(aggregate, record);
    return record.exitCode;
  }
  if (mode === "browser") {
    const execution = validateExecutionMetadata();
    const build = runManifestCommands(execution.browserBuildCommands);
    if (build !== 0) return build;
    const ctx = context("browser", executionScope("playwright", rest));
    const result = await runExecution("playwright", [...execution.browserArgs, ...rest], ctx, {
      requiredOnly: ctx.scope === "full",
      fullRequired: ctx.scope === "full",
      gateComplete: true,
    });
    return result.record.outcome === "passed" ? 0 : 1;
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
