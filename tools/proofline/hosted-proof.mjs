import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createGithubReleaseApi, githubTransportProvenance } from "./github-release-api.mjs";
import { filesBelow, requireCondition, sha256 } from "./release-evidence.mjs";
import {
  resolveAndDownloadTaggedVerification,
  resolveAndDownloadVerification,
} from "./release-verify.mjs";

function physicalPath(file) {
  if (existsSync(file)) return realpathSync(file);
  const parent = path.dirname(file);
  requireCondition(parent !== file, "Unresolvable output path");
  // Refuse dangling symlinks instead of treating them as a new output directory.
  try {
    requireCondition(!lstatSync(file).isSymbolicLink(), "Unsafe output symlink");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return path.join(physicalPath(parent), path.basename(file));
}
function outputPaths(directory, receipt) {
  requireCondition(
    typeof directory === "string" &&
      path.isAbsolute(directory) &&
      typeof receipt === "string" &&
      path.isAbsolute(receipt),
    "Audit outputs must be absolute paths",
  );
  const relative = path.relative(physicalPath(directory), physicalPath(receipt));
  requireCondition(
    relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative),
    "Receipt must be outside the inventoried artifact",
  );
  requireCondition(!existsSync(receipt), "Observation receipt already exists");
}
function verifierProvenance() {
  const root = path.resolve(import.meta.dirname, "../..");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  requireCondition(/^[a-f0-9]{40}$/.test(commit), "Missing verifier source commit");
  const sourceFiles = filesBelow(import.meta.dirname).filter(
    (file) => /\.(?:mjs|ts)$/.test(file) && !file.endsWith(".test.ts"),
  );
  const source = Object.fromEntries(
    sourceFiles.map((file) => [file, sha256(readFileSync(path.join(import.meta.dirname, file)))]),
  );
  const headFiles = execFileSync("git", ["ls-tree", "-r", "-z", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.split("\t"))
    .filter(
      ([, file]) =>
        file.startsWith("tools/proofline/") &&
        /\.(?:mjs|ts)$/.test(file) &&
        !file.endsWith(".test.ts"),
    );
  const head = new Map(
    headFiles.map(([metadata, file]) => [
      file.slice("tools/proofline/".length),
      metadata.split(" ")[2],
    ]),
  );
  const dirty =
    head.size !== sourceFiles.length ||
    sourceFiles.some((file) => {
      const bytes = readFileSync(path.join(import.meta.dirname, file));
      return (
        head.get(file) !==
        createHash("sha1")
          .update(Buffer.from(`blob ${bytes.length}\0`))
          .update(bytes)
          .digest("hex")
      );
    });
  return { commit, dirty, sourceDigest: `sha256:${sha256(JSON.stringify(source))}`, source };
}
export function parseHostedProofArgs(argv) {
  const names = new Map([
    ["--repository", "repository"],
    ["--commit", "sourceCommit"],
    ["--tag", "tag"],
    ["--directory", "directory"],
    ["--receipt", "receipt"],
  ]);
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = names.get(argv[index]);
    requireCondition(
      name &&
        !Object.hasOwn(options, name) &&
        typeof argv[index + 1] === "string" &&
        argv[index + 1].length > 0 &&
        !argv[index + 1].startsWith("--"),
      "Invalid or duplicate hosted-proof argument",
    );
    options[name] = argv[index + 1];
  }
  requireCondition(
    typeof options.repository === "string" &&
      Boolean(options.sourceCommit) !== Boolean(options.tag),
    "Supply repository and exactly one commit or tag",
  );
  requireCondition(
    !options.sourceCommit || /^[a-f0-9]{40}$/.test(options.sourceCommit),
    "Commit must be an exact lowercase SHA",
  );
  requireCondition(
    typeof options.directory === "string" &&
      path.isAbsolute(options.directory) &&
      typeof options.receipt === "string" &&
      path.isAbsolute(options.receipt),
    "Audit outputs must be absolute paths",
  );
  return options;
}
export async function auditHostedProof({
  repository,
  sourceCommit,
  tag,
  token,
  directory,
  receipt,
  api,
  list,
  now = new Date(),
}) {
  outputPaths(directory, receipt);
  requireCondition(Boolean(sourceCommit) !== Boolean(tag), "Supply exactly one commit or tag");
  requireCondition(
    now instanceof Date && Number.isFinite(now.getTime()),
    "Invalid observation clock",
  );
  requireCondition(Boolean(api) === Boolean(list), "Supply both API and collection transport");
  const transport = api ? { api, list } : createGithubReleaseApi({ token });
  const mode = githubTransportProvenance(transport.api, transport.list);
  const verifier = verifierProvenance();
  const options = { repository, sourceCommit, tag, token, directory, ...transport };
  const result = await (tag
    ? resolveAndDownloadTaggedVerification(options)
    : resolveAndDownloadVerification(options));
  // Check again after extraction, including physical paths through symlinked parents.
  outputPaths(directory, receipt);
  const observation = {
    version: 1,
    mode,
    provenance: {
      transport: mode === "hosted" ? "github-com-api" : "injected-offline",
      authoritative: false,
    },
    observedAt: now.toISOString(),
    verifier,
    observation: result.observation,
  };
  mkdirSync(path.dirname(receipt), { recursive: true });
  writeFileSync(receipt, `${JSON.stringify(observation, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return observation;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await auditHostedProof({
      ...parseHostedProofArgs(process.argv.slice(2)),
      token: process.env.GITHUB_TOKEN,
    });
    process.stdout.write(
      "Hosted artifact verification completed; supplementary observation saved.\n",
    );
  } catch {
    // Input/API/native failures can contain untrusted text. Keep CLI diagnostics credential-safe.
    process.stderr.write(
      "Hosted artifact verification failed; no successful observation was written. Check exact source, current trusted run/artifact authority and output paths.\n",
    );
    process.exitCode = 1;
  }
}
