import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const assets = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(assets, "../../..");
const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const run = (argv, cwd = root, env = process.env) => {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd,
    env,
    encoding: "utf8",
    shell: false,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
};
const git = (args, cwd = root) => {
  const result = run(["git", ...args], cwd);
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
};
const walk = (directory, prefix = "") =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory()
      ? walk(path.join(directory, entry.name), relative)
      : entry.isFile()
        ? [relative]
        : [];
  });
const portabilityFile = path.join(root, "artifacts/portability/latest.json");
const portabilityHash = digest(portabilityFile);
const portability = json(portabilityFile);
if (portability.outcome !== "passed")
  throw new Error("A passing prepared standalone target is required");
const target = process.env.PROOFLINE_SHOWCASE_TARGET ?? portability.target;
if (!path.isAbsolute(target) || target === root || target.startsWith(`${root}${path.sep}`))
  throw new Error("Capture target must be an isolated absolute OS temporary repository");
if (!existsSync(path.join(target, "dist/work-orders-test/index.html")))
  throw new Error(
    "Prepared standalone test build is missing; run the documented portability validation first",
  );
const coreFiles = Object.keys(portability.coreHashes);
if (coreFiles.length !== 31) throw new Error("Unexpected retained core inventory");
const checkCore = () =>
  Object.fromEntries(
    coreFiles.map((file) => {
      const host = digest(path.join(root, file));
      const copied = digest(path.join(target, file));
      if (host !== portability.coreHashes[file] || copied !== host)
        throw new Error(`Core hash mismatch: ${file}`);
      return [file, host];
    }),
  );
const coreBefore = checkCore();
const sourceFiles = [
  ...walk(path.join(target, "client")).map((file) => `client/${file}`),
  ...walk(path.join(target, "checks")).map((file) => `checks/${file}`),
  "package.json",
  "proofline.harness.json",
];
const sourceBefore = Object.fromEntries(
  sourceFiles.map((file) => [file, digest(path.join(target, file))]),
);
const buildBefore = Object.fromEntries(
  walk(path.join(target, "dist/work-orders-test")).map((file) => [
    file,
    digest(path.join(target, "dist/work-orders-test", file)),
  ]),
);
const originalEvidence = Object.fromEntries(
  walk(path.join(target, "artifacts/proofline/runs")).map((file) => [
    file,
    digest(path.join(target, "artifacts/proofline/runs", file)),
  ]),
);
const originalInvocations = new Set(readdirSync(path.join(target, "artifacts/proofline/runs")));
const directoryName = `showcase-capture-${randomUUID()}`;
const captureDirectory = path.join(target, directoryName);
mkdirSync(captureDirectory);
copyFileSync(
  path.join(assets, "capture-workflow.ts.txt"),
  path.join(captureDirectory, "capture-workflow.spec.ts"),
);
const configSource = `import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "capture-workflow.spec.ts",
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"]],
  use: { serviceWorkers: "block", trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure", launchOptions: { slowMo: 90 } },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
`;
writeFileSync(path.join(captureDirectory, "playwright.config.mjs"), configSource);
writeFileSync(path.join(assets, "capture-config.mjs.txt"), configSource);
const command = [
  process.execPath,
  "tools/proofline/canonical-runner.mjs",
  "playwright",
  "test",
  "--config",
  `${directoryName}/playwright.config.mjs`,
];
const environment = {
  ...process.env,
  PROOFLINE_SHOWCASE_ASSETS: assets,
  PROOFLINE_SESSION_ID: `showcase-${randomUUID()}`,
  PROOFLINE_GATE_KEY: "showcase:second-app",
  PROOFLINE_GATE_EXECUTION_ID: randomUUID(),
};
for (const name of [
  "CI",
  "GITHUB_ACTIONS",
  "GITHUB_REPOSITORY",
  "GITHUB_WORKFLOW_REF",
  "GITHUB_RUN_ID",
  "GITHUB_RUN_ATTEMPT",
  "PROOFLINE_CI_RUN_ID",
  "PROOFLINE_CI_RUN_ATTEMPT",
  "PROOFLINE_PARENT_INVOCATION_ID",
  "PROOFLINE_SELECTED_IDENTITY",
])
  delete environment[name];
