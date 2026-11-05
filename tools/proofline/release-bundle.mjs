import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { productionAuditOptions } from "./check-production.mjs";
import {
  filesBelow,
  REQUIRED_RELEASE_GATES,
  readJson,
  requireCondition,
  sha256,
  validateAuthority,
  validateExecutionEvidence,
  validatePortabilityBundle,
} from "./release-evidence.mjs";
import { assertProductionNegativeArtifact } from "./src/production-negative.ts";

export { REQUIRED_RELEASE_GATES } from "./release-evidence.mjs";

export function createReleaseBundle({
  root,
  productionDirectory,
  evidenceDirectory,
  outputDirectory,
  authority,
  gateOutcomes,
}) {
  validateAuthority(authority);
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  requireCondition(
    git(["rev-parse", "HEAD"]) === authority.sourceCommit,
    "Source SHA differs from release authority",
  );
  const tree = git(["ls-tree", "-r", "-z", "HEAD"])
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const [metadata, file] = entry.split("\t");
      const [mode, type, oid] = metadata.split(" ");
      return { mode, type, oid, file };
    });
  const index = git(["ls-files", "--stage", "-z"]).split("\0").filter(Boolean);
  requireCondition(
    index.length === tree.length &&
      tree.every((entry) => index.includes(`${entry.mode} ${entry.oid} 0\t${entry.file}`)),
    "Dirty tracked source index cannot be released",
  );
  for (const entry of tree) {
    try {
      const file = path.join(root, entry.file);
      const stat = lstatSync(file);
      const bytes = stat.isSymbolicLink()
        ? readlinkSync(file, { encoding: "buffer" })
        : readFileSync(file);
      const oid = createHash("sha1")
        .update(Buffer.from(`blob ${bytes.length}\0`))
        .update(bytes)
        .digest("hex");
      requireCondition(
        entry.type === "blob" &&
          oid === entry.oid &&
          entry.mode ===
            (stat.isSymbolicLink() ? "120000" : stat.mode & 0o111 ? "100755" : "100644"),
        "Dirty tracked source cannot be released",
      );
    } catch (error) {
      throw new Error(`Dirty tracked source cannot be released: ${entry.file}`, { cause: error });
    }
  }
  requireCondition(
    REQUIRED_RELEASE_GATES.every((gate) => gateOutcomes?.[gate] === "success") &&
      Object.keys(gateOutcomes).length === REQUIRED_RELEASE_GATES.length,
    "Missing or failed required release gate",
  );
  const manifest = readJson(path.join(root, "proofline.harness.json"));
  requireCondition(
    path.resolve(root, manifest.production?.directory || "") ===
      path.resolve(productionDirectory) && Array.isArray(manifest.production?.forbiddenModules),
    "Missing production artifact authority",
  );
  filesBelow(productionDirectory);
  assertProductionNegativeArtifact(productionAuditOptions(manifest, root));
  const portability = validatePortabilityBundle({
    directory: path.join(root, "artifacts/portability"),
    authority,
  });
  const gates = validateExecutionEvidence({ directory: evidenceDirectory, authority, manifest });
  requireCondition(!existsSync(outputDirectory), "Release output directory already exists");
  mkdirSync(path.join(outputDirectory, ".vercel/output"), { recursive: true });
  cpSync(productionDirectory, path.join(outputDirectory, ".vercel/output/static"), {
    recursive: true,
    dereference: false,
  });
  writeFileSync(
    path.join(outputDirectory, ".vercel/output/config.json"),
    `${JSON.stringify({ version: 3, routes: [{ handle: "filesystem" }, { src: "/(.*)", dest: "/index.html" }] })}\n`,
  );
  cpSync(evidenceDirectory, path.join(outputDirectory, "evidence/proofline"), {
    recursive: true,
    dereference: false,
  });
  cpSync(
    path.join(root, "proofline.harness.json"),
    path.join(outputDirectory, "evidence/proofline.harness.json"),
  );
  cpSync(
    path.join(root, "artifacts/portability"),
    path.join(outputDirectory, "evidence/portability"),
    { recursive: true, dereference: false },
  );
  const inventory = Object.fromEntries(
    filesBelow(outputDirectory).map((file) => [
      file,
      sha256(readFileSync(path.join(outputDirectory, file))),
    ]),
  );
  const release = { version: 1, ...authority, gateOutcomes, gates, portability, inventory };
  writeFileSync(
    path.join(outputDirectory, "release.json"),
    `${JSON.stringify(release, null, 2)}\n`,
  );
  return release;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.cwd();
  const manifest = readJson(path.join(root, "proofline.harness.json"));
  const authority = {
    repository: process.env.GITHUB_REPOSITORY,
    sourceCommit: process.env.GITHUB_SHA,
    workflow: ".github/workflows/verify.yml",
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    sessionId: process.env.PROOFLINE_SESSION_ID,
  };
  createReleaseBundle({
    root,
    productionDirectory: path.resolve(root, manifest.production?.directory || ""),
    evidenceDirectory: path.resolve(root, "artifacts/proofline"),
    outputDirectory: path.resolve(root, "artifacts/release-bundle"),
    authority,
    gateOutcomes: JSON.parse(process.env.PROOFLINE_GATE_OUTCOMES || "null"),
  });
  process.stdout.write("Verified immutable production release bundle created.\n");
}
