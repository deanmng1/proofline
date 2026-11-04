import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync, realpathSync, type Stats } from "node:fs";
import path from "node:path";

import type { ChangedFile, ChangeManifest, ChangeStatus } from "./types.ts";

type GitResult =
  | { ok: true; stdout: Buffer }
  | {
      ok: false;
      error: string;
    };

const git = (cwd: string, args: string[]): GitResult => {
  try {
    return {
      ok: true,
      stdout: execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const resolveRevision = (cwd: string, revision: string) => {
  const result = git(cwd, ["rev-parse", "--verify", `${revision}^{commit}`]);
  return result.ok ? result.stdout.toString().trim() : undefined;
};

const parseStatus = (status: string): ChangeStatus => {
  switch (status[0]) {
    case "A":
    case "C":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    default:
      return "modified";
  }
};

export const parseNameStatus = (output: Buffer): ChangedFile[] => {
  const values = output.toString().split("\0").filter(Boolean);
  const changed: ChangedFile[] = [];

  for (let index = 0; index < values.length; ) {
    const rawStatus = values[index++];
    if (!rawStatus) {
      continue;
    }

    const status = parseStatus(rawStatus);
    if (status === "renamed" || rawStatus.startsWith("C")) {
      const previousPath = values[index++];
      const path = values[index++];
      if (path && previousPath) {
        changed.push({ path, previousPath, status });
      }
      continue;
    }

    const path = values[index++];
    if (path) {
      changed.push({ path, status });
    }
  }

  return changed;
};

const mergeFiles = (...groups: ChangedFile[][]) => {
  const files = new Map<string, ChangedFile>();
  for (const file of groups.flat()) {
    const existing = files.get(file.path);
    files.set(
      file.path,
      existing?.previousPath && !file.previousPath
        ? { ...file, previousPath: existing.previousPath, status: "renamed" }
        : file,
    );
  }
  return [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
};

type GitEntry = { mode: string; oid: string };
const parseEntries = (output: Buffer, index: boolean): Map<string, GitEntry> => {
  const entries = new Map<string, GitEntry>();
  for (const record of output.toString().split("\0").filter(Boolean)) {
    const separator = record.indexOf("\t");
    const metadata = record.slice(0, separator).split(" ");
    const file = record.slice(separator + 1);
    const [mode, typeOrOid, oidOrStage] = metadata;
    const oid = index ? typeOrOid : oidOrStage;
    if (
      separator < 0 ||
      metadata.length !== 3 ||
      !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(oid) ||
      (index && oidOrStage !== "0") ||
      !["100644", "100755", "120000"].includes(mode) ||
      (!index && typeOrOid !== "blob") ||
      path.isAbsolute(file) ||
      file.split("/").some((part) => !part || part === "." || part === "..") ||
      entries.has(file)
    )
      throw new Error("unsupported or ambiguous Git index/tree entry");
    entries.set(file, { mode, oid });
  }
  return entries;
};
const requiredGit = (cwd: string, argv: string[]) => {
  const result = git(cwd, argv);
  if (!result.ok) throw new Error(result.error);
  return result.stdout;
};
const entryChanges = (
  before: Map<string, GitEntry>,
  after: Map<string, GitEntry>,
): ChangedFile[] => {
  const changes: ChangedFile[] = [];
  for (const [file, entry] of before) {
    const next = after.get(file);
    if (!next) changes.push({ path: file, status: "deleted" });
    else if (next.oid !== entry.oid || next.mode !== entry.mode)
      changes.push({ path: file, status: "modified" });
  }
  for (const file of after.keys())
    if (!before.has(file)) changes.push({ path: file, status: "added" });
  // Renames deliberately retain both paths as deletion/addition. This conservative evidence
  // cannot conceal either former or current ownership and requires no content conversion.
  return changes;
};
const treeEntries = (cwd: string, revision: string) =>
  parseEntries(requiredGit(cwd, ["ls-tree", "-r", "-z", revision]), false);

export const readRepositoryChanges = ({
  cwd,
  base,
  head,
}: {
  cwd: string;
  base?: string | null;
  head?: string | null;
}) => {
  const files: ChangedFile[][] = [];
  const errors: string[] = [];
  const inspect = (label: string, read: () => ChangedFile[]) => {
    try {
      files.push(read());
    } catch (error) {
      errors.push(
        `unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  if (base && head)
    inspect("commit range", () => entryChanges(treeEntries(cwd, base), treeEntries(cwd, head)));
  inspect("working tree", () => {
    const index = parseEntries(requiredGit(cwd, ["ls-files", "--stage", "-z"]), true);
    const working = new Map<string, GitEntry>();
    const root = realpathSync(cwd);
    for (const [file, entry] of index) {
      const absolute = path.join(root, file);
      let stat: Stats;
      try {
        stat = lstatSync(absolute);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      const parent = realpathSync(path.dirname(absolute));
      if (parent !== root && !parent.startsWith(`${root}${path.sep}`))
        throw new Error("tracked path escapes repository");
      if (!stat.isSymbolicLink() && !stat.isFile())
        throw new Error("unsupported tracked file kind");
      const bytes = stat.isSymbolicLink()
        ? readlinkSync(absolute, { encoding: "buffer" })
        : readFileSync(absolute);
      const mode = stat.isSymbolicLink() ? "120000" : stat.mode & 0o111 ? "100755" : "100644";
      // Hash the bytes ourselves: git diff/add/update-index may execute clean/process filters
      // even for name-only comparisons or racily clean index entries. Raw comparisons can
      // conservatively report transformed content as modified, never silently omit it.
      const oid = createHash(entry.oid.length === 64 ? "sha256" : "sha1")
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest("hex");
      working.set(file, { mode, oid });
    }
    return mergeFiles(entryChanges(treeEntries(cwd, "HEAD"), index), entryChanges(index, working));
  });
  inspect("untracked files", () =>
    requiredGit(cwd, ["ls-files", "--others", "--exclude-standard", "-z"])
      .toString()
      .split("\0")
      .filter(Boolean)
      .map((file) => ({ path: file, status: "untracked" as const })),
  );
  return { files: mergeFiles(...files), errors };
};

export const readChangedFiles = ({
  cwd,
  env = process.env,
}: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): ChangeManifest => {
  const uncertainty: string[] = [];
  const requestedHead = env.IMPACT_HEAD ?? env.GITHUB_SHA ?? "HEAD";
  const resolvedHead = resolveRevision(cwd, requestedHead);
  const head = resolvedHead ?? requestedHead;
  const checkoutHead = resolveRevision(cwd, "HEAD");
  if (resolvedHead && checkoutHead !== resolvedHead)
    uncertainty.push("requested head differs from checkout used for discovery");
  const shallow = git(cwd, ["rev-parse", "--is-shallow-repository"]);
  if (!shallow.ok || shallow.stdout.toString().trim() !== "false")
    uncertainty.push("shallow or unverifiable repository history");
  if (!resolvedHead) uncertainty.push(`unresolved supplied head:${requestedHead}`);
  const ci =
    Boolean(env.CI && !["false", "0"].includes(env.CI.toLowerCase())) ||
    Boolean(env.GITHUB_ACTIONS);
  const suppliedBase = env.IMPACT_BASE ?? env.GITHUB_BASE_SHA;
  const baseCandidates =
    suppliedBase !== undefined ? [suppliedBase] : ci ? [] : ["origin/main", "main", "HEAD~1"];
  let resolvedBase: string | undefined;
  const base = resolvedHead
    ? baseCandidates
        .map((candidate) => {
          const revision = resolveRevision(cwd, candidate);
          if (!revision) return undefined;
          const result = git(cwd, ["merge-base", "--all", revision, resolvedHead]);
          const bases = result.ok
            ? result.stdout.toString().trim().split(/\s+/).filter(Boolean)
            : [];
          if (bases.length !== 1) return undefined;
          resolvedBase = revision;
          return bases[0];
        })
        .find(Boolean)
    : undefined;
  if (!base)
    uncertainty.push(
      suppliedBase !== undefined
        ? `unresolved supplied base or merge base:${suppliedBase}`
        : ci
          ? "missing CI base revision; set IMPACT_BASE or GITHUB_BASE_SHA"
          : "missing local merge base",
    );

  const changes = readRepositoryChanges({ cwd, base, head });
  return {
    revisions: {
      requestedBase: suppliedBase ?? null,
      requestedHead,
      resolvedBase: resolvedBase ?? null,
      resolvedHead: resolvedHead ?? null,
      mergeBase: base ?? null,
      checkoutHead: checkoutHead ?? null,
      historyComplete: shallow.ok && shallow.stdout.toString().trim() === "false",
    },
    base: base ?? null,
    head,
    files: changes.files,
    uncertainty: [...uncertainty, ...changes.errors],
  };
};
