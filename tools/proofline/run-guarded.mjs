import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSafeNodeArgv,
  guardedEnvironment,
  prooflineDelegatedPolicy,
} from "./guard-policy.mjs";

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
    allowedChildCapabilities: options.allowedChildCapabilities,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(executable, command.slice(1), {
      cwd: options.cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      [prooflineDelegatedPolicy]: true,
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

export const launchProoflineTestApp = (command, options = {}) => {
  const capability = randomBytes(32).toString("base64url");
  let guardedChild;
  let readinessBuffer = "";
  let readinessSettled = false;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const completion = withProoflineGuard(command, {
    ...options,
    env: {
      ...(options.env ?? {}),
      PROOFLINE_TEST_CAPABILITY: capability,
    },
    onSpawn: (child) => {
      guardedChild = child;
      options.onSpawn?.(child);
    },
    onStdout: (chunk) => {
      if (readinessSettled) {
        options.onStdout?.(chunk);
        return;
      }
      readinessBuffer += chunk;
      const newline = readinessBuffer.indexOf("\n");
      if (newline < 0) return;
      try {
        const parsed = JSON.parse(readinessBuffer.slice(0, newline));
        if (!parsed || typeof parsed.origin !== "string") throw new Error();
        const origin = new URL(parsed.origin);
        if (origin.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(origin.hostname))
          throw new Error();
        readinessSettled = true;
        resolveReady(Object.freeze({ capability, origin: origin.origin }));
        const remainder = readinessBuffer.slice(newline + 1);
        if (remainder) options.onStdout?.(remainder);
      } catch {
        readinessSettled = true;
        guardedChild?.kill("SIGTERM");
        rejectReady(new Error("Proofline test server emitted invalid readiness output."));
      }
    },
  });
  void completion.then(
    (result) => {
      if (readinessSettled) return;
      readinessSettled = true;
      rejectReady(
        new Error(
          `Proofline test server exited before readiness (code=${result.code ?? "null"}, signal=${result.signal ?? "none"}).`,
        ),
      );
    },
    (error) => {
      if (readinessSettled) return;
      readinessSettled = true;
      rejectReady(error);
    },
  );
  return {
    ready,
    completion,
    stop: (signal = "SIGTERM") => guardedChild?.kill(signal) ?? false,
  };
};

const runCli = async () => {
  const separator = process.argv.indexOf("--", 2);
  if (separator < 0) throw new Error("Usage: run-guarded.mjs --allow-origin <origin> -- <argv...>");
  const options = process.argv.slice(2, separator);
  const allowedOrigins = [];
  const allowedChildCapabilities = [];
  let testApp = false;
  for (let index = 0; index < options.length; index += 1) {
    if (options[index] === "--test-app") {
      if (testApp) throw new Error("Duplicate guarded launcher option: --test-app");
      testApp = true;
      continue;
    }
    if (options[index] === "--allow-child-capability" && options[index + 1]) {
      allowedChildCapabilities.push(JSON.parse(options[index + 1]));
      index += 1;
      continue;
    }
    if (options[index] !== "--allow-origin" || !options[index + 1])
      throw new Error(`Unknown guarded launcher option: ${options[index] ?? "<missing>"}`);
    allowedOrigins.push(options[index + 1]);
    index += 1;
  }
  let guardedChild;
  const forwardSignal = (signal) => guardedChild?.kill(signal);
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));
  process.once("SIGINT", () => forwardSignal("SIGINT"));
  const guardedOptions = {
    allowedOrigins,
    allowedChildCapabilities,
    cwd: process.cwd(),
    onSpawn: (child) => {
      guardedChild = child;
    },
    onStdout: (chunk) => process.stdout.write(chunk),
    onStderr: (chunk) => process.stderr.write(chunk),
  };
  let result;
  if (testApp) {
    const launch = launchProoflineTestApp(process.argv.slice(separator + 1), guardedOptions);
    const ready = await launch.ready;
    process.stdout.write(`${JSON.stringify(ready)}\n`);
    result = await launch.completion;
  } else {
    result = await withProoflineGuard(process.argv.slice(separator + 1), guardedOptions);
  }
  if (result.signal) process.kill(process.pid, result.signal);
  else process.exitCode = result.code ?? 1;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
