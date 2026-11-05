import { execFile, execFileSync, spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";

let origin = "";
let hits = 0;
let server: http.Server;
const temporary = mkdtempSync(path.join(tmpdir(), "proofline-canonical-egress-"));

beforeAll(async () => {
  server = http.createServer((_request, response) => {
    hits += 1;
    response.end("reached");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Probe did not bind TCP.");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  rmSync(temporary, { recursive: true, force: true });
});

const request = (transport: typeof http | typeof https, url: string) =>
  new Promise<string>((resolve) => {
    try {
      const outgoing = transport.get(url, (response) => {
        response.resume();
        response.on("end", () => resolve("dispatched"));
      });
      outgoing.on("error", (error) => resolve(String(error)));
    } catch (error) {
      resolve(String(error));
    }
  });

const runChild = (file: string) =>
  new Promise<{ status: number | null; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [file], {
      env: { ...process.env, PROOFLINE_PROBE_ORIGIN: origin },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (status) => resolve({ status, stderr }));
  });

test("canonical_unit_runner_denies_fetch_http_https_websocket_and_inherited_child_egress", async () => {
  const child = path.join(temporary, "child.mjs");
  writeFileSync(child, "await fetch(process.env.PROOFLINE_PROBE_ORIGIN + '/child');\n");
  const outcomes = {
    fetch: await fetch(`${origin}/fetch`).then(
      () => "dispatched",
      (error) => String(error),
    ),
    http: await request(http, `${origin}/http`),
    https: await request(https, `${origin.replace("http:", "https:")}/https`),
    websocket: (() => {
      try {
        const socket = new WebSocket(`${origin.replace("http:", "ws:")}/socket`);
        socket.addEventListener("error", () => undefined);
        socket.close();
        return "dispatched";
      } catch (error) {
        return String(error);
      }
    })(),
    child: await runChild(child),
  };
  for (const plane of ["fetch", "http", "https", "websocket"] as const)
    expect(outcomes[plane], plane).toContain("Proofline egress denied");
  expect(outcomes.child.status).not.toBe(0);
  expect(outcomes.child.stderr).toContain("Proofline egress denied plane=fetch");
  expect(hits).toBe(0);
});

test("canonical_unit_runner_rejects_package_manager_wrapper_escape_with_stripped_env", async () => {
  const child = path.join(temporary, "wrapper-child.mjs");
  writeFileSync(child, "await fetch(process.env.PROOFLINE_PROBE_ORIGIN + '/wrapper');\n");
  const runAttempt = (command: string, args: string[]) =>
    new Promise<{ status: number | null; output: string }>((resolve) => {
      let wrapper: ReturnType<typeof spawn>;
      try {
        wrapper = spawn(command, args, {
          env: {
            PATH: process.env.PATH,
            PROOFLINE_PROBE_ORIGIN: origin,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        resolve({ status: null, output: String(error) });
        return;
      }
      if (!wrapper.stdout || !wrapper.stderr) {
        resolve({ status: null, output: "Proofline probe child did not expose piped output." });
        return;
      }
      let output = "";
      wrapper.stdout.setEncoding("utf8");
      wrapper.stderr.setEncoding("utf8");
      wrapper.stdout.on("data", (chunk) => (output += chunk));
      wrapper.stderr.on("data", (chunk) => (output += chunk));
      wrapper.on("close", (status) => resolve({ status, output }));
    });
  const rejected = await Promise.all([
    runAttempt("pnpm", ["exec", "node", child]),
    runAttempt("pnpm", ["exec", "pnpm", "exec", "node", child]),
    runAttempt(path.resolve("node_modules/.bin/nx"), ["exec", "--", "node", child]),
    runAttempt(path.resolve("node_modules/.bin/playwright"), ["codegen", origin]),
    runAttempt(path.resolve("node_modules/.bin/vitest"), ["--inspect", child]),
  ]);
  for (const attempt of rejected) {
    expect(attempt.status, attempt.output).not.toBe(0);
    expect(attempt.output).toContain("Proofline unsupported-child-plane");
  }
  const guardedTest = path.resolve("tools/proofline/src/product-e2e-boundary.test.ts");
  const guardedWrapper = await runAttempt("pnpm", [
    "exec",
    "vitest",
    "run",
    guardedTest,
    "-t",
    "canonical_wrapper_descendant_retains_egress_guard",
    "--reporter=dot",
  ]);
  expect(hits).toBe(0);
  expect(guardedWrapper.status, guardedWrapper.output).not.toBe(0);
  expect(guardedWrapper.output).toContain("Proofline egress denied");
});

test("canonical_unit_runner_rejects_forged_delegated_policy_broadening", async () => {
  const child = path.join(temporary, "delegated-policy-child.mjs");
  writeFileSync(child, "await fetch(process.env.PROOFLINE_PROBE_ORIGIN + '/delegated');\n");
  const runDelegated = (env: NodeJS.ProcessEnv) =>
    new Promise<{ status: number | null; output: string }>((resolve) => {
      let spawned: ReturnType<typeof spawn>;
      try {
        spawned = spawn(process.execPath, [child], {
          env,
          stdio: ["ignore", "ignore", "pipe"],
          [Symbol.for("proofline.egress-guard.delegated-policy")]: true,
        });
      } catch (error) {
        resolve({ status: null, output: String(error) });
        return;
      }
      if (!spawned.stderr) {
        resolve({ status: null, output: "Proofline delegated probe did not expose stderr." });
        return;
      }
      let output = "";
      spawned.stderr.setEncoding("utf8");
      spawned.stderr.on("data", (chunk) => (output += chunk));
      spawned.on("close", (status) => resolve({ status, output }));
    });
  const originBroadening = await runDelegated({
    ...process.env,
    PROOFLINE_ALLOWED_ORIGINS: JSON.stringify([origin]),
    PROOFLINE_ALLOWED_CHILD_CAPABILITIES: "[]",
    PROOFLINE_PROBE_ORIGIN: origin,
  });
  const installedCapabilities = JSON.parse(
    process.env.PROOFLINE_ALLOWED_CHILD_CAPABILITIES ?? "[]",
  ) as unknown[];
  const capabilityBroadening = await runDelegated({
    ...process.env,
    PROOFLINE_ALLOWED_CHILD_CAPABILITIES: JSON.stringify([
      ...installedCapabilities,
      { executable: "/bin/echo", purpose: "git-local" },
    ]),
    PROOFLINE_PROBE_ORIGIN: origin,
  });
  for (const result of [originBroadening, capabilityBroadening]) {
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toMatch(/delegated policy|Proofline egress denied/i);
  }
  expect(hits).toBe(0);
});

test("canonical_unit_runner_rejects_repository_clean_filters_before_native_dispatch", () => {
  const cwd = path.join(temporary, "native-git-filters");
  mkdirSync(cwd);
  expect(spawnSync("git", ["init", "-q"], { cwd }).status).toBe(0);
  const marker = path.join(cwd, "helper-ran");
  const helper = path.join(cwd, "hostile-helper");
  writeFileSync(helper, `#!/bin/sh\nprintf ran > '${marker}'\ncat\n`);
  chmodSync(helper, 0o755);
  writeFileSync(
    path.join(cwd, ".git/config"),
    `[core]\n repositoryformatversion = 0\n[filter "hostile"]\n clean = ${helper}\n required = true\n`,
  );
  writeFileSync(path.join(cwd, ".gitattributes"), "tracked.txt filter=hostile\n");
  writeFileSync(path.join(cwd, "tracked.txt"), "tracked\n");
  let denial = "dispatched";
  try {
    spawnSync("git", ["add", "tracked.txt"], { cwd });
  } catch (error) {
    denial = String(error);
  }
  expect({ denial, helperRan: existsSync(marker) }).toEqual({
    denial: expect.stringContaining("unsupported-child-plane"),
    helperRan: false,
  });
});

test("canonical_unit_runner_ignores_HOME_and_XDG_git_configuration", () => {
  for (const source of ["home", "xdg"]) {
    const cwd = path.join(temporary, `git-config-${source}`);
    const home = path.join(cwd, "home");
    const xdg = path.join(cwd, "xdg");
    mkdirSync(path.join(xdg, "git"), { recursive: true });
    mkdirSync(home);
    // Invalid config would stop every Git command if this source were consulted.
    writeFileSync(
      source === "home" ? path.join(home, ".gitconfig") : path.join(xdg, "git/config"),
      "[malformed\n",
    );
    const result = spawnSync("git", ["init", "-q"], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, HOME: home, XDG_CONFIG_HOME: xdg },
    });
    expect(result.status, result.stderr).toBe(0);
  }
});

test("canonical_unit_runner_limits_git_to_filter_free_object_and_metadata_operations", async () => {
  const cwd = path.join(temporary, "git-object-operations");
  mkdirSync(cwd);
  const git = (argv: string[], input?: string) =>
    execFileSync("git", argv, { cwd, input, encoding: "utf8" }).trim();
  git(["init", "-q"]);
  const marker = path.join(cwd, "helper-ran");
  const helper = path.join(cwd, "hostile-helper");
  const hooks = path.join(cwd, "hooks");
  mkdirSync(hooks);
  for (const file of [helper, path.join(hooks, "reference-transaction")]) {
    writeFileSync(file, `#!/bin/sh\nprintf ran > '${marker}'\ncat\n`);
    chmodSync(file, 0o755);
  }
  writeFileSync(
    path.join(cwd, ".git/config"),
    `[core]\n repositoryformatversion = 0\n fsmonitor = ${helper}\n hooksPath = ${hooks}\n[extensions]\n worktreeConfig = true\n[include]\n path = ${cwd}/included-config\n[filter "hostile"]\n clean = ${helper}\n process = ${helper}\n[diff "hostile"]\n command = ${helper}\n textconv = ${helper}\n[gpg]\n program = ${helper}\n[commit]\n gpgSign = true\n`,
  );
  writeFileSync(
    path.join(cwd, "included-config"),
    `[pager]\n cat-file = ${helper}\n ls-files = ${helper}\n[url "ext::${helper}"]\n insteadOf = file://\n`,
  );
  writeFileSync(
    path.join(cwd, ".git/config.worktree"),
    `[core]\n fsmonitor = ${helper}\n hooksPath = ${hooks}\n`,
  );
  writeFileSync(path.join(cwd, ".gitattributes"), "* filter=hostile diff=hostile\n");
  const blob = git(["hash-object", "-w", "--stdin", "--no-filters"], "raw bytes\n");
  const tree = git(["mktree", "-z"], `100644 blob ${blob}\ttracked.txt\0`);
  const commit = git(["commit-tree", tree, "-m", "fixture"]);
  git(["update-ref", "HEAD", commit]);
  expect(git(["cat-file", "blob", "HEAD:tracked.txt"])).toBe("raw bytes");
  expect(git(["ls-tree", "-r", "--name-only", "-z", "HEAD"])).toBe("tracked.txt\0");
  expect(git(["rev-parse", "--verify", "HEAD^{commit}"])).toBe(commit);
  expect(git(["merge-base", "--all", commit, commit])).toBe(commit);
  expect(git(["ls-files", "--stage", "-z"])).toBe("");
  await new Promise<void>((resolve, reject) =>
    execFile("git", ["cat-file", "blob", "HEAD:tracked.txt"], { cwd }, (error, output) => {
      if (error) return reject(error);
      expect(output).toBe("raw bytes\n");
      resolve();
    }),
  );
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", ["rev-parse", "HEAD"], { cwd });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`git exited ${code}`))));
  });
  for (const argv of [
    ["add", "tracked.txt"],
    ["commit", "-qm", "unsafe"],
    ["status"],
    ["rm", "tracked.txt"],
    ["diff", "--name-status", "-z", "--find-renames"],
    ["show", "HEAD:tracked.txt"],
    ["write-tree"],
    ["update-index", "--add", "--cacheinfo", "100644", blob, "tracked.txt"],
    ["clone", "-q", "--depth=1", "--no-checkout", `file://${cwd}`, path.join(cwd, "clone")],
    ["hash-object", "-w", "--stdin"],
    ["cat-file", "--filters", "HEAD:tracked.txt"],
    ["rev-parse", "--verify", "../HEAD"],
    ["cat-file", "blob", "HEAD:../tracked.txt"],
  ])
    expect(() => git(argv)).toThrow(/unsupported-child-plane/);
  expect(() => spawnSync("git", ["rev-parse", "HEAD"], { cwd: "." })).toThrow(/absolute directory/);
  expect(() => spawnSync("git", ["rev-parse", "HEAD"], { cwd, argv0: "git-upload-pack" })).toThrow(
    /reviewed argv0/,
  );
  for (const key of [
    "GIT_CONFIG_SYSTEM",
    "GIT_CONFIG_GLOBAL",
    "GIT_ATTRIBUTES_FILE",
    "GIT_EXEC_PATH",
  ])
    expect(() =>
      spawnSync("git", ["rev-parse", "HEAD"], { cwd, env: { ...process.env, [key]: helper } }),
    ).toThrow(/unsafe git environment/);
  // A missing promised object must not cause Git to launch a fetch or remote helper.
  appendFileSync(
    path.join(cwd, ".git/config"),
    `\n[core]\n repositoryformatversion = 1\n[extensions]\n partialClone = hostile\n[remote "hostile"]\n url = ext::${helper}\n promisor = true\n`,
  );
  rmSync(path.join(cwd, ".git/objects", blob.slice(0, 2), blob.slice(2)));
  expect(() => git(["cat-file", "blob", "HEAD:tracked.txt"])).toThrow();
  expect(existsSync(marker)).toBe(false);
});

test("canonical_unit_runner_establishes_manifest_artifacts_before_vitest", () => {
  const runner = readFileSync("tools/proofline/canonical-runner.mjs", "utf8");
  const manifest = JSON.parse(readFileSync("proofline.harness.json", "utf8")) as {
    commands: Record<string, { argv: string[]; cwd: string }>;
    execution: { unitBuildCommands: string[]; unitTargets: { argv: string[]; cwd: string }[] };
  };
  expect(manifest.commands.buildProduction).toEqual({ argv: ["pnpm", "build"], cwd: "." });
  expect(manifest.commands.buildTest).toEqual({ argv: ["pnpm", "build:test"], cwd: "." });
  expect(manifest.execution.unitBuildCommands).toEqual([
    "buildProduction",
    "buildTest",
    "buildDemo",
  ]);
  expect(manifest.execution.unitTargets.length).toBeGreaterThan(0);
  const unitBranch = runner.slice(runner.indexOf('if (mode === "unit")'));
  const buildIndex = unitBranch.indexOf("runManifestCommands(execution.unitBuildCommands)");
  const testIndex = unitBranch.indexOf("for (const target of execution.unitTargets)");
  expect(buildIndex).toBeGreaterThanOrEqual(0);
  expect(testIndex).toBeGreaterThan(buildIndex);
});
