import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext } from "@playwright/test";
import { launchProoflineTestApp } from "../../../../tools/proofline/run-guarded.mjs";

export type WorkerScenarioServer = {
  origin: string;
  port: number;
  workerIndex: number;
  evidenceDirectory: string;
  storageState: { cookies: Array<Record<string, unknown>>; origins: [] };
  stop(): Promise<void>;
};

export async function startWorkerScenarioServer(
  browser: Browser,
  workerIndex: number,
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
  try {
    const ready = await launch.ready;
    bootstrap = await browser.newContext();
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
    const evidenceDirectory = path.join(
      repositoryRoot,
      ".superpowers/sdd/2026-10-28-portable-hybrid-workflow-harness/task-6-evidence",
      `workers-${process.ppid}`,
    );
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(
      path.join(evidenceDirectory, `${workerIndex}-${process.pid}.json`),
      `${JSON.stringify({ workerIndex, pid: process.pid, origin: ready.origin, port })}\n`,
    );
    let stopped = false;
    let stopRequested = false;
    let exitedBeforeStop = false;
    const observedCompletion = launch.completion.then((result) => {
      if (!stopRequested) exitedBeforeStop = true;
      return result;
    });
    return {
      origin: ready.origin,
      port,
      workerIndex,
      evidenceDirectory,
      storageState: { cookies: state.cookies, origins: [] },
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
  } catch (error) {
    launch.stop();
    await launch.completion.catch(() => undefined);
    throw error;
  } finally {
    await bootstrap?.close();
  }
}
