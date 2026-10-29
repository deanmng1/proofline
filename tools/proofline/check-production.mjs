import { readFileSync } from "node:fs";
import path from "node:path";
import { assertProductionNegativeArtifact } from "./src/production-negative.ts";

const manifest = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "proofline.harness.json"), "utf8"),
);
const adapters = manifest?.adapters;
if (
  !adapters ||
  typeof adapters.testModeEnvironment !== "string" ||
  typeof adapters.auth !== "string" ||
  typeof adapters.api !== "string" ||
  !Array.isArray(adapters.providers) ||
  adapters.providers.some((provider) => typeof provider !== "string")
)
  throw new Error("Proofline production audit requires validated manifest adapter paths.");

assertProductionNegativeArtifact({
  directory: path.resolve(process.cwd(), "dist/crm-web"),
  forbiddenModules: [
    adapters.testModeEnvironment,
    adapters.auth,
    adapters.api,
    ...adapters.providers,
    "apps/crm-web/src/test-entry.tsx",
    "apps/crm-web/src/test-capability.ts",
  ],
});
process.stdout.write("Proofline production artifact is free of test-only capabilities.\n");
