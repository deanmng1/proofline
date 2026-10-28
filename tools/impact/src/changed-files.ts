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
    if (status === "renamed") {
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
    files.set(file.path, file);
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
  const head = resolveRevision(cwd, env.IMPACT_HEAD || env.GITHUB_SHA || "HEAD") ?? "HEAD";
  const ci = env.CI === "true";
  const baseCandidates = ci
    ? [env.IMPACT_BASE, env.GITHUB_BASE_SHA].filter((candidate): candidate is string =>
        Boolean(candidate),
      )
    : ["origin/main", "main", "HEAD~1"];
  const base = baseCandidates
    .map((candidate) => {
      const result = git(cwd, ["merge-base", candidate, head]);
      return result.ok ? result.stdout.toString().trim() : undefined;
    })
    .find(Boolean);
  const uncertainty: string[] = [];

  if (!base) {
    uncertainty.push(
      ci
        ? "missing CI base revision; set IMPACT_BASE or GITHUB_BASE_SHA"
        : "missing local merge base; compare against origin/main, main, or HEAD~1",
    );
  }

  const committed = base
    ? git(cwd, ["diff", "--name-status", "-z", "--find-renames", `${base}...${head}`])
    : undefined;
  if (committed && !committed.ok) {
    uncertainty.push(`unable to read commit range: ${committed.error}`);
  }

  const workingTree = worktreeFiles(cwd);
  return {
    base: base ?? null,
    head,
    files: mergeFiles(committed?.ok ? parseNameStatus(committed.stdout) : [], workingTree.files),
    uncertainty: [...uncertainty, ...workingTree.uncertainty],
  };
};
