import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const demo = mode === "proofline-demo";
  const testEntry = mode === "proofline-test" || demo;
  const repositoryRoot = path.resolve(__dirname, "../..");
  const normalizeModuleId = (raw: string) => {
    const withoutVirtualPrefix = raw.replace(/^\0+/, "");
    const withoutQuery = withoutVirtualPrefix.split(/[?#]/, 1)[0];
    if (!path.isAbsolute(withoutQuery)) return withoutQuery.split(path.sep).join("/");
    const relative = path.relative(repositoryRoot, withoutQuery);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new Error("Proofline module graph contains a source outside the repository.");
    return relative.split(path.sep).join("/");
  };

  return {
    root: __dirname,
    publicDir: path.resolve(__dirname, testEntry ? "./public" : "./public-production"),
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "proofline-test-entry",
        transformIndexHtml: {
          order: "pre",
          handler(html) {
            const entry = testEntry ? html.replace("/src/main.tsx", "/src/test-entry.tsx") : html;
            if (!demo) return entry;
            const localOnly = entry.replace(
              /\s*<link\b[^>]*https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g,
              "",
            );
            const policy =
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";
            return localOnly.replace(
              "<head>",
              `<head><meta http-equiv="Content-Security-Policy" content="${policy}" />`,
            );
          },
        },
      },
      {
        name: "proofline-module-manifest",
        generateBundle(_options, bundle) {
          const chunks = Object.values(bundle)
            .filter((item) => item.type === "chunk")
            .map((chunk) => ({
              file: chunk.fileName,
              modules: Array.from(
                new Set(Object.keys(chunk.modules).map(normalizeModuleId)),
              ).sort(),
              imports: [...chunk.imports].sort(),
              dynamicImports: [...chunk.dynamicImports].sort(),
            }))
            .sort((left, right) => left.file.localeCompare(right.file));
          this.emitFile({
            type: "asset",
            fileName: ".proofline/modules.json",
            source: JSON.stringify({ version: 1, chunks }, null, 2),
          });
        },
      },
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      outDir: path.resolve(
        __dirname,
        demo
          ? "../../dist/crm-web-demo"
          : testEntry
            ? "../../dist/crm-web-test"
            : "../../dist/crm-web",
      ),
      emptyOutDir: true,
      sourcemap: false,
      manifest: true,
    },
    server: testEntry ? { host: "127.0.0.1", strictPort: true } : undefined,
    preview: testEntry ? { host: "127.0.0.1", strictPort: true } : undefined,
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
        include: ["src/**/*.{ts,tsx}", "scripts/*.mjs"],
        exclude: [
          "src/**/*.test.{ts,tsx}",
          "src/test/**",
          "src/mocks/**",
          "src/**/*.d.ts",
          "src/main.tsx",
          "src/test-entry.tsx",
          "src/test-capability.ts",
        ],
      },
    },
  };
});
