import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pins = {
  react: "19.2.8",
  vite: "6.4.3",
  vitest: "3.2.7",
  "@vitest/coverage-v8": "3.2.7",
  "@playwright/test": "1.62.1",
};
const childExpression = "JSON.stringify({version:process.version,execPath:process.execPath})";
const probe = (command, args, cwd) => {
  const environment = {
    ...process.env,
    COREPACK_ENABLE_NETWORK: "0",
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
    npm_config_manage_package_manager_versions: "false",
    GIT_NO_LAZY_FETCH: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
  };
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: "utf8",
    shell: false,
    timeout: 10000,
    maxBuffer: 65536,
  });
  if (result.error || result.status !== 0)
    throw new Error(`Required read-only probe failed: ${command}`);
  return result.stdout.trim();
};
const canonical = (file) => (existsSync(file) ? realpathSync(file) : path.resolve(file));

// A bounded reader for pnpm v9's block-map metadata, not a general YAML parser.
// Only the importer metadata is interpreted; package/snapshot bodies stay opaque.
// Unsupported YAML constructs fail rather than acquiring prerequisite authority.
const lockCondition = (condition) => {
  if (!condition) throw new Error("Unsupported or ambiguous pnpm lock structure");
};
const lockMap = (lines, indentation) => {
  const entries = new Map();
  let current;
  for (const raw of lines) {
    lockCondition(!raw.includes("\t") && !raw.includes("\r"));
    const line = raw.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const depth = /^ */.exec(line)[0].length;
    lockCondition(depth >= indentation);
    if (depth > indentation) {
      lockCondition(current && current.value === "");
      current.children.push(line);
      continue;
    }
    const match = /^(?:'([^']+)'|"([^"\\]+)"|([^\s'"[\]{}&*!#:]+)):(?: +(.*))?$/.exec(
      line.slice(indentation),
    );
    lockCondition(match);
    const key = match[1] ?? match[2] ?? match[3];
    lockCondition(key !== "<<" && !entries.has(key));
    current = { value: match[4] ?? "", children: [] };
    entries.set(key, current);
  }
  return entries;
};
const lockScalar = (entry) => {
  lockCondition(entry && entry.children.length === 0 && entry.value.length > 0);
  const value = entry.value;
  if (/^'[^']*'$/.test(value) || /^"[^"\\]*"$/.test(value)) return value.slice(1, -1);
  lockCondition(!/[\s'"[\]{}]/.test(value) && !/^[&*!|>#]/.test(value));
  return value;
};
const lockedRootDependencies = (text) => {
  const top = lockMap(text.replaceAll("\r\n", "\n").split("\n"), 0);
  lockCondition(
    [...top.keys()].every((key) =>
      ["lockfileVersion", "settings", "importers", "packages", "snapshots"].includes(key),
    ),
  );
  lockCondition(lockScalar(top.get("lockfileVersion")) === "9.0");
  for (const [key, entry] of top)
    if (key !== "lockfileVersion") lockCondition(["", "{}"].includes(entry.value));
  const importers = top.get("importers");
  lockCondition(importers && importers.value === "");
  const importerMap = lockMap(importers.children, 2);
  for (const entry of importerMap.values()) lockCondition(["", "{}"].includes(entry.value));
  const root = importerMap.get(".");
  lockCondition(root);
  const categories = lockMap(root.children, 4);
  const dependencies = new Map();
  for (const [category, entry] of categories) {
    lockCondition(
      ["dependencies", "devDependencies", "optionalDependencies"].includes(category) &&
        ["", "{}"].includes(entry.value),
    );
    for (const [name, dependency] of lockMap(entry.children, 6)) {
      lockCondition(dependency.value === "" && !dependencies.has(name));
      const fields = lockMap(dependency.children, 8);
      lockCondition(fields.size === 2 && fields.has("specifier") && fields.has("version"));
      dependencies.set(name, {
        category,
        specifier: lockScalar(fields.get("specifier")),
        version: lockScalar(fields.get("version")),
      });
    }
  }
  return dependencies;
};
export const collectPreflight = async ({
  cwd = process.cwd(),
  stage = "source",
  base,
  head,
  independent = false,
  runtime = {
    version: process.version,
    execPath: process.execPath,
    platform: process.platform,
    arch: process.arch,
  },
  readFile = (file) => readFileSync(file, "utf8"),
  runProbe = probe,
  loadBrowserRegistry,
} = {}) => {
  if (!["source", "installed"].includes(stage)) throw new Error("Unsupported doctor stage");
  const checks = [];
  const check = async (id, expected, remediation, work) => {
    try {
      const observed = await work();
      checks.push({
        id,
        status: "pass",
        observed,
        expected,
        message: `${id} prerequisite satisfied`,
        remediation: "",
      });
    } catch {
      checks.push({
        id,
        status: "fail",
        observed: "unavailable or inconsistent",
        expected,
        message: `${id} prerequisite unmet`,
        remediation,
      });
    }
  };
  const require = (condition) => {
    if (!condition) throw new Error("unmet");
  };
  let pkg;
  await check(
    "node",
    "Node 24.22.1",
    "Select Node 24.22.1 with the repository .nvmrc before running Proofline.",
    () => {
      require(runtime.version === "v24.22.1");
      return runtime.version;
    },
  );
  await check(
    "child-node",
    "PATH node resolves to this executing Node",
    "Put the selected Node executable directory first in PATH, including child processes.",
    () => {
      const child = JSON.parse(runProbe("node", ["-p", childExpression], cwd));
      require(
        child.version === runtime.version &&
          canonical(child.execPath) === canonical(runtime.execPath),
      );
      return child;
    },
  );
  await check(
    "pins",
    "coherent packageManager, engines and .nvmrc",
    "Restore package.json, .nvmrc and the documented pinned toolchain from the same source revision.",
    () => {
      pkg = JSON.parse(readFile(path.join(cwd, "package.json")));
      require(
        pkg.packageManager === "pnpm@11.24.0" &&
          pkg.engines?.node === ">=24.22.1 <25" &&
          readFile(path.join(cwd, ".nvmrc")).trim() === "24.22.1",
      );
      for (const [name, version] of Object.entries(pins))
        require(
          [version, `^${version}`, `~${version}`].includes(
            pkg.dependencies?.[name] ?? pkg.devDependencies?.[name],
          ),
        );
      return { node: pkg.engines.node, packageManager: pkg.packageManager };
    },
  );
  await check(
    "pnpm",
    "pnpm 11.24.0",
    "Install/select pnpm@11.24.0 explicitly; put its executable first in child PATH.",
    () => {
      const value = runProbe("pnpm", ["--version"], cwd);
      require(value === "11.24.0");
      return value;
    },
  );
  await check("git", "Git >=2.48.0", "Install Git 2.48 or newer and ensure git is on PATH.", () => {
    const value = runProbe("git", ["--version"], cwd);
    const match = /^git version (\d+)\.(\d+)\.(\d+)/.exec(value);
    require(match && (Number(match[1]) > 2 || (Number(match[1]) === 2 && Number(match[2]) >= 48)));
    return value;
  });
  await check(
    "history",
    "Git worktree with full history",
    "Use a Git clone with full history (CI checkout fetch-depth: 0); fetch missing history explicitly.",
    () => {
      require(
        runProbe("git", ["rev-parse", "--is-inside-work-tree"], cwd) === "true" &&
          runProbe("git", ["rev-parse", "--is-shallow-repository"], cwd) === "false",
      );
      return "full worktree";
    },
  );
  await check(
    "lock",
    "v9 lock with exact selected dependency resolutions",
    "Restore the matching pnpm-lock.yaml; regenerate and review it only as an explicit dependency update.",
    () => {
      const dependencies = lockedRootDependencies(readFile(path.join(cwd, "pnpm-lock.yaml")));
      for (const [name, version] of Object.entries(pins)) {
        const selected = dependencies.get(name);
        const category =
          pkg?.dependencies?.[name] === undefined ? "devDependencies" : "dependencies";
        require(
          selected &&
            selected.category === category &&
            selected.specifier === pkg?.[category]?.[name] &&
            (selected.version === version || selected.version.startsWith(`${version}(`)),
        );
      }
      return "selected package resolutions";
    },
  );
  await check(
    "manifest",
    "Proofline manifest version 1",
    "Restore proofline.harness.json from this target's reviewed source; run harness:validate after installation.",
    () => {
      const manifest = JSON.parse(readFile(path.join(cwd, "proofline.harness.json")));
      require(
        manifest.version === 1 &&
          Array.isArray(manifest.coverage) &&
          manifest.coverage.length > 0 &&
          manifest.coverage.every(
            (group) =>
              group.provider === "v8" && group.providerVersion === pins["@vitest/coverage-v8"],
          ),
      );
      return "version 1 and pinned v8 provider (schema validation remains a gate)";
    },
  );
  if (base !== undefined || head !== undefined)
    await check(
      "revisions",
      "paired immutable ancestor base/head commits",
      "Supply full 40-character commit SHAs with --base and --head; fetch history and select an ancestor base.",
      () => {
        require(/^[a-f0-9]{40}$/.test(base ?? "") && /^[a-f0-9]{40}$/.test(head ?? ""));
        for (const sha of [base, head])
          require(runProbe("git", ["rev-parse", "--verify", `${sha}^{commit}`], cwd) === sha);
        require(runProbe("git", ["merge-base", base, head], cwd) === base);
        return { base, head };
      },
    );
  checks.push({
    id: "platform",
    status: "info",
    observed: `${runtime.platform}/${runtime.arch}`,
    expected: "linux/x64 or darwin/arm64 candidate; execution evidence required",
    message: "Platform compatibility is not verified by preflight.",
    remediation: "Run the complete source-bound compatibility gate and retain native evidence.",
  });
  if (stage === "installed") {
    await check(
      "dependencies",
      "exact installed versions; contained direct dependencies for independent targets",
      "Run pnpm install --frozen-lockfile in this target. Independent targets need their own installation without host links.",
      () => {
        const resolver = createRequire(path.join(cwd, "package.json"));
        const observed = {};
        const names = new Set([
          ...Object.keys(pins),
          ...(independent
            ? [...Object.keys(pkg?.dependencies ?? {}), ...Object.keys(pkg?.devDependencies ?? {})]
            : []),
        ]);
        for (const name of names) {
          const file = resolver.resolve(`${name}/package.json`);
          const real = realpathSync(file);
          if (independent)
            require(
              real.startsWith(`${canonical(path.join(cwd, "node_modules"))}${path.sep}`) &&
                canonical(path.join(cwd, "node_modules")).startsWith(
                  `${canonical(cwd)}${path.sep}`,
                ),
            );
          const version = JSON.parse(readFile(file)).version;
          if (pins[name]) require(version === pins[name]);
          observed[name] = version;
        }
        return observed;
      },
    );
    await check(
      "browser-files",
      "installed registry Chromium, headless shell and FFmpeg regular files",
      "Run pnpm exec playwright install chromium with the intended PLAYWRIGHT_BROWSERS_PATH. On Linux provision OS dependencies explicitly; file checks do not prove OS-library readiness.",
      async () => {
        const { playwrightChildren } = await import("./canonical-runner.mjs");
        const registry = loadBrowserRegistry ? await loadBrowserRegistry() : undefined;
        let installed = registry;
        if (!installed) {
          const testRequire = createRequire(
            createRequire(path.join(cwd, "package.json")).resolve("@playwright/test"),
          );
          const playwrightRequire = createRequire(testRequire.resolve("playwright/package.json"));
          installed = playwrightRequire("playwright-core/lib/coreBundle").registry.registry;
        }
        // Resolve through this target's dependency graph, then reuse the reviewed resolver.
        const capabilities = playwrightChildren(installed);
        const paths = ["chromium", "chromium-headless-shell", "ffmpeg"].map((name) => {
          const entry = installed.findExecutable(name);
          const file = entry?.executablePath();
          require(file && existsSync(file));
          const resolved = realpathSync(file);
          require(capabilities.some((item) => item.executable === resolved));
          return { name, executable: resolved };
        });
        return paths;
      },
    );
  }
  return {
    version: 1,
    kind: "preflight",
    stage,
    ready: !checks.some((check) => check.status === "fail"),
    checks,
    limitation: "Readiness is not proof of passed tests or browser OS-library readiness.",
  };
};
export const renderPreflight = (result) =>
  [
    `Proofline ${result.stage} preflight: ${result.ready ? "ready" : "requirements unmet"}`,
    ...result.checks.map(
      (check) =>
        `${check.status.toUpperCase()} ${check.id}: ${check.message}${check.remediation ? ` ${check.remediation}` : ""}`,
    ),
    result.limitation,
  ].join("\n") + "\n";
export const parseDoctorOptions = (args) => {
  const options = { stage: "source", json: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (seen.has(key)) throw new Error(`Duplicate option ${key}`);
    seen.add(key);
    if (key === "--json") options.json = true;
    else if (key === "--independent") options.independent = true;
    else if (["--stage", "--base", "--head"].includes(key)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`Missing ${key}`);
      options[key.slice(2)] = value;
    } else throw new Error(`Unknown option ${key}`);
  }
  if (
    !["source", "installed"].includes(options.stage) ||
    Boolean(options.base) !== Boolean(options.head) ||
    (options.base && ![options.base, options.head].every((value) => /^[a-f0-9]{40}$/.test(value)))
  )
    throw new Error("Invalid stage or paired revisions");
  return options;
};
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseDoctorOptions(process.argv.slice(2));
    const result = await collectPreflight(options);
    process.stdout.write(
      options.json ? `${JSON.stringify(result, null, 2)}\n` : renderPreflight(result),
    );
    process.exitCode = result.ready ? 0 : 1;
  } catch (error) {
    process.stderr.write(`Proofline preflight: ${error.message}\n`);
    process.exitCode = 1;
  }
}
