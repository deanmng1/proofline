import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertProductionNegativeArtifact } from "./src/production-negative.ts";

const repositoryPath = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  !path.isAbsolute(value) &&
  !value.includes("\\") &&
  !/^[A-Za-z]:/.test(value) &&
  !value.split("/").some((part) => ["", ".", ".."].includes(part));

export const productionAuditOptions = (manifest, repositoryRoot = process.cwd()) => {
  const production = manifest?.production;
  if (
    !production ||
    !repositoryPath(production.directory) ||
    !Array.isArray(production.forbiddenModules) ||
    production.forbiddenModules.length === 0 ||
    production.forbiddenModules.some((module) => !repositoryPath(module)) ||
    new Set(production.forbiddenModules).size !== production.forbiddenModules.length
  ) {
    throw new Error(
      "Proofline production audit requires target-owned production directory and forbiddenModules metadata.",
    );
  }
  const adapters = manifest.adapters;
  if (
    !adapters ||
    ![
      adapters.testModeEnvironment,
      adapters.auth,
      adapters.api,
      ...(Array.isArray(adapters.providers) ? adapters.providers : [null]),
    ].every(repositoryPath)
  )
    throw new Error("Proofline production audit requires declared adapter paths.");
  const required = [
    adapters.testModeEnvironment,
    adapters.auth,
    adapters.api,
    ...adapters.providers,
  ];
  return {
    directory: path.resolve(repositoryRoot, production.directory),
    forbiddenModules: [...new Set([...production.forbiddenModules, ...required])],
    repositoryRoot,
  };
};

export const main = () => {
  const manifest = JSON.parse(readFileSync(path.resolve("proofline.harness.json"), "utf8"));
  assertProductionNegativeArtifact(productionAuditOptions(manifest));
  process.stdout.write("Proofline production artifact is free of test-only capabilities.\n");
};
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
