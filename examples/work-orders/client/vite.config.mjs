import { realpathSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const root = path.resolve(import.meta.dirname, "..");
  const dependencyRoot = realpathSync(path.join(root, "node_modules"));
  const testEntry = mode === "proofline-test";
  return {
    root: import.meta.dirname,
    esbuild: { jsx: "automatic" },
    plugins: [
      {
        name: "work-orders-entry-and-module-graph",
        transformIndexHtml: {
          order: "pre",
          handler: (html) => (testEntry ? html.replace("/main.jsx", "/test-entry.jsx") : html),
        },
        generateBundle(_options, bundle) {
          this.emitFile({
            type: "asset",
            fileName: ".proofline/modules.json",
            source: JSON.stringify({
              version: 1,
              chunks: Object.values(bundle)
                .filter((item) => item.type === "chunk")
                .map((chunk) => ({
                  file: chunk.fileName,
                  modules: [
                    ...new Set(
                      Object.keys(chunk.modules).map((id) => {
                        const clean = id.replace(/^\0+/, "").split("?")[0];
                        if (!path.isAbsolute(clean)) return clean;
                        const relative = path.relative(root, clean);
                        // Third-party dependencies are provided offline from the installed package store.
                        // Their complete package paths remain in the graph; application modules must stay local.
                        if (relative.startsWith("../")) {
                          const dependency = path.relative(dependencyRoot, clean);
                          if (dependency.startsWith("../") || path.isAbsolute(dependency))
                            throw new Error("Nondependency source escaped the standalone target");
                          return `node_modules/${dependency}`;
                        }
                        return relative;
                      }),
                    ),
                  ],
                  imports: chunk.imports,
                  dynamicImports: chunk.dynamicImports,
                })),
            }),
          });
        },
      },
    ],
    build: {
      target: "esnext",
      outDir: path.join(root, testEntry ? "dist/work-orders-test" : "dist/work-orders"),
      emptyOutDir: true,
      manifest: true,
      sourcemap: false,
    },
  };
});
