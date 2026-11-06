import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPhysical,
  collectSourceInventory,
  fileHash,
  fullSource,
  hash,
  validateInventory,
} from "./onboarding-source.mjs";

export { collectSourceInventory, validateInventory } from "./onboarding-source.mjs";

const receiptName = ".proofline-receipt.json";
const markerName = ".proofline-installing.json";
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const exact = (left, right) => JSON.stringify(left) === JSON.stringify(right);
export const validateReceipt = (receipt, trustedInventory) => {
  if (
    !receipt ||
    Object.keys(receipt).sort().join() !== "core,mode,schemaVersion,source,templates,version" ||
    !["core", "starter"].includes(receipt.mode)
  )
    throw new Error("Invalid installation receipt");
  validateInventory({
    schemaVersion: receipt.schemaVersion,
    source: receipt.source,
    version: receipt.version,
    core: receipt.core,
    templates: receipt.templates,
  });
  if (trustedInventory && !exact(receipt, { ...trustedInventory, mode: receipt.mode }))
    throw new Error("Receipt inventory differs from trusted prior source inventory");
  return receipt;
};
export const planInstallation = ({
  inventory,
  current,
  priorReceipt = null,
  priorInventory = null,
}) => {
  validateInventory(inventory);
  if (priorReceipt) {
    if (!priorInventory) throw new Error("Upgrade requires trusted prior source inventory");
    validateInventory(priorInventory);
    validateReceipt(priorReceipt, priorInventory);
  }
  const old = new Map((priorReceipt?.core ?? []).map((entry) => [entry.path, entry.sha256]));
  const added = [],
    changed = [],
    unchanged = [],
    removed = [],
    conflicts = [];
  const next = new Set(inventory.core.map((entry) => entry.path));
  for (const entry of inventory.core) {
    if (old.has(entry.path)) {
      if (current[entry.path] !== old.get(entry.path)) conflicts.push(entry.path);
      (old.get(entry.path) === entry.sha256 ? unchanged : changed).push(entry.path);
    } else {
      added.push(entry.path);
      if (current[entry.path] !== null && current[entry.path] !== undefined)
        conflicts.push(entry.path);
    }
  }
  for (const [file, digest] of old)
    if (!next.has(file)) {
      removed.push(file);
      if (current[file] !== digest) conflicts.push(file);
    }
  return { added, changed, unchanged, removed, conflicts: [...new Set(conflicts)].sort() };
};
const identity = (directory) =>
  existsSync(directory) ? `${lstatSync(directory).dev}:${lstatSync(directory).ino}` : null;
const stagePath = (destination) =>
  path.join(path.dirname(destination), `.${path.basename(destination)}.proofline-staging`);