let execution;
try {
  execution = run(command, target, environment);
  writeFileSync(
    path.join(assets, "capture.log.txt"),
    `$ ${JSON.stringify(command)}\nCWD ${target}\n${execution.stdout}${execution.stderr}`,
  );
  process.stdout.write(execution.stdout);
  process.stderr.write(execution.stderr);
  if (execution.status !== 0)
    throw new Error(
      `Native guarded capture failed with exit ${execution.status}; see capture.log.txt`,
    );
  const newInvocations = readdirSync(path.join(target, "artifacts/proofline/runs")).filter(
    (name) => !originalInvocations.has(name),
  );
  if (newInvocations.length !== 1) throw new Error("Expected one new native capture invocation");
  const invocation = newInvocations[0];
  const invocationDirectory = path.join(target, "artifacts/proofline/runs", invocation);
  const verification = json(path.join(invocationDirectory, "verification.json"));
  const native = json(path.join(invocationDirectory, "native-report.json"));
  if (
    verification.outcome !== "passed" ||
    verification.exitCode !== 0 ||
    verification.errors.length ||
    verification.observed.length !== 1 ||
    native.stats.expected !== 1 ||
    native.stats.unexpected !== 0 ||
    native.stats.skipped !== 0
  )
    throw new Error("Native execution verification did not prove one genuine passing capture");
  const coreAfter = checkCore();
  for (const [file, hash] of Object.entries(sourceBefore))
    if (digest(path.join(target, file)) !== hash) throw new Error(`Target source changed: ${file}`);
  for (const [file, hash] of Object.entries(buildBefore))
    if (digest(path.join(target, "dist/work-orders-test", file)) !== hash)
      throw new Error(`Target build changed: ${file}`);
  for (const [file, hash] of Object.entries(originalEvidence))
    if (digest(path.join(target, "artifacts/proofline/runs", file)) !== hash)
      throw new Error(`Prior native evidence changed: ${file}`);
  if (digest(portabilityFile) !== portabilityHash)
    throw new Error("Retained portability result was changed");
  const nativeFiles = [
    "native-report.json",
    "verification.json",
    "discovery.json",
    "stdout.log",
    "stderr.log",
  ];
  const retainedNative = {};
  for (const file of nativeFiles) {
    const retained = `${file}.txt`;
    copyFileSync(path.join(invocationDirectory, file), path.join(assets, retained));
    retainedNative[retained] = {
      source: path.join(invocationDirectory, file),
      sha256: digest(path.join(assets, retained)),
    };
  }
  const inspection = json(path.join(assets, "inspection.json"));
  const captions = inspection.stages.map((stage, index) => ({
    start: index === 0 ? 0 : stage.elapsedSeconds - 0.25,
    end:
      index + 1 < inspection.stages.length
        ? inspection.stages[index + 1].elapsedSeconds - 0.25
        : inspection.elapsedSeconds,
    text: stage.label,
  }));
  const timestamp = (seconds) => {
    const milliseconds = Math.max(0, Math.round(seconds * 1000));
    return `${String(Math.floor(milliseconds / 3600000)).padStart(2, "0")}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, "0")}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}.${String(milliseconds % 1000).padStart(3, "0")}`;
  };
  writeFileSync(
    path.join(assets, "work-orders-demo.vtt"),
    `WEBVTT\n\n${captions.map((caption, index) => `${index + 1}\n${timestamp(caption.start)} --> ${timestamp(caption.end)}\n${caption.text}\n`).join("\n")}\n`,
  );
  const ffprobe = run([
    "ffprobe",
    "-v",
    "error",
    "-show_entries",
    "stream=codec_name,width,height,r_frame_rate:format=duration,size",
    "-of",
    "json",
    path.join(assets, "work-orders-demo.webm"),
  ]);
  if (ffprobe.status !== 0) throw new Error(`ffprobe failed: ${ffprobe.stderr}`);
  const video = JSON.parse(ffprobe.stdout);
  const assetFiles = [
    ...inspection.stages.map((stage) => stage.image),
    "work-orders-demo.webm",
    "work-orders-demo.vtt",
    "inspection.json",
    "capture_demo.mjs",
    "capture-workflow.ts.txt",
    "capture-config.mjs.txt",
    "capture.log.txt",
    ...Object.keys(retainedNative),
  ];
  const provenance = {
    schemaVersion: 1,
    capturedAt: inspection.capturedAt,
    result: "passed",
    host: {
      repository: "deanmng1/proofline",
      contextualHead: git(["rev-parse", "HEAD"]),
      verifiedImplementationHead: portability.sourceCommit,
      portabilityResult: "artifacts/portability/latest.json",
      portabilityResultSha256: portabilityHash,
    },
    target: {
      path: target,
      commit: git(["rev-parse", "HEAD"], target),
      retainedVerifiedHead: portability.source.verifiedHead,
      runtime: "unrelated standalone work-orders React/Vite application",
      sourceSha256: sourceBefore,
      testBuildSha256: buildBefore,
    },
    runtime: {
      node: process.version,
      platform: `${os.platform()}-${os.arch()}`,
      playwright: json(path.join(root, "node_modules/@playwright/test/package.json")).version,
      browserProject: "chromium",
      viewport: inspection.viewport,
      vite: portability.compatibility.vite,
      vitest: portability.compatibility.vitest,
      react: portability.compatibility.react,
    },
    command: {
      argv: command,
      cwd: target,
      exitCode: execution.status,
      nativeArgv: verification.argv,
      scope: verification.scope,
      gateKey: verification.gateKey,
      invocationId: invocation,
      sessionId: verification.sessionId,
    },
    native: {
      stats: native.stats,
      outcome: verification.outcome,
      errors: verification.errors,
      observed: verification.observed,
      retained: retainedNative,
    },
    controls: {
      canonicalGuard: "unchanged tools/proofline/canonical-runner.mjs",
      targetOwnedFixture: "checks/browser/scenario.mjs",
      serviceWorkers: "block",
      externalRequests: "deny by default in fixture",
      webSockets: "deny by default in fixture",
      styleOrUiInjection: false,
      externalProviders: false,
      hostedCi: false,
      deployment: false,
    },
    unchanged: {
      coreFileCount: coreFiles.length,
      coreBefore,
      coreAfter,
      targetSourceAndBuild: true,
      priorNativeEvidenceFiles: Object.keys(originalEvidence).length,
      priorNativeEvidence: true,
      portabilityLatestJson: true,
    },
    assertions: inspection.assertions,
    video: { ...video, aspectRatio: "16:9", audio: false, autoplay: false },
    stages: inspection.stages,
    assets: Object.fromEntries(
      assetFiles.map((file) => [
        file,
        {
          sha256: digest(path.join(assets, file)),
          bytes: readFileSync(path.join(assets, file)).length,
        },
      ]),
    ),
    reproduction:
      "From the host checkout, use Node24 and installed offline dependencies; execute node docs/showcase/second-app-demo/capture_demo.mjs. It reuses the successful isolated target in artifacts/portability/latest.json and creates only an ephemeral capture spec/config there. A missing target fails closed; this script does not recreate or rerun portability validation.",
    limitation:
      "One local narrated-by-captions happy-path capture; the retained full portability result separately proves four browser workflows and ten gates. No hosted CI, provider, deployment, or broader compatibility claim.",
  };
  writeFileSync(path.join(assets, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(
    `Guarded second-app capture verified: ${video.format.duration}s, 960x540, one native passing test; ${coreFiles.length} copied core hashes unchanged.`,
  );
} finally {
  rmSync(captureDirectory, { recursive: true, force: true });
}
