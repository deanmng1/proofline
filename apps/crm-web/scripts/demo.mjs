import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchProoflineTestApp } from "../../../tools/proofline/run-guarded.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

/** Reference-only human demo. The portable server retains all capability/session authority. */
export const launchBuiltDemo = () => {
  const launch = launchProoflineTestApp(
    [
      process.execPath,
      "tools/proofline/serve-test-app.mjs",
      "--directory",
      "dist/crm-web-demo",
      "--port",
      "0",
    ],
    {
      cwd: repositoryRoot,
      allowedOrigins: ["http://127.0.0.1"],
      onStderr: (chunk) => process.stderr.write(chunk),
    },
  );
  return {
    ...launch,
    ready: launch.ready.then((ready) => ({
      ...ready,
      url: `${ready.origin}/app/crm/customers?__proofline_capability=${ready.capability}`,
    })),
  };
};

export const runDemo = async (args = []) => {
  if (args.length) throw new Error("The reference demo accepts no arguments; run pnpm demo.");
  const manifest = JSON.parse(
    readFileSync(path.join(repositoryRoot, "proofline.harness.json"), "utf8"),
  );
  const command = manifest.commands.buildDemo;
  const build = spawnSync(command.argv[0], command.argv.slice(1), {
    cwd: path.resolve(repositoryRoot, command.cwd),
    stdio: "inherit",
    shell: false,
  });
  if (build.error) throw build.error;
  if (build.status !== 0) return build.status ?? 1;
  const demo = launchBuiltDemo();
  const stop = () => demo.stop();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const ready = await demo.ready;
    process.stdout.write(
      `\nProofline isolated CRM demo\nOpen ${ready.url}\nSign in as Avery Stone. Press Ctrl+C to stop.\n`,
    );
    const result = await demo.completion;
    return result.code ?? 1;
  } finally {
    demo.stop();
    await demo.completion;
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  runDemo(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
