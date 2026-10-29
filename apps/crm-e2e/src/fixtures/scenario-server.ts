import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext } from "@playwright/test";
import { launchProoflineTestApp } from "../../../../tools/proofline/run-guarded.mjs";

export type WorkerScenarioServer = {
  origin: string;
  port: number;
  workerIndex: number;
  runId: string;
  evidenceDirectory: string;
  storageState: { cookies: Array<Record<string, unknown>>; origins: [] };
  stop(): Promise<void>;
  recordScenario(evidence: {
    scenarioId: string;
    runtimeId: string;
    marker: string;
  }): Promise<void>;
};

export type WorkerScenarioServerDependencies = {
  createBootstrapContext?: () => Promise<BrowserContext>;
  onReady?: (origin: string) => void;
};

const writeEvidence = async (file: string, value: unknown) => {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`);
  await rename(temporary, file);
};

export async function startWorkerScenarioServer(
  browser: Browser,
  workerIndex: number,
  dependencies: WorkerScenarioServerDependencies = {},
): Promise<WorkerScenarioServer> {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const manifest = JSON.parse(
    await readFile(path.join(repositoryRoot, "proofline.harness.json"), "utf8"),
  ) as { commands?: { testEntrypoint?: { argv?: string[] } } };
  const declared = manifest.commands?.testEntrypoint?.argv;
  if (
    !declared?.includes("tools/proofline/run-guarded.mjs") ||
    !declared.includes("tools/proofline/serve-test-app.mjs") ||
    !declared.includes("0")
  )
    throw new Error("Proofline worker startup drifted from the manifest testEntrypoint command.");
  const launch = launchProoflineTestApp(
    [
      process.execPath,
      path.join(repositoryRoot, "tools/proofline/serve-test-app.mjs"),
      "--directory",
      path.join(repositoryRoot, "dist/crm-web-test"),
      "--port",
      "0",
    ],
    {
      cwd: repositoryRoot,
      allowedOrigins: ["http://127.0.0.1"],
    },
  );
  let bootstrap: BrowserContext | undefined;
  let prepared:
    | {
        ready: Awaited<typeof launch.ready>;
        state: Awaited<ReturnType<BrowserContext["storageState"]>>;
        port: number;
        evidenceDirectory: string;
        runId: string;
      }
    | undefined;
  let setupError: unknown;
  try {
    const ready = await launch.ready;
    dependencies.onReady?.(ready.origin);
    bootstrap = await (dependencies.createBootstrapContext?.() ?? browser.newContext());
    const response = await bootstrap
      .newPage()
      .then((page) =>
        page.goto(
          `${ready.origin}/?__proofline_capability=${encodeURIComponent(ready.capability)}`,
        ),
      );
    if (!response?.ok()) throw new Error("Proofline worker server rejected its launch capability.");
    const state = await bootstrap.storageState();
    const port = Number(new URL(ready.origin).port);
    if (!Number.isInteger(port) || port <= 0)
      throw new Error("Proofline worker server did not select an OS-assigned numeric port.");
    const runId = process.env.PROOFLINE_SCENARIO_RUN_ID;
    if (!runId || !/^[a-f0-9-]{36}$/.test(runId))
      throw new Error("Proofline worker server requires the current unique scenario run id.");
    const evidenceDirectory = path.join(
      repositoryRoot,
      ".superpowers/sdd/2026-10-28-portable-hybrid-workflow-harness/task-6-evidence/runs",
      runId,
    );
    await mkdir(evidenceDirectory, { recursive: true });
    await writeEvidence(path.join(evidenceDirectory, `worker-${workerIndex}-${process.pid}.json`), {
      type: "worker",
      runId,
      workerIndex,
      pid: process.pid,
      origin: ready.origin,
      port,
    });
    prepared = { ready, state, port, evidenceDirectory, runId };
  } catch (error) {
    setupError = error;
  } finally {
    try {
      await bootstrap?.close();
    } catch (error) {
      setupError = setupError
        ? new AggregateError([setupError, error], "Worker setup and bootstrap close failed.")
        : error;
    }
  }
  if (setupError || !prepared) {
    const errors = setupError ? [setupError] : [new Error("Worker setup did not complete.")];
    launch.stop();
    try {
      await Promise.race([
        launch.completion,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Proofline worker server did not stop in time.")),
            5000,
          ),
        ),
      ]);
    } catch (error) {
      errors.push(error);
      launch.stop("SIGKILL");
      await launch.completion.catch((killError) => errors.push(killError));
    }
    throw new AggregateError(errors, "Proofline worker server setup failed and was shut down.");
  }
  let stopped = false;
  let stopRequested = false;
  let exitedBeforeStop = false;
  const observedCompletion = launch.completion.then((result) => {
    if (!stopRequested) exitedBeforeStop = true;
    return result;
  });
  return {
    origin: prepared.ready.origin,
    port: prepared.port,
    workerIndex,
    runId: prepared.runId,
    evidenceDirectory: prepared.evidenceDirectory,
    storageState: { cookies: prepared.state.cookies, origins: [] },
    async recordScenario(evidence) {
      await writeEvidence(
        path.join(prepared.evidenceDirectory, `scenario-${workerIndex}-${randomUUID()}.json`),
        {
          type: "scenario",
          runId: prepared.runId,
          workerIndex,
          port: prepared.port,
          ...evidence,
        },
      );
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      stopRequested = true;
      launch.stop();
      const result = await Promise.race([
        observedCompletion,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Proofline worker server did not stop in time.")),
            5000,
          ),
        ),
      ]).catch(async (error) => {
        launch.stop("SIGKILL");
        await launch.completion.catch(() => undefined);
        throw error;
      });
      if (exitedBeforeStop)
        throw new Error("Proofline worker server exited before fixture teardown.");
      if (result.code !== 0 && result.signal !== "SIGTERM")
        throw new Error(
          `Proofline worker server stopped unexpectedly code=${result.code} signal=${result.signal}`,
        );
    },
  };
}
