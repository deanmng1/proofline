import { writeFileSync } from "node:fs";
import { discoverCandidates, runSelection } from "../src/main.ts";

// Test-only bridge: transport JSON data, never source text. Production APIs keep
// their normal synchronous behavior; the Vitest worker awaits this process.
const [mode, resultFile] = process.argv.slice(2);
if (!["discover", "execute"].includes(mode) || !resultFile)
  throw new Error("Expected a real-manifest probe mode and result file.");
process.stdin.setEncoding("utf8");
let json = "";
for await (const chunk of process.stdin) json += chunk;
const input = JSON.parse(json);
let result;
if (mode === "discover") result = discoverCandidates(process.cwd(), input.manifest);
else {
  runSelection(process.cwd(), input.selection, input.plans);
  result = { executed: true };
}
writeFileSync(resultFile, JSON.stringify(result));
