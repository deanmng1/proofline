import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["client/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["client/orders.mjs"],
      reportsDirectory: "artifacts/coverage/work-orders",
      reporter: ["text", "json-summary"],
    },
  },
});
