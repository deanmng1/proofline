import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "vitest";
// @ts-expect-error JavaScript operational API.
import { validateCompatibilityDeclaration } from "../compatibility.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const require = createRequire(import.meta.url);
const yaml = createRequire(require.resolve("nx/package.json"))("yaml");
const expression = (name: string) => `\${{ ${name} }}`;
const workflow = () =>
  yaml.parse(readFileSync(path.join(root, ".github/workflows/verify.yml"), "utf8"));

test("canonical CI requires every declared complete compatibility cell", () => {
  const declaration = validateCompatibilityDeclaration(
    JSON.parse(readFileSync(path.join(root, "proofline.compatibility.json"), "utf8")),
  );
  const job = workflow().jobs.verify;
  expect(job.strategy?.["fail-fast"]).toBe(false);
  expect(job.strategy?.matrix.include).toEqual(
    declaration.cells.map((cell: { id: string; runner: string }) => ({
      id: cell.id,
      runner: cell.runner,
      release: cell.id === "linux-x64-chromium",
    })),
  );
  expect(job["runs-on"]).toBe(expression("matrix.runner"));
});

test("matrix evidence stays distinct and only one cell can publish eligible release artifacts", () => {
  const steps = workflow().jobs.verify.steps;
  const bundle = steps.find(
    (step: { name: string }) => step.name === "Package audited immutable production release",
  );
  const publish = steps.find(
    (step: { name: string }) => step.name === "Publish successful immutable release bundle",
  );
  for (const step of [bundle, publish]) expect(step.if).toContain("matrix.release");
  const uploads = steps.filter((step: { uses?: string }) =>
    step.uses?.startsWith("actions/upload-artifact@"),
  );
  for (const step of uploads.filter((step: { name: string }) => step.name !== publish.name)) {
    expect(step.with.name).toContain(expression("matrix.id"));
    expect(step.with.name).toContain(expression("github.run_id"));
    expect(step.with.name).toContain(expression("github.run_attempt"));
  }
  const collection = steps.find((step: { id?: string }) => step.id === "compatibility");
  expect(collection.if).toContain("github.event_name == 'push'");
  expect(collection.if).toContain("github.ref == 'refs/heads/main'");
  expect(collection.run).toContain('--cell "$PROOFLINE_COMPATIBILITY_CELL"');
  expect(steps.indexOf(collection)).toBeLessThan(steps.indexOf(bundle));
});
