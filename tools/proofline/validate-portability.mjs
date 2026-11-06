import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderCanonicalCommandTable } from "../impact/src/record-check.ts";
import { renderRules } from "../impact/src/validate.ts";
import { commitGitFixture } from "../impact/test-fixtures/git.ts";
import { selectReusableCorePaths } from "./core-inventory.mjs";
import {
  collectPortabilityNativeEvidence,
  requiredPortabilityEvidence,
  requiredPortabilityGates,
  validatePortabilityResult,
} from "./portability-result.mjs";

export {
  requiredPortabilityEvidence,
  requiredPortabilityGates,
  validatePortabilityResult,
} from "./portability-result.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const walk = (directory, prefix = "") =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory()
      ? walk(path.join(directory, entry.name), relative)
      : entry.isFile()
        ? [relative]
        : [];
  });

export const assertCopiedCore = (source, target, files) => {
  if (!Array.isArray(files) || files.length === 0)
    throw new Error("Reusable core inventory is empty");
  return Object.fromEntries(
    files.map((file) => {
      if (
        !existsSync(path.join(target, file)) ||
        digest(path.join(source, file)) !== digest(path.join(target, file))
      )
        throw new Error(`Copied reusable core changed or missing: ${file}`);
      return [file, digest(path.join(source, file))];
    }),
  );
};

export const prepareTarget = ({
  repositoryRoot = root,
  temporaryRoot = os.tmpdir(),
  dependencyMode = "reuse",
} = {}) => {
  if (!["reuse", "independent"].includes(dependencyMode))
    throw new Error(`Unknown dependency mode: ${dependencyMode}`);
  repositoryRoot = realpathSync(repositoryRoot);
  const parent = realpathSync(temporaryRoot);
  if (dependencyMode === "reuse" && !existsSync(path.join(repositoryRoot, "node_modules")))
    throw new Error("Source dependencies are missing; install them or use independent preparation");
  if (parent === repositoryRoot || parent.startsWith(`${repositoryRoot}${path.sep}`))
    throw new Error("Standalone target must be outside the source repository");
  const target = mkdtempSync(path.join(parent, "proofline-work-orders-"));
  const example = path.join(repositoryRoot, "examples/work-orders");
  cpSync(example, target, {
    recursive: true,
    filter: (source) =>
      !path
        .relative(example, source)
        .split(path.sep)
        .some((part) =>
          [
            "node_modules",
            ".git",
            "artifacts",
            "dist",
            "test-results",
            "playwright-report",
          ].includes(part),
        ),
  });
  const files = selectReusableCorePaths(
    ["tools/impact", "tools/proofline"].flatMap((directory) =>
      walk(path.join(repositoryRoot, directory)).map((file) => `${directory}/${file}`),
    ),
  );
  for (const file of files) {
    mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    cpSync(path.join(repositoryRoot, file), path.join(target, file));
  }
  if (dependencyMode === "reuse")
    symlinkSync(
      path.join(repositoryRoot, "node_modules"),
      path.join(target, "node_modules"),
      "dir",
    );
  const hashes = assertCopiedCore(repositoryRoot, target, files);
  for (const file of walk(target).filter(
    (file) => /\.(?:mjs|jsx|ts|json)$/.test(file) && !file.startsWith("tools/"),
  )) {
    if (
      /(?:@testbed\/|apps\/crm|packages\/(?:policy|finance)|\/app\/crm|\b(?:POL|FIN|INT)-\d{3}\b)/.test(
        readFileSync(path.join(target, file), "utf8"),
      )
    )
      throw new Error(`CRM product dependency in target ${file}`);
  }
  return { target, files, hashes, dependencyMode };
};

export const parsePortabilityOptions = (args) => {
  if (args[0] === "--") args = args.slice(1);
  if (args.length === 0) return { dependencyMode: "reuse", prepareOnly: false };
  if (args.length === 1 && args[0] === "--independent-install")
    return { dependencyMode: "independent", prepareOnly: false };
  if (
    args.length === 3 &&
    args[0] === "--prepare-only" &&
    args[1] === "--dependency-mode" &&
    ["reuse", "independent"].includes(args[2])
  )
    return { dependencyMode: args[2], prepareOnly: true };
  throw new Error(
    "Use no options (offline reuse), --independent-install, or --prepare-only --dependency-mode independent|reuse",
  );
};

