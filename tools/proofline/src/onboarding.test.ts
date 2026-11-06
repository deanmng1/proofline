import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  commitGitFixture,
  initializeGitFixture,
  runFixtureGit,
} from "../../impact/test-fixtures/git.ts";
// @ts-expect-error Source-native operator API.
import * as onboarding from "../onboarding.mjs";

const roots: string[] = [];
const temporary = () => {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "proofline-onboarding-")));
  roots.push(root);
  return root;
};
const write = (root: string, file: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
};
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const fixture = () => {
  const root = temporary();
  initializeGitFixture(root);
  write(root, "package.json", '{"version":"0.9.0-preview.2"}\n');
  write(root, "tools/impact/core.ts", "export const portable = true;\n");
  write(root, "tools/proofline/core-inventory.mjs", "export const inventory = true;\n");
  write(root, "tools/proofline/onboarding.mjs", "operator only\n");
  write(root, "tools/impact/core.test.ts", "excluded\n");
  write(root, "examples/work-orders/package.json", '{"name":"independent-app"}\n');
  write(root, "examples/work-orders/client/orders.mjs", "export const orders = [];\n");
  write(
    root,
    "examples/work-orders/proofline.harness.json",
    '{"commands":{"unit":{"argv":["node","unit.mjs"],"cwd":"."}}}\n',
  );
  write(root, "examples/work-orders/test-impact/rules.json", '{"rules":[]}\n');
  const source = commitGitFixture(root, "Pinned source");
  const parent = temporary();
  return {
    root,
    source,
    destination: path.join(parent, "target"),
    options: {
      repositoryRoot: root,
      source,
      destination: path.join(parent, "target"),
      mode: "core",
    },
  };
};
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("safe source-native onboarding", () => {
  it("plans read-only and installs exact pinned core without app config or dependency reuse", () => {
    const f = fixture();
    mkdirSync(f.destination);
    write(f.destination, "package.json", "user package\n");
    initializeGitFixture(f.destination);
    const originalHead = commitGitFixture(f.destination, "Existing application history");
    const plan = onboarding.planOnboarding(f.options);
    expect(plan.added).toEqual(["tools/impact/core.ts", "tools/proofline/core-inventory.mjs"]);
    expect(existsSync(path.join(f.destination, "tools"))).toBe(false);
    const receipt = onboarding.applyOnboarding(f.options);
    expect(receipt.schemaVersion).toBe(1);
    expect(receipt.source).toBe(f.source);
    expect(readFileSync(path.join(f.destination, "tools/impact/core.ts"), "utf8")).toBe(
      "export const portable = true;\n",
    );
    expect(readFileSync(path.join(f.destination, "package.json"), "utf8")).toBe("user package\n");
    expect(existsSync(path.join(f.destination, ".git/HEAD"))).toBe(true);
    expect(runFixtureGit(f.destination, ["rev-parse", "HEAD"])).toBe(originalHead);
    expect(existsSync(path.join(f.destination, "node_modules"))).toBe(false);
    expect(JSON.stringify(receipt)).not.toMatch(/passed|verified|testsPassed/);
  });
  it("creates a new starter with separately pinned templates and initial evidence but no Git or installs", () => {
    const f = fixture();
    const options = { ...f.options, mode: "starter" };
    const plan = onboarding.planOnboarding(options);
    expect(existsSync(f.destination)).toBe(false);
    expect(plan.conflicts).toEqual([]);
    const receipt = onboarding.applyOnboarding(options);
    expect(JSON.parse(readFileSync(path.join(f.destination, "package.json"), "utf8")).name).toBe(
      "independent-app",
    );
    expect(
      receipt.templates.find((file: { path: string }) => file.path === "package.json").sha256,
    ).toBe(sha('{"name":"independent-app"}\n'));
    expect(
      readFileSync(path.join(f.destination, "docs/PORTABLE_TEST_AUTOMATION.md"), "utf8"),
    ).toContain("proofline-canonical-commands:start");
    expect(
      JSON.parse(
        readFileSync(path.join(f.destination, "test-impact/execution-record.jsonl"), "utf8"),
      ).status,
    ).toBe("completed");
    expect(existsSync(path.join(f.destination, ".git"))).toBe(false);
    expect(() => onboarding.applyOnboarding(options)).toThrow(/nonempty|already|receipt/i);
  });
  it("rejects non-full commits dirty relevant bytes missing pins and added untracked core", () => {
    const f = fixture();
    expect(() => onboarding.planOnboarding({ ...f.options, source: f.source.slice(0, 7) })).toThrow(
      /full|source/i,
    );
    expect(() => onboarding.planOnboarding({ ...f.options, source: "a".repeat(40) })).toThrow(
      /source|git|commit/i,
    );
    write(f.root, "tools/impact/core.ts", "edited\n");
    expect(() => onboarding.planOnboarding(f.options)).toThrow(/dirty|changed/i);
    write(f.root, "tools/impact/core.ts", "export const portable = true;\n");
    write(f.root, "tools/impact/untracked.ts", "new");
    expect(() => onboarding.planOnboarding(f.options)).toThrow(/untracked|dirty|inventory/i);
  });
  it("preflights every collision before writing any target files", () => {
    const f = fixture();
    mkdirSync(f.destination);
    write(f.destination, "tools/proofline/core-inventory.mjs", "user bytes");
    expect(onboarding.planOnboarding(f.options).conflicts).toContain(
      "tools/proofline/core-inventory.mjs",
    );
    expect(() => onboarding.applyOnboarding(f.options)).toThrow(/conflict/i);
    expect(existsSync(path.join(f.destination, "tools/impact/core.ts"))).toBe(false);
    expect(
      readFileSync(path.join(f.destination, "tools/proofline/core-inventory.mjs"), "utf8"),
    ).toBe("user bytes");
  });
  it("plans changed added removed core and upgrades only unchanged prior installation", () => {
    const f = fixture();
    mkdirSync(f.destination);
    onboarding.applyOnboarding(f.options);
    write(f.root, "tools/impact/core.ts", "export const portable = 2;\n");
    write(f.root, "tools/impact/extra.ts", "export const extra = 1;\n");
    const source = commitGitFixture(f.root, "Upgrade");
    const options = { ...f.options, source, upgrade: true };
    const plan = onboarding.planOnboarding(options);
    expect(plan.changed).toEqual(["tools/impact/core.ts"]);
    expect(plan.added).toEqual(["tools/impact/extra.ts"]);
    onboarding.applyOnboarding(options);
    expect(readFileSync(path.join(f.destination, "tools/impact/core.ts"), "utf8")).toContain(
      "portable = 2",
    );
    rmSync(path.join(f.root, "tools/impact/extra.ts"));
    const removedSource = commitGitFixture(f.root, "Remove");
    expect(onboarding.planOnboarding({ ...options, source: removedSource }).removed).toEqual([
      "tools/impact/extra.ts",
    ]);
    expect(() => onboarding.applyOnboarding({ ...options, source: removedSource })).toThrow(
      /removed|removal/i,
    );
    expect(existsSync(path.join(f.destination, "tools/impact/extra.ts"))).toBe(true);
  });
  it("refuses user edits partial installs forged receipt paths and missing prior Git authority", () => {
    const f = fixture();
    mkdirSync(f.destination);
    onboarding.applyOnboarding(f.options);
    const receiptPath = path.join(f.destination, ".proofline-receipt.json");
    const original = readFileSync(receiptPath, "utf8");
    write(f.destination, "tools/impact/core.ts", "user edit");
    expect(onboarding.planOnboarding({ ...f.options, upgrade: true }).conflicts).toContain(
      "tools/impact/core.ts",
    );
    expect(() => onboarding.applyOnboarding({ ...f.options, upgrade: true })).toThrow(/conflict/i);
    write(f.destination, "tools/impact/core.ts", "export const portable = true;\n");
    rmSync(path.join(f.destination, "tools/proofline/core-inventory.mjs"));
    expect(() => onboarding.applyOnboarding({ ...f.options, upgrade: true })).toThrow(/conflict/i);
    write(f.destination, "tools/proofline/core-inventory.mjs", "export const inventory = true;\n");
    for (const badPath of [
      "package.json",
      ".git/config",
      "proofline.harness.json",
      "test-impact/execution-record.jsonl",
      "../escape",
      "/absolute",
      "tools/impact/invented.ts",
    ]) {
      const receipt = JSON.parse(original);
      receipt.core.push({ path: badPath, sha256: sha("user edit") });
      writeFileSync(receiptPath, JSON.stringify(receipt));
      expect(() => onboarding.planOnboarding({ ...f.options, upgrade: true })).toThrow(
        /receipt|inventory|path/i,
      );
    }
    const missing = JSON.parse(original);
    missing.core.pop();
    writeFileSync(receiptPath, JSON.stringify(missing));
    expect(() => onboarding.planOnboarding({ ...f.options, upgrade: true })).toThrow(
      /receipt|inventory/i,
    );
    const absent = JSON.parse(original);
    absent.source = "a".repeat(40);
    writeFileSync(receiptPath, JSON.stringify(absent));
    expect(() => onboarding.planOnboarding({ ...f.options, upgrade: true })).toThrow(
      /source|git|commit/i,
    );
    writeFileSync(receiptPath, '{"schemaVersion":1,"testsPassed":true}');
    expect(() => onboarding.planOnboarding({ ...f.options, upgrade: true })).toThrow(/receipt/i);
  });
  it("rejects traversal overlap symlink source and destination paths", () => {
    const f = fixture();
    expect(() =>
      onboarding.planOnboarding({ ...f.options, destination: path.parse(f.root).root }),
    ).toThrow(/overlap|outside/i);
    expect(() =>
      onboarding.planOnboarding({ ...f.options, destination: path.join(f.root, "child") }),
    ).toThrow(/overlap|outside/i);
    expect(() => onboarding.planOnboarding({ ...f.options, destination: "relative" })).toThrow(
      /absolute/i,
    );
    const linked = path.join(path.dirname(f.destination), "linked");
    symlinkSync(f.root, linked, "dir");
    expect(() => onboarding.planOnboarding({ ...f.options, repositoryRoot: linked })).toThrow(
      /symlink/i,
    );
    symlinkSync(f.root, f.destination, "dir");
    expect(() => onboarding.planOnboarding(f.options)).toThrow(/symlink|overlap/i);
    rmSync(f.destination);
    mkdirSync(f.destination);
    symlinkSync(f.root, path.join(f.destination, "tools"), "dir");
    expect(() => onboarding.planOnboarding(f.options)).toThrow(/symlink/i);
    rmSync(path.join(f.root, "tools/impact/core.ts"));
    symlinkSync(path.join(f.root, "package.json"), path.join(f.root, "tools/impact/core.ts"));
    expect(() => onboarding.planOnboarding(f.options)).toThrow(/symlink/i);
  });
  it("retains incomplete staging and safely resumes final receipt promotion without deleting user bytes", () => {
    const f = fixture();
    mkdirSync(f.destination);
    expect(() =>
      onboarding.applyOnboarding({
        ...f.options,
        onPhase: (phase: string) => {
          if (phase === "before-receipt") throw new Error("interrupted");
        },
      }),
    ).toThrow(/interrupted/);
    expect(existsSync(path.join(f.destination, ".proofline-receipt.json"))).toBe(false);
    expect(() => onboarding.applyOnboarding(f.options)).toThrow(/incomplete|transaction/i);
    write(f.destination, "user.txt", "keep");
    onboarding.recoverOnboarding(f.options);
    expect(existsSync(path.join(f.destination, ".proofline-receipt.json"))).toBe(true);
    expect(readFileSync(path.join(f.destination, "user.txt"), "utf8")).toBe("keep");
  });
  it("revalidates physical paths and target bytes before promotion and recognizes completed receipt interruption", () => {
    const f = fixture();
    mkdirSync(f.destination);
    expect(() =>
      onboarding.applyOnboarding({
        ...f.options,
        onPhase: (phase: string) => {
          if (phase === "staged") {
            renameSync(f.destination, `${f.destination}-old`);
            symlinkSync(`${f.destination}-old`, f.destination, "dir");
          }
        },
      }),
    ).toThrow(/symlink|changed/i);
    rmSync(f.destination);
    renameSync(`${f.destination}-old`, f.destination);
    expect(() => onboarding.recoverOnboarding(f.options)).toThrow(/incomplete|missing|bytes/i);
    const g = fixture();
    mkdirSync(g.destination);
    expect(() =>
      onboarding.applyOnboarding({
        ...g.options,
        onPhase: (phase: string) => {
          if (phase === "after-receipt") throw new Error("after receipt interruption");
        },
      }),
    ).toThrow(/interruption/);
    expect(onboarding.recoverOnboarding(g.options).source).toBe(g.source);
  });
  it("parses explicit source and destination with plan default and rejects arbitrary commands", () => {
    const source = "f".repeat(40);
    expect(
      onboarding.parseOnboardingOptions([
        "--source",
        source,
        "--destination",
        "/target",
        "--mode",
        "core",
      ]),
    ).toEqual({
      source,
      destination: "/target",
      mode: "core",
      apply: false,
      upgrade: false,
      recover: false,
    });
    for (const args of [
      [],
      ["--source", "main"],
      ["--run", "npm install"],
      ["--source", source, "--source", source],
    ])
      expect(() => onboarding.parseOnboardingOptions(args)).toThrow();
  });
  it("refuses receipt edits during upgrade promotion and untrusted pure upgrade inventories", () => {
    const f = fixture();
    mkdirSync(f.destination);
    const prior = onboarding.applyOnboarding(f.options);
    const inventory = onboarding.collectSourceInventory(f.options).inventory;
    expect(() =>
      onboarding.planInstallation({ inventory, current: {}, priorReceipt: prior }),
    ).toThrow(/trusted|prior|inventory/i);
    write(f.root, "tools/impact/core.ts", "upgrade\n");
    const source = commitGitFixture(f.root, "Upgrade receipt race");
    expect(() =>
      onboarding.applyOnboarding({
        ...f.options,
        source,
        upgrade: true,
        onPhase: (phase: string) => {
          if (phase === "before-receipt")
            write(f.destination, ".proofline-receipt.json", "user replacement\n");
        },
      }),
    ).toThrow(/receipt.*changed|changed.*receipt/i);
    expect(readFileSync(path.join(f.destination, ".proofline-receipt.json"), "utf8")).toBe(
      "user replacement\n",
    );
  });
  it("rejects untrusted staged inventories and target edits during interrupted recovery", () => {
    const f = fixture();
    mkdirSync(f.destination);
    expect(() =>
      onboarding.applyOnboarding({
        ...f.options,
        onPhase: (phase: string) => {
          if (phase === "before-receipt") throw new Error("interrupted");
        },
      }),
    ).toThrow();
    write(f.destination, "tools/impact/core.ts", "user edit\n");
    expect(() => onboarding.recoverOnboarding(f.options)).toThrow(/incomplete|bytes/i);
    expect(readFileSync(path.join(f.destination, "tools/impact/core.ts"), "utf8")).toBe(
      "user edit\n",
    );
    write(f.destination, "tools/impact/core.ts", "export const portable = true;\n");
    const journalPath = path.join(
      path.dirname(f.destination),
      ".target.proofline-staging/journal.json",
    );
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    journal.after["package.json"] = sha("forged");
    writeFileSync(journalPath, JSON.stringify(journal));
    expect(() => onboarding.recoverOnboarding(f.options)).toThrow(/inventory/i);
    expect(existsSync(path.join(f.destination, ".proofline-receipt.json"))).toBe(false);
  });
  it("rejects physical destination replacement before receipt and finishes cleanup after completed receipt", () => {
    const f = fixture();
    mkdirSync(f.destination);
    expect(() =>
      onboarding.applyOnboarding({
        ...f.options,
        onPhase: (phase: string) => {
          if (phase === "before-receipt") {
            renameSync(f.destination, `${f.destination}-old`);
            mkdirSync(f.destination);
          }
        },
      }),
    ).toThrow(/physical|identity|bytes/i);
    expect(existsSync(path.join(f.destination, ".proofline-receipt.json"))).toBe(false);
    const g = fixture();
    mkdirSync(g.destination);
    expect(() =>
      onboarding.applyOnboarding({
        ...g.options,
        onPhase: (phase: string) => {
          if (phase === "after-receipt") {
            rmSync(path.join(g.destination, ".proofline-installing.json"));
            throw new Error("cleanup interruption");
          }
        },
      }),
    ).toThrow(/interruption/);
    expect(onboarding.recoverOnboarding(g.options).source).toBe(g.source);
  });
});
