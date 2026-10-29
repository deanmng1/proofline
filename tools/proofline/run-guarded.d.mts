export type GuardedRunResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

export type GuardedRunOptions = {
  allowedOrigins: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: false;
  onSpawn?: (child: import("node:child_process").ChildProcess) => void;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
};

export function withProoflineGuard(
  command: string[],
  options: GuardedRunOptions,
): Promise<GuardedRunResult>;
