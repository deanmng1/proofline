import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default async function scenarioGlobalSetup() {
  const runId = process.env.PROOFLINE_SCENARIO_RUN_ID;
  if (!runId || !/^[a-f0-9-]{36}$/.test(runId))
    throw new Error("Playwright must provide a unique Proofline scenario run id.");
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const directory = path.join(
    repositoryRoot,
    ".superpowers/sdd/2026-10-28-portable-hybrid-workflow-harness/task-6-evidence/runs",
    runId,
  );
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
}
