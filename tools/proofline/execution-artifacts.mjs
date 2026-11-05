import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const allocateInvocation = (root) => {
  const invocationId = randomUUID();
  const executionRoot = path.join(root, "artifacts/proofline");
  const directory = path.join(executionRoot, "runs", invocationId);
  mkdirSync(path.dirname(directory), { recursive: true });
  // Exclusive creation prevents even a UUID collision from overwriting an earlier run.
  mkdirSync(directory);
  return { invocationId, executionRoot, directory, relative: `runs/${invocationId}` };
};
export const finishInvocation = (invocation, record) => {
  const verification = `${invocation.relative}/verification.json`;
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(path.join(invocation.executionRoot, verification), bytes, { flag: "wx" });
  const reference = {
    version: 1,
    invocationId: invocation.invocationId,
    verification,
    sha256: sha256(bytes),
  };
  appendFileSync(
    path.join(invocation.executionRoot, "execution-index.jsonl"),
    `${JSON.stringify(reference)}\n`,
  );
  return reference;
};
export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const realDestination = (file) => {
  let ancestor = path.resolve(file);
  const tail = [];
  while (!existsSync(ancestor)) {
    tail.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error("Cannot resolve output destination");
    ancestor = parent;
  }
  return path.resolve(realpathSync(ancestor), ...tail);
};
const contains = (parent, child) => {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
};
export const assertCoverageDirectory = (
  directory,
  { protectedRoot = path.resolve("artifacts/proofline"), cwd = process.cwd() } = {},
) => {
  if (typeof directory !== "string" || !directory)
    throw new Error("Missing coverage output directory");
  const destination = realDestination(path.resolve(cwd, directory));
  const protectedPath = realDestination(protectedRoot);
  if (contains(destination, protectedPath) || contains(protectedPath, destination))
    throw new Error(`Coverage output overlaps protected execution evidence: ${directory}`);
};
export const assertControlledOutputs = (args, options = {}) => {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (/^--coverage[.-]reportsDirectory(?:=|$)/.test(arg)) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : args[++index];
      assertCoverageDirectory(value, options);
    }
    if (
      /^--(?:output(?:File|Dir)?(?:\.|=|$)|reporter(?:s)?(?:\.|=|$)|merge-reports|ui(?:=|$)|watch(?:=|$))/.test(
        arg,
      )
    )
      throw new Error(`Proofline controls output/reporters for execution: ${arg}`);
  }
};
