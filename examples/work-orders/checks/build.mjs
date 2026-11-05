import { build } from "vite";

await build({
  configFile: "client/vite.config.mjs",
  mode: process.argv[2] === "test" ? "proofline-test" : "production",
});
