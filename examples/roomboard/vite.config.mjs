import { defineConfig } from "vite";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  build: { outDir: "dist", emptyOutDir: true },
  test: { include: ["src/**/*.test.mjs"], environment: "node" },
});