const targetRecord = (eventId, summary, scope) =>
  JSON.stringify({
    schemaVersion: 1,
    eventId,
    recordedAt: new Date().toISOString(),
    phase: "verification",
    kind: "portability",
    status: "passed",
    summary,
    scope,
  });

export const initializeTarget = (target) => {
  if (
    existsSync(path.join(target, ".git")) ||
    existsSync(path.join(target, "test-impact/execution-record.jsonl"))
  )
    throw new Error(
      "Target is already initialized; preserve its Git and append-only evidence history",
    );
  const initialized = spawnSync("git", ["init", "-q"], { cwd: target, encoding: "utf8" });
  if (initialized.status !== 0)
    throw new Error(`Target Git initialization failed: ${initialized.stderr}`);
  const manifest = JSON.parse(readFileSync(path.join(target, "proofline.harness.json"), "utf8"));
  mkdirSync(path.join(target, "docs"), { recursive: true });
  writeFileSync(
    path.join(target, "test-impact/rules.md"),
    renderRules(JSON.parse(readFileSync(path.join(target, "test-impact/rules.json"), "utf8"))),
  );
  writeFileSync(
    path.join(target, "docs/PORTABLE_TEST_AUTOMATION.md"),
    `# Work-order verification\n\n${renderCanonicalCommandTable(manifest)}\n`,
  );
  writeFileSync(
    path.join(target, "test-impact/execution-record.jsonl"),
    `${targetRecord("work-orders-adaptation", "Declare independent work-orders rules and target adapters.", ["client", "checks", "proofline.harness.json", "test-impact", "docs"])}\n`,
  );
  return commitGitFixture(target, "Bootstrap standalone work-orders source");
};

