import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist/crm-web"),
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: true,
    fileParallelism: false,
    testTimeout: 10000,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "../../apps/crm-e2e/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/coverage/**",
    ],
    coverage: {
      all: true,
      provider: "v8",
      reportOnFailure: true,
      reportsDirectory: "../../artifacts/coverage/crm-web",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/mocks/**",
        "src/**/*.d.ts",
        "src/main.tsx",
      ],
    },
  },
});
