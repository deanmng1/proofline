import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createGithubReleaseApi } from "./github-release-api.mjs";
import { extractReleaseZip } from "./release-archive.mjs";
import {
  filesBelow,
  REQUIRED_RELEASE_GATES,
  readJson,
  requireCondition,
  safeRelative,
  sha256,
  validateAuthority,
  validateExecutionEvidence,
  validatePortabilityBundle,
} from "./release-evidence.mjs";

export function selectTrustedVerification({
  repository,
  sourceCommit,
  workflow,
  runs,
  artifacts,
  now = new Date(),
}) {
  requireCondition(
    workflow?.path === ".github/workflows/verify.yml" && Number.isSafeInteger(workflow.id),
    "Wrong trusted workflow",
  );
  const matches = runs.filter(
    (run) =>
      run.repository?.full_name === repository &&
      run.head_sha === sourceCommit &&
      run.path === workflow.path &&
      run.workflow_id === workflow.id &&
      run.event === "push" &&
      run.head_branch === "main" &&
      run.status === "completed" &&
      run.conclusion === "success" &&
      Number.isSafeInteger(run.id) &&
      run.id > 0 &&
      Number.isSafeInteger(run.run_attempt) &&
      run.run_attempt > 0,
  );
  requireCondition(
    matches.length === 1,
    "Missing or ambiguous successful trusted verification run",
  );
  const run = matches[0];
  const expectedName = `proofline-release-${sourceCommit}-${run.id}-${run.run_attempt}`;
  const candidates = artifacts.filter((artifact) => artifact.name === expectedName);
  requireCondition(candidates.length === 1, "Missing or ambiguous exact release artifact");
  const artifact = candidates[0];
  requireCondition(
    Number.isSafeInteger(artifact.id) &&
      artifact.id > 0 &&
      artifact.expired === false &&
      Number.isFinite(Date.parse(artifact.expires_at)) &&
      Date.parse(artifact.expires_at) > now.getTime() &&
      /^sha256:[a-f0-9]{64}$/.test(artifact.digest) &&
      artifact.workflow_run?.id === run.id &&
      artifact.workflow_run?.head_sha === sourceCommit &&
      artifact.workflow_run?.head_branch === "main",
    "Expired, wrong-run or invalid release artifact",
  );
  return {
    run,
    artifact,
    authority: {
      repository,
      sourceCommit,
      workflow: workflow.path,
      runId: String(run.id),
      runAttempt: String(run.run_attempt),
      sessionId: `${run.id}-${run.run_attempt}`,
    },
  };
}
export function verifyReleaseDirectory({ directory, authority }) {
  validateAuthority(authority);
  const files = filesBelow(directory);
  const release = readJson(path.join(directory, "release.json"));
  requireCondition(
    release.version === 1 &&
      Object.entries(authority).every(([key, value]) => release[key] === value),
    "Wrong embedded release authority",
  );
  requireCondition(
    release.inventory &&
      typeof release.inventory === "object" &&
      !Array.isArray(release.inventory) &&
      Object.keys(release.inventory).length > 0,
    "Missing release inventory",
  );
  const inventory = Object.keys(release.inventory).sort();
  requireCondition(
    JSON.stringify(files.filter((file) => file !== "release.json").sort()) ===
      JSON.stringify(inventory),
    "Missing or extra release inventory files",
  );
  for (const file of inventory) {
    safeRelative(file);
    requireCondition(
      /^[a-f0-9]{64}$/.test(release.inventory[file]) &&
        sha256(readFileSync(path.join(directory, file))) === release.inventory[file],
      `Tampered release file ${file}`,
    );
  }
  requireCondition(
    REQUIRED_RELEASE_GATES.every((gate) => release.gateOutcomes?.[gate] === "success") &&
      Object.keys(release.gateOutcomes).length === REQUIRED_RELEASE_GATES.length,
    "Missing or failed release gates",
  );
  requireCondition(
    readJson(path.join(directory, ".vercel/output/config.json")).version === 3,
    "Missing prebuilt Vercel output",
  );
  requireCondition(
    files.includes(".vercel/output/static/index.html"),
    "Missing production entrypoint",
  );
  const summaries = validateExecutionEvidence({
    directory: path.join(directory, "evidence/proofline"),
    authority,
    manifest: readJson(path.join(directory, "evidence/proofline.harness.json")),
  });
  requireCondition(
    JSON.stringify(summaries) === JSON.stringify(release.gates),
    "Substituted release execution summaries",
  );
  const portability = validatePortabilityBundle({
    directory: path.join(directory, "evidence/portability"),
    authority,
  });
  requireCondition(
    JSON.stringify(portability) === JSON.stringify(release.portability),
    "Substituted portability summary",
  );
  return release;
}
export function verifyReleaseArchive({ archiveBytes, digest, directory, authority }) {
  requireCondition(
    /^sha256:[a-f0-9]{64}$/.test(digest) && `sha256:${sha256(archiveBytes)}` === digest,
    "Release archive digest mismatch",
  );
  requireCondition(!existsSync(directory), "Archive output already exists");
  mkdirSync(directory, { recursive: true });
  try {
    extractReleaseZip(archiveBytes, directory);
  } catch {
    throw new Error("Unsafe or malformed release archive path, symlink or content");
  }
  return verifyReleaseDirectory({ directory, authority });
}
function transportFor({ token, api, list }) {
  // Legacy callers may replace either seam independently. Any mixed/custom pair
  // remains fixture provenance in the observation API.
  const defaults = !api || !list ? createGithubReleaseApi({ token }) : null;
  return { api: api ?? defaults.api, list: list ?? defaults.list };
}
async function resolveTag({ repository, tag, token, api }) {
  requireCondition(
    typeof tag === "string" &&
      tag.length > 0 &&
      tag.length <= 1024 &&
      ![...tag].some(
        (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
      ) &&
      !/[~^:?*[\\]/.test(tag) &&
      !tag.includes("..") &&
      !tag.includes("@{") &&
      !tag.startsWith("/") &&
      !tag.endsWith("/") &&
      !tag.endsWith(".") &&
      !tag.includes("//") &&
      !tag.split("/").some((part) => part.startsWith(".") || part.endsWith(".lock")),
    "Invalid release tag",
  );
  let target = (await api(repository, `/git/ref/tags/${encodeURIComponent(tag)}`, token)).object;
  const visited = new Set();
  for (let depth = 0; target?.type === "tag" && depth < 10; depth++) {
    requireCondition(/^[a-f0-9]{40}$/.test(target.sha), "Invalid annotated tag identity");
    requireCondition(!visited.has(target.sha), "Cyclic release tag");
    visited.add(target.sha);
    target = (await api(repository, `/git/tags/${target.sha}`, token)).object;
  }
  requireCondition(
    target?.type === "commit" && /^[a-f0-9]{40}$/.test(target.sha),
    "Release tag does not resolve to a commit",
  );
  return { sourceCommit: target.sha, chain: [...visited] };
}
export async function resolveAndDownloadVerification({
  repository,
  sourceCommit,
  token,
  directory,
  api,
  list,
}) {
  requireCondition(
    /^[a-f0-9]{40}$/.test(sourceCommit) && typeof token === "string" && token.length > 0,
    "Missing exact source commit or API token",
  );
  ({ api, list } = transportFor({ token, api, list }));
  const workflow = await api(repository, "/actions/workflows/verify.yml", token);
  const runs = await list(
    repository,
    `/actions/workflows/${workflow.id}/runs?head_sha=${sourceCommit}&event=push&branch=main&status=success`,
    "workflow_runs",
    token,
  );
  const matching = runs.filter(
    (run) => run.head_sha === sourceCommit && run.conclusion === "success",
  );
  requireCondition(matching.length === 1, "Missing or ambiguous release verification run");
  const artifacts = await list(
    repository,
    `/actions/runs/${matching[0].id}/artifacts`,
    "artifacts",
    token,
  );
  const selected = selectTrustedVerification({
    repository,
    sourceCommit,
    workflow,
    runs,
    artifacts,
  });
  const archiveBytes = await api(
    repository,
    `/actions/artifacts/${selected.artifact.id}/zip`,
    token,
    true,
  );
  const release = verifyReleaseArchive({
    archiveBytes,
    digest: selected.artifact.digest,
    directory,
    authority: selected.authority,
  });
  const current = await api(repository, `/actions/runs/${selected.run.id}`, token);
  const artifact = await api(repository, `/actions/artifacts/${selected.artifact.id}`, token);
  const refreshed = selectTrustedVerification({
    repository,
    sourceCommit,
    workflow,
    runs: [current],
    artifacts: [artifact],
  });
  requireCondition(
    current.id === selected.run.id &&
      artifact.id === selected.artifact.id &&
      current.run_attempt === selected.run.run_attempt &&
      artifact.digest === selected.artifact.digest &&
      JSON.stringify(refreshed.authority) === JSON.stringify(selected.authority),
    "Release authority changed during download",
  );
  return {
    release,
    observation: {
      ...selected.authority,
      workflowId: String(workflow.id),
      artifactId: String(artifact.id),
      artifactName: artifact.name,
      archiveDigest: artifact.digest,
      archiveBytes: archiveBytes.length,
      releaseManifestDigest: `sha256:${sha256(readFileSync(path.join(directory, "release.json")))}`,
      inventoryCount: Object.keys(release.inventory).length,
      api: {
        run: `https://api.github.com/repos/${repository}/actions/runs/${current.id}`,
        artifact: `https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}`,
      },
      gates: release.gates,
      gateOutcomes: release.gateOutcomes,
      portability: release.portability,
    },
  };
}
export async function resolveAndDownloadTaggedVerification(options) {
  const { repository, tag, token } = options;
  requireCondition(
    typeof token === "string" && token.length > 0,
    "Missing release tag or API token",
  );
  const transport = transportFor(options);
  const initial = await resolveTag({ repository, tag, token, api: transport.api });
  const result = await resolveAndDownloadVerification({
    ...options,
    ...transport,
    sourceCommit: initial.sourceCommit,
  });
  const final = await resolveTag({ repository, tag, token, api: transport.api });
  requireCondition(
    JSON.stringify(initial) === JSON.stringify(final),
    "Release tag changed during download",
  );
  return { ...result, observation: { ...result.observation, tag } };
}
export async function resolveAndDownloadRelease(options) {
  return (await resolveAndDownloadTaggedVerification(options)).release;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directory = path.resolve(process.cwd(), "verified-release");
  await resolveAndDownloadRelease({
    repository: process.env.GITHUB_REPOSITORY,
    tag: process.env.PROOFLINE_RELEASE_TAG,
    token: process.env.GITHUB_TOKEN,
    directory,
  });
  process.stdout.write("Trusted release artifact verified; exact prebuilt output ready.\n");
}