export const main = async (options = parsePortabilityOptions(process.argv.slice(2))) => {
  if (options.prepareOnly) {
    const prepared = prepareTarget({ dependencyMode: options.dependencyMode });
    const bootstrap = initializeTarget(prepared.target);
    process.stdout.write(`${JSON.stringify({ ...prepared, bootstrap }, null, 2)}\n`);
    return 0;
  }
  const output = path.join(
    root,
    "artifacts/portability",
    `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID()}`,
  );
  mkdirSync(output, { recursive: true });
  const result = {
    version: 1,
    outcome: "failed",
    repository: process.env.GITHUB_REPOSITORY ?? null,
    workflow: process.env.GITHUB_WORKFLOW_REF ?? null,
    sourceCommit: spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).stdout?.trim(),
    sessionId: process.env.PROOFLINE_SESSION_ID ?? randomUUID(),
    gateKey: process.env.PROOFLINE_GATE_KEY ?? "portability",
    gateExecutionId: process.env.PROOFLINE_GATE_EXECUTION_ID ?? randomUUID(),
    ciRunId: process.env.PROOFLINE_CI_RUN_ID ?? process.env.GITHUB_RUN_ID ?? null,
    ciRunAttempt: process.env.PROOFLINE_CI_RUN_ATTEMPT ?? process.env.GITHUB_RUN_ATTEMPT ?? null,
    artifactDirectory: path.relative(root, output),
    target: "",
    dependencyMode: options.dependencyMode,
    installation: [],
    compatibility: {},
    coreHashes: {},
    gates: [],
    artifacts: output,
  };
  let executionEnvironment = {
    ...process.env,
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  const run = (key, args, env = {}) => {
    const command = args[0] === "node" ? [process.execPath, ...args.slice(1)] : args;
    const execution = spawnSync(command[0], command.slice(1), {
      cwd: result.target,
      env: {
        ...executionEnvironment,
        ...env,
        PROOFLINE_SESSION_ID: result.sessionId,
        PROOFLINE_CI_RUN_ID: result.ciRunId ?? undefined,
        PROOFLINE_CI_RUN_ATTEMPT: result.ciRunAttempt ?? undefined,
        PROOFLINE_GATE_KEY: `portability:${key}`,
        PROOFLINE_GATE_EXECUTION_ID: `${result.gateExecutionId}:${key}`,
      },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const log = path.join(output, `${key}.log`);
    writeFileSync(
      log,
      `$ ${JSON.stringify(command)}\n${execution.stdout ?? ""}${execution.stderr ?? ""}${execution.error ? String(execution.error) : ""}`,
    );
    if (requiredPortabilityGates.includes(key))
      result.gates.push({
        key,
        argv: args,
        exitCode: execution.status,
        log,
        logPath: `${key}.log`,
        logSha256: digest(log),
      });
    if (["install-package-manager", "install-dependencies", "install-browser"].includes(key))
      result.installation.push({
        key,
        argv: command,
        cwd: result.target,
        exitCode: execution.status,
        log,
        logPath: `${key}.log`,
        logSha256: digest(log),
      });
    if (execution.status !== 0) throw new Error(`${key} failed (${execution.status}); see ${log}`);
    return (execution.stdout ?? "").trim();
  };
  try {
    const prepared = prepareTarget({ dependencyMode: options.dependencyMode });
    result.target = prepared.target;
    result.coreHashes = prepared.hashes;
    if (options.dependencyMode === "independent") {
      const setup = mkdtempSync(path.join(os.tmpdir(), "proofline-independent-setup-"));
      for (const directory of ["home", "npm-cache", "store", "browser-cache", "tooling"])
        mkdirSync(path.join(setup, directory));
      executionEnvironment = {
        ...executionEnvironment,
        HOME: path.join(setup, "home"),
        npm_config_cache: path.join(setup, "npm-cache"),
        PLAYWRIGHT_BROWSERS_PATH: path.join(setup, "browser-cache"),
      };
      result.setup = {
        root: setup,
        home: executionEnvironment.HOME,
        store: path.join(setup, "store"),
        browserCache: executionEnvironment.PLAYWRIGHT_BROWSERS_PATH,
        registry: "https://registry.npmjs.org",
        packageManager: "pnpm@11.24.0",
      };
      run("install-package-manager", [
        "npm",
        "install",
        "--prefix",
        path.join(setup, "tooling"),
        "--registry",
        result.setup.registry,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "pnpm@11.24.0",
      ]);
      const pnpm = ["node", path.join(setup, "tooling/node_modules/pnpm/bin/pnpm.cjs")];
      result.setup.packageManagerVersion = run("package-manager-version", [...pnpm, "--version"]);
      if (result.setup.packageManagerVersion !== "11.24.0")
        throw new Error("Independent package manager version mismatch");
      run("install-dependencies", [
        ...pnpm,
        "install",
        "--frozen-lockfile",
        "--store-dir",
        result.setup.store,
        "--registry",
        result.setup.registry,
      ]);
      run("install-browser", [...pnpm, "exec", "playwright", "install", "chromium"]);
    }
    const dependencyDirectory = path.join(result.target, "node_modules");
    const hostLinked = lstatSync(dependencyDirectory).isSymbolicLink();
    result.preparation = { dependencyDirectory: "node_modules", hostLinked, resolvedPackages: {} };
    if (options.dependencyMode === "independent") {
      if (hostLinked) throw new Error("Independent target dependencies link to another repository");
      const targetRoot = realpathSync(result.target);
      const targetPackage = JSON.parse(
        readFileSync(path.join(result.target, "package.json"), "utf8"),
      );
      for (const name of Object.keys({
        ...targetPackage.dependencies,
        ...targetPackage.devDependencies,
      })) {
        const relative = path.relative(
          targetRoot,
          realpathSync(path.join(dependencyDirectory, name)),
        );
        if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative))
          throw new Error(`Independent dependency escapes its target: ${name}`);
        result.preparation.resolvedPackages[name] = relative.split(path.sep).join("/");
      }
    }
    for (const [key, packageName] of Object.entries({
      vite: "vite",
      vitest: "vitest",
      react: "react",
      playwright: "@playwright/test",
    }))
      result.compatibility[key] = JSON.parse(
        readFileSync(path.join(result.target, "node_modules", packageName, "package.json"), "utf8"),
      ).version;
    result.compatibility.node = process.version;
    result.compatibility.platform = `${os.platform()}-${os.arch()}`;
    result.compatibility.browser = "chromium";
    const bootstrap = initializeTarget(result.target);
    const manifest = JSON.parse(
      readFileSync(path.join(result.target, "proofline.harness.json"), "utf8"),
    );
    const commit = (label) => commitGitFixture(result.target, label);
    run("static", ["node", "tools/impact/src/main.ts", "--validate-harness"]);
    run("typecheck", manifest.commands.typecheck.argv);
    run("build-production", manifest.commands.buildProduction.argv);
    run("build-test", manifest.commands.buildTest.argv);
    run("initial-coverage", manifest.commands.coverage.argv);
    run("normalize", ["node", "tools/impact/src/coverage-policy.ts", "--normalize-reports"]);
    const base = commit("Declare standalone work-orders adaptation");
    const sourceFile = path.join(result.target, "client/orders.mjs");
    writeFileSync(
      sourceFile,
      readFileSync(sourceFile, "utf8").replace(
        'order.state !== "requested"',
        'order.state === "completed"',
      ),
    );
    const head = commit("Use the completed state for the completion guard", base);
    result.source = { bootstrap, base, head };
    const revisions = { IMPACT_BASE: base, IMPACT_HEAD: head };
    run("discovery", ["node", "tools/impact/src/main.ts", "--dry-run"], revisions);
    const selection = JSON.parse(
      readFileSync(path.join(result.target, "artifacts/impact/selection.json"), "utf8"),
    );
    result.selection = {
      fallback: selection.fallback,
      vitest: selection.identities.vitest.length,
      playwright: selection.identities.playwright.length,
    };
    if (
      result.selection.fallback !== "none" ||
      result.selection.vitest !== 2 ||
      result.selection.playwright !== 4
    )
      throw new Error("Expected exact work-order unit/browser selection");
    run("selected", ["node", "tools/impact/src/main.ts"], revisions);
    writeFileSync(
      path.join(result.target, "test-impact/execution-record.jsonl"),
      `${readFileSync(path.join(result.target, "test-impact/execution-record.jsonl"), "utf8")}${targetRecord("work-orders-source-change", "Exercise exact selection for the work-order completion guard.", ["client/orders.mjs"])}\n`,
    );
    const verifiedHead = commit("Record exact source-selection evidence");
    revisions.IMPACT_HEAD = verifiedHead;
    result.source.verifiedHead = verifiedHead;
    run("unit", manifest.commands.unit.argv, revisions);
    run("browser", manifest.commands.browser.argv, revisions);
    run("coverage", manifest.commands.coverage.argv, revisions);
    run("normalize-final", ["node", "tools/impact/src/coverage-policy.ts", "--normalize-reports"]);
    run("coverageCheck", manifest.commands.coverageCheck.argv, revisions);
    run("recordCheck", manifest.commands.recordCheck.argv, revisions);
    run("production", ["node", "tools/proofline/check-production.mjs"], revisions);
    for (const [file, hash] of Object.entries(prepared.hashes))
      if (digest(path.join(result.target, file)) !== hash)
        throw new Error(`Copied reusable core changed during execution: ${file}`);
    for (const directory of ["artifacts", "dist", "test-results", "playwright-report"])
      if (result.target && existsSync(path.join(result.target, directory)))
        cpSync(path.join(result.target, directory), path.join(output, directory), {
          recursive: true,
        });
    mkdirSync(path.join(output, "target"), { recursive: true });
    cpSync(
      path.join(result.target, "proofline.harness.json"),
      path.join(output, "target/proofline.harness.json"),
    );
    Object.assign(result, collectPortabilityNativeEvidence(result, output));
    result.evidenceHashes = Object.fromEntries(
      requiredPortabilityEvidence.map((file) => [file, digest(path.join(output, file))]),
    );
    result.outcome = "passed";
    validatePortabilityResult(result);
  } catch (error) {
    result.outcome = "failed";
    result.errors = [String(error)];
  }
  for (const directory of ["artifacts", "dist", "test-results", "playwright-report"])
    if (result.target && existsSync(path.join(result.target, directory)))
      cpSync(path.join(result.target, directory), path.join(output, directory), {
        recursive: true,
      });
  writeFileSync(path.join(output, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(
    path.join(root, "artifacts/portability/latest.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({ outcome: result.outcome, target: result.target, report: path.join(output, "result.json"), errors: result.errors }, null, 2)}\n`,
  );
  return result.outcome === "passed" ? 0 : 1;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  main().then((code) => {
    process.exitCode = code;
  });
