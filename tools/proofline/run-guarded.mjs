import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeNodeArgv, guardedEnvironment } from "./guard-policy.mjs";

export const withProoflineGuard = (command, options = {}) => {
  if (
    !Array.isArray(command) ||
    command.length === 0 ||
    command.some((part) => typeof part !== "string")
  )
    throw new Error("Proofline guarded commands require a non-empty structured argv array.");
  if (options.shell) throw new Error("Proofline guarded commands never execute through a shell.");
  let executable;
  try {
    executable = command[0] === "node" ? realpathSync(process.execPath) : realpathSync(command[0]);
  } catch {
    throw new Error("Proofline guarded launcher requires the trusted Node executable.");
  }
  if (executable !== realpathSync(process.execPath))
    throw new Error(
      "Proofline guarded launcher rejects targets that cannot inherit the Node preload.",
    );
  assertSafeNodeArgv(command.slice(1));
  const env = guardedEnvironment({
    env: options.env,
    allowedOrigins: options.allowedOrigins,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(executable, command.slice(1), {
      cwd: options.cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    options.onSpawn?.(child);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      options.onStdout?.(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      options.onStderr?.(chunk);
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
};

const runCli = async () => {
  const separator = process.argv.indexOf("--", 2);
  if (separator < 0) throw new Error("Usage: run-guarded.mjs --allow-origin <origin> -- <argv...>");
  const options = process.argv.slice(2, separator);
  const allowedOrigins = [];
  for (let index = 0; index < options.length; index += 1) {
    if (options[index] !== "--allow-origin" || !options[index + 1])
      throw new Error(`Unknown guarded launcher option: ${options[index] ?? "<missing>"}`);
    allowedOrigins.push(options[index + 1]);
    index += 1;
  }
  let guardedChild;
  const forwardSignal = (signal) => guardedChild?.kill(signal);
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));
  process.once("SIGINT", () => forwardSignal("SIGINT"));
  const result = await withProoflineGuard(process.argv.slice(separator + 1), {
    allowedOrigins,
    cwd: process.cwd(),
    onSpawn: (child) => {
      guardedChild = child;
    },
    onStdout: (chunk) => process.stdout.write(chunk),
    onStderr: (chunk) => process.stderr.write(chunk),
  });
  if (result.signal) process.kill(process.pid, result.signal);
  else process.exitCode = result.code ?? 1;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
