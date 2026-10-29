import { execFileSync } from "node:child_process";

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

const worktreeFiles = (cwd: string) => {
  const unstaged = git(cwd, ["diff", "--name-status", "-z", "--find-renames"]);
  const staged = git(cwd, ["diff", "--cached", "--name-status", "-z", "--find-renames"]);
  const untracked = git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const uncertainty = [unstaged, staged, untracked]
    .filter((result): result is Extract<GitResult, { ok: false }> => !result.ok)
    .map((result) => `unable to read working tree: ${result.error}`);

  return {
    files: mergeFiles(
      unstaged.ok ? parseNameStatus(unstaged.stdout) : [],
      staged.ok ? parseNameStatus(staged.stdout) : [],
      untracked.ok
        ? untracked.stdout
            .toString()
            .split("\0")
            .filter(Boolean)
            .map((path) => ({ path, status: "untracked" as const }))
        : [],
    ),
    uncertainty,
  };
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

  const committed = base
    ? git(cwd, ["diff", "--name-status", "-z", "--find-renames", `${base}...${head}`])
    : undefined;
  if (committed && !committed.ok) {
    uncertainty.push(`unable to read commit range: ${committed.error}`);
  }

  const workingTree = worktreeFiles(cwd);
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
    files: mergeFiles(committed?.ok ? parseNameStatus(committed.stdout) : [], workingTree.files),
    uncertainty: [...uncertainty, ...workingTree.uncertainty],
  };
};
