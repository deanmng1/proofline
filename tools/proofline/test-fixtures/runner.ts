import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { commitGitFixture, initializeGitFixture } from "../../impact/test-fixtures/git.ts";

export const runnerFixture = ({ withoutNx = false } = {}) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "proofline-runner-regression-")));
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  };
  mkdirSync(path.join(root, "tools/proofline"), { recursive: true });
  for (const file of readdirSync("tools/proofline").filter((file) => file.endsWith(".mjs")))
    copyFileSync(path.join("tools/proofline", file), path.join(root, "tools/proofline", file));
  // Nested fixtures retain the already-installed guard's exact module identity. A second
  // byte-copied policy correctly rejects the parent's different preload path.
  if (process.env.PROOFLINE_GUARD_PRELOAD) {
    rmSync(path.join(root, "tools/proofline/guard-policy.mjs"));
    symlinkSync(
      path.resolve("tools/proofline/guard-policy.mjs"),
      path.join(root, "tools/proofline/guard-policy.mjs"),
    );
  }
  mkdirSync(path.join(root, "node_modules/.bin"), { recursive: true });
  for (const file of readdirSync("node_modules").filter(
    (file) => file !== ".bin" && !(withoutNx && file === "nx"),
  ))
    symlinkSync(path.resolve("node_modules", file), path.join(root, "node_modules", file));
  for (const name of ["vitest", "playwright", ...(!withoutNx ? ["nx"] : [])])
    symlinkSync(
      realpathSync(path.join("node_modules/.bin", name)),
      path.join(root, "node_modules/.bin", name),
    );
  write(".gitignore", "node_modules/\nartifacts/\ncoverage/\n");
  write("package.json", JSON.stringify({ private: true, type: "module" }));
  write("value.ts", "export const value = 1;\n");
  write(
    "a.test.ts",
    'import { test, expect } from "vitest"; import { value } from "./value"; test("first", () => expect(value).toBe(1));\n',
  );
  write("b.test.ts", 'import { test } from "vitest"; test("second", () => {});\n');
  write(
    "vitest.config.mjs",
    'export default { test: { include: ["a.test.ts"], coverage: { include: ["value.ts"], reporter: ["json-summary"] } } };\n',
  );
  write(
    "browser/a.spec.ts",
    'import { test } from "@playwright/test"; test("first browser", () => {});\n',
  );
  write(
    "browser/b.spec.ts",
    'import { test } from "@playwright/test"; test("second browser", () => {});\n',
  );
  write(
    "playwright.config.mjs",
    'export default { testDir: "./browser", testMatch: "a.spec.ts", projects: [{ name: "chromium" }] };\n',
  );
  const manifest = {
    commands: {},
    execution: {
      unitBuildCommands: [],
      unitTargets: [{ argv: ["run", "--config", "vitest.config.mjs"], cwd: "." }],
      browserBuildCommands: [],
      browserArgs: ["test", "--config", "playwright.config.mjs"],
    },
    ownership: [
      {
        testBindings: [
          { runner: "vitest", file: "a.test.ts", title: "first" },
          { runner: "vitest", file: "b.test.ts", title: "second" },
          { runner: "playwright", file: "browser/a.spec.ts", title: "first browser" },
          { runner: "playwright", file: "browser/b.spec.ts", title: "second browser" },
        ],
      },
    ],
  };
  write("proofline.harness.json", JSON.stringify(manifest));
  initializeGitFixture(root);
  commitGitFixture(root, "runner fixture");
  return {
    root,
    write,
    manifest,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    run: (args: string[], env: Record<string, string> = {}) =>
      spawnSync(process.execPath, ["tools/proofline/canonical-runner.mjs", ...args], {
        cwd: root,
        env: { ...process.env, ...env },
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      }),
    records: () =>
      readFileSync(path.join(root, "artifacts/proofline/execution-index.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) =>
          JSON.parse(
            readFileSync(
              path.join(root, "artifacts/proofline", JSON.parse(line).verification),
              "utf8",
            ),
          ),
        ),
  };
};