const optionsFor = (options) => {
  const normalized = {
    ...options,
    repositoryRoot: options.repositoryRoot ?? path.resolve(import.meta.dirname, "../.."),
    upgrade: options.upgrade ?? false,
  };
  if (!["core", "starter"].includes(normalized.mode))
    throw new Error("Mode must be core or starter");
  assertPhysical(normalized.repositoryRoot);
  assertPhysical(normalized.destination);
  if (!fullSource(normalized.source)) throw new Error("Source must be a full commit SHA");
  const source = normalized.repositoryRoot,
    target = normalized.destination;
  const contains = (parent, child) => {
    const relative = path.relative(parent, child);
    return (
      relative === "" ||
      (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    );
  };
  if (contains(source, target) || contains(target, source))
    throw new Error("Destination must be outside source without overlap");
  if (existsSync(target) && !lstatSync(target).isDirectory())
    throw new Error("Destination must be a directory");
  if (!existsSync(path.dirname(target)) || !lstatSync(path.dirname(target)).isDirectory())
    throw new Error("Destination parent must already exist");
  return normalized;
};
const readReceipt = (destination) => {
  const file = path.join(destination, receiptName);
  assertPhysical(file);
  if (!existsSync(file)) return null;
  fileHash(file);
  try {
    return validateReceipt(JSON.parse(readFileSync(file, "utf8")));
  } catch (error) {
    throw new Error(`Invalid installation receipt: ${error.message}`);
  }
};
const assertNoTransaction = (destination) => {
  assertPhysical(stagePath(destination));
  if (existsSync(stagePath(destination)) || existsSync(path.join(destination, markerName)))
    throw new Error(
      "Incomplete transaction: inspect staging journal and use explicit --recover; no completed installation is implied",
    );
};
export const planOnboarding = (input) => {
  const options = optionsFor(input);
  assertNoTransaction(options.destination);
  const { inventory } = collectSourceInventory({ ...options, starter: options.mode === "starter" });
  const priorReceipt = readReceipt(options.destination);
  if (priorReceipt && !options.upgrade)
    throw new Error("Installation receipt already exists; use explicit --upgrade");
  if (options.upgrade && !priorReceipt)
    throw new Error("Upgrade requires a prior installation receipt");
  if (options.upgrade && options.mode !== "core")
    throw new Error("Upgrade mode must be core; application templates stay target-owned");
  if (
    options.mode === "starter" &&
    existsSync(options.destination) &&
    readdirSync(options.destination).length
  )
    throw new Error("Starter destination must be new or empty, not nonempty");
  const priorInventory = priorReceipt
    ? collectSourceInventory({
        ...options,
        source: priorReceipt.source,
        starter: priorReceipt.mode === "starter",
        clean: false,
      }).inventory
    : null;
  if (priorReceipt) validateReceipt(priorReceipt, priorInventory);
  const current = Object.fromEntries(
    [...new Set([...inventory.core, ...(priorReceipt?.core ?? [])].map((entry) => entry.path))].map(
      (file) => [file, fileHash(path.join(options.destination, file))],
    ),
  );
  const changes = planInstallation({ inventory, current, priorReceipt, priorInventory });
  return {
    schemaVersion: 1,
    mode: options.mode,
    source: options.source,
    destination: options.destination,
    inventory,
    ...changes,
    applyAllowed: changes.conflicts.length === 0 && changes.removed.length === 0,
    destinationIdentity: identity(options.destination),
    parentIdentity: identity(path.dirname(options.destination)),
    priorReceiptHash: fileHash(path.join(options.destination, receiptName)),
  };
};
const renderStarter = (contents) => {
  const manifest = JSON.parse(
    contents.get("examples/work-orders/proofline.harness.json").toString(),
  );
  const registry = JSON.parse(
    contents.get("examples/work-orders/test-impact/rules.json").toString(),
  );
  const cell = (text) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const rules = [
    "# Rule catalog",
    "",
    "Generated from `rules.json` by `pnpm rules:generate`. Edit the JSON registry, then regenerate this file.",
    "",
    "This catalog describes the target application’s deterministic rules, owned source paths, and exact automated test identities.",
    "",
    "| Rule ID | Criticality | Declared behavior | Owned paths | Exact automated evidence |",
    "| --- | --- | --- | --- | --- |",
    ...registry.rules.map(
      (rule) =>
        `| ${rule.id} | ${rule.criticality} | ${cell(rule.description)} | ${rule.paths.map((value) => `\`${cell(value)}\``).join("<br>")} | ${[...rule.vitest.map((test) => `Vitest \`${cell(test.file)}:${test.line}\` — ${cell(test.title)}`), ...rule.playwright.map((test) => `Playwright \`${cell(test.path)}:${test.line}\` — ${cell(test.title)} (${cell(test.tag)})`)].join("<br>")} |`,
    ),
    "",
  ].join("\n");
  const table = [
    "<!-- proofline-canonical-commands:start -->",
    "| Command key | Working directory | Runner | Exact argv (JSON) |",
    "| --- | --- | --- | --- |",
    ...Object.entries(manifest.commands).map(
      ([key, command]) =>
        `| ${key} | ${command.cwd} | ${command.runner ?? ""} | ${JSON.stringify(command.argv)} |`,
    ),
    "<!-- proofline-canonical-commands:end -->",
  ].join("\n");
  return new Map([
    ["test-impact/rules.md", Buffer.from(rules)],
    ["docs/PORTABLE_TEST_AUTOMATION.md", Buffer.from(`# Work-order verification\n\n${table}\n`)],
    [
      "test-impact/execution-record.jsonl",
      Buffer.from(
        `${JSON.stringify({ schemaVersion: 1, eventId: "work-orders-adaptation", recordedAt: "1970-01-01T00:00:00.000Z", phase: "implementation", kind: "adaptation", status: "completed", summary: "Declare target-owned work-orders rules and adapters; tests have not run. Deterministic bootstrap timestamp is not verification time.", scope: ["client", "checks", "proofline.harness.json", "test-impact", "docs"] })}\n`,
      ),
    ],
  ]);
};
const expectedWrites = (options, plan, contents) => {
  const writes = new Map(
    plan.inventory.core.map((entry) => [entry.path, contents.get(entry.path)]),
  );
  if (options.mode === "starter") {
    for (const entry of plan.inventory.templates) {
      if (writes.has(entry.path)) throw new Error("Starter template/core path collision");
      writes.set(entry.path, contents.get(`examples/work-orders/${entry.path}`));
    }
    for (const [file, bytes] of renderStarter(contents)) {
      if (writes.has(file)) throw new Error("Starter generated/template collision");
      writes.set(file, bytes);
    }
  }
  return writes;
};
const assertSamePhysical = (options, plan) => {
  assertPhysical(options.repositoryRoot);
  assertPhysical(options.destination);
  assertPhysical(stagePath(options.destination));
  if (
    identity(path.dirname(options.destination)) !== plan.parentIdentity ||
    identity(options.destination) !== plan.destinationIdentity
  )
    throw new Error("Destination physical identity changed");
};
export const applyOnboarding = (input) => {
  const options = optionsFor(input);
  const plan = planOnboarding(options);
  if (plan.conflicts.length)
    throw new Error(`Installation conflicts: ${plan.conflicts.join(", ")}`);
  if (plan.removed.length)
    throw new Error(`Removed core requires manual reviewed migration: ${plan.removed.join(", ")}`);
  const source = collectSourceInventory({ ...options, starter: options.mode === "starter" });
  const writes = expectedWrites(options, plan, source.contents);
  const receipt = { ...plan.inventory, mode: options.mode };
  const stage = stagePath(options.destination);
  mkdirSync(stage);
  mkdirSync(path.join(stage, "files"));
  mkdirSync(path.join(stage, "backups"));
  const before = {};
  for (const [file, bytes] of writes) {
    before[file] = fileHash(path.join(options.destination, file));
    mkdirSync(path.dirname(path.join(stage, "files", file)), { recursive: true });
    writeFileSync(path.join(stage, "files", file), bytes, { flag: "wx" });
    if (before[file] !== null) {
      mkdirSync(path.dirname(path.join(stage, "backups", file)), { recursive: true });
      writeFileSync(
        path.join(stage, "backups", file),
        readFileSync(path.join(options.destination, file)),
        { flag: "wx" },
      );
    }
  }
  const journal = {
    schemaVersion: 1,
    source: options.source,
    destination: options.destination,
    mode: options.mode,
    upgrade: options.upgrade,
    priorReceiptHash: plan.priorReceiptHash,
    before,
    after: Object.fromEntries([...writes].map(([file, bytes]) => [file, hash(bytes)])),
    receipt,
  };
  writeFileSync(path.join(stage, "journal.json"), json(journal), { flag: "wx" });
  options.onPhase?.("staged");
  assertSamePhysical(options, plan);
  collectSourceInventory({ ...options, starter: options.mode === "starter" });
  for (const file of writes.keys())
    if (fileHash(path.join(options.destination, file)) !== before[file])
      throw new Error(`Destination bytes changed before promotion: ${file}`);
  if (!existsSync(options.destination)) mkdirSync(options.destination);
  const promotionIdentity = identity(options.destination);
  writeFileSync(
    path.join(options.destination, markerName),
    json({ schemaVersion: 1, source: options.source }),
    { flag: "wx" },
  );
  for (const [file] of writes) {
    const target = path.join(options.destination, file);
    assertPhysical(target);
    if (fileHash(target) !== before[file])
      throw new Error(`Destination bytes changed during promotion: ${file}`);
    mkdirSync(path.dirname(target), { recursive: true });
    if (before[file] === null)
      writeFileSync(target, readFileSync(path.join(stage, "files", file)), { flag: "wx" });
    else renameSync(path.join(stage, "files", file), target);
  }
  options.onPhase?.("before-receipt");
  assertSamePhysical(options, { ...plan, destinationIdentity: promotionIdentity });
  for (const [file, digest] of Object.entries(journal.after))
    if (fileHash(path.join(options.destination, file)) !== digest)
      throw new Error(`Installed bytes mismatch before receipt: ${file}`);
  promoteReceipt(options, journal, stage);
  options.onPhase?.("after-receipt");
  finishTransaction(options.destination, stage);
  return receipt;
};
const promoteReceipt = (options, journal, stage) => {
  assertPhysical(options.destination);
  const target = path.join(options.destination, receiptName);
  const staged = path.join(stage, "receipt.json");
  if (fileHash(target) !== journal.priorReceiptHash)
    throw new Error("Installation receipt changed before promotion");
  writeFileSync(staged, json(journal.receipt), { flag: "wx" });
  // A hard link publishes complete staged bytes exclusively without an overwrite window.
  if (!options.upgrade) linkSync(staged, target);
  else {
    fileHash(target);
    renameSync(staged, target);
  }
};
const finishTransaction = (destination, stage) => {
  rmSync(path.join(destination, markerName), { force: true });
  rmSync(stage, { recursive: true });
};
export const recoverOnboarding = (input) => {
  const options = optionsFor(input),
    stage = stagePath(options.destination);
  assertPhysical(stage);
  if (!existsSync(path.join(stage, "journal.json")))
    throw new Error(
      "Incomplete transaction has no trusted journal; preserve files for manual inspection",
    );
  fileHash(path.join(stage, "journal.json"));
  const journal = JSON.parse(readFileSync(path.join(stage, "journal.json"), "utf8"));
  const trusted = collectSourceInventory({ ...options, starter: options.mode === "starter" });
  const receipt = { ...trusted.inventory, mode: options.mode };
  if (
    journal.schemaVersion !== 1 ||
    journal.destination !== options.destination ||
    journal.source !== options.source ||
    journal.mode !== options.mode ||
    journal.upgrade !== options.upgrade ||
    !exact(journal.receipt, receipt)
  )
    throw new Error("Incomplete transaction journal identity/receipt mismatch");
  const writes = expectedWrites(options, { inventory: trusted.inventory }, trusted.contents);
  const expected = Object.fromEntries([...writes].map(([file, bytes]) => [file, hash(bytes)]));
  if (!exact(journal.after, expected)) throw new Error("Incomplete transaction inventory mismatch");
  for (const [file, digest] of Object.entries(expected))
    if (fileHash(path.join(options.destination, file)) !== digest)
      throw new Error(
        `Incomplete installed bytes; preserve staging/backups for manual recovery: ${file}`,
      );
  const marker = path.join(options.destination, markerName);
  assertPhysical(marker);
  const current = readReceipt(options.destination);
  if (!existsSync(marker) && !exact(current, receipt))
    throw new Error("Incomplete transaction marker missing; manual inspection required");
  if (existsSync(marker)) {
    fileHash(marker);
    if (
      !exact(JSON.parse(readFileSync(marker, "utf8")), { schemaVersion: 1, source: options.source })
    )
      throw new Error("Incomplete transaction marker identity mismatch");
  }
  if (!exact(current, receipt)) {
    if (current) {
      const prior = collectSourceInventory({
        ...options,
        source: current.source,
        starter: current.mode === "starter",
        clean: false,
      });
      validateReceipt(current, prior.inventory);
      if (!options.upgrade) throw new Error("Incomplete transaction has unrelated receipt");
    } else if (options.upgrade) throw new Error("Incomplete upgrade lost prior receipt");
    if (existsSync(path.join(stage, "receipt.json"))) {
      fileHash(path.join(stage, "receipt.json"));
      if (readFileSync(path.join(stage, "receipt.json"), "utf8") !== json(receipt))
        throw new Error("Incomplete staged receipt mismatch");
      rmSync(path.join(stage, "receipt.json"));
    }
    promoteReceipt(options, journal, stage);
  }
  finishTransaction(options.destination, stage);
  return receipt;
};
export const parseOnboardingOptions = (args) => {
  const result = { apply: false, upgrade: false, recover: false },
    seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw new Error(`Duplicate option ${flag}`);
    seen.add(flag);
    if (["--apply", "--upgrade", "--recover"].includes(flag)) result[flag.slice(2)] = true;
    else if (["--source", "--destination", "--mode"].includes(flag)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`Missing ${flag}`);
      result[flag.slice(2)] = value;
    } else throw new Error(`Unknown option ${flag}`);
  }
  if (
    !fullSource(result.source) ||
    !path.isAbsolute(result.destination ?? "") ||
    !["starter", "core"].includes(result.mode) ||
    (result.recover && !result.apply)
  )
    throw new Error(
      "Require --source <fullSHA> --destination <absolute> --mode starter|core; writes require --apply and recovery additionally --recover",
    );
  return result;
};
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const options = parseOnboardingOptions(process.argv.slice(2));
    process.stdout.write(
      json(
        options.apply
          ? options.recover
            ? recoverOnboarding(options)
            : applyOnboarding(options)
          : planOnboarding(options),
      ),
    );
  } catch (error) {
    process.stderr.write(`Proofline onboarding: ${error.message}\n`);
    process.exitCode = 1;
  }
}
