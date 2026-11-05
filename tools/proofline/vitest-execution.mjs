import path from "node:path";
import { parseCLI, startVitest } from "vitest/node";
import { assertCoverageDirectory } from "./execution-artifacts.mjs";

// Use Vitest's native CLI parser/runtime. The hook runs after final configuration and before
// coverage provider initialization/cleanup; reporter onInit is too late for this boundary.
const protectedRoot = path.resolve(import.meta.dirname, "../../artifacts/proofline");
const args = process.argv.slice(2);
try {
  if (args[0] !== "run") throw new Error("Proofline Vitest execution requires run");
  const { filter, options } = parseCLI(["vitest", ...args]);
  if (options.exclude) {
    options.cliExclude = Array.isArray(options.exclude) ? options.exclude : [options.exclude];
    delete options.exclude;
  }
  if (filter.some((value) => value.includes(":"))) options.includeTaskLocation ??= true;
  if (typeof options.typecheck?.only === "boolean") options.typecheck.enabled ??= true;
  const context = await startVitest(
    "test",
    filter.map((value) => path.posix.normalize(value.replaceAll("\\", "/"))),
    options,
    {
      plugins: [
        {
          name: "proofline-preserve-execution-evidence",
          enforce: "post",
          configureVitest({ vitest }) {
            const coverage = vitest.config.coverage;
            if (!coverage.enabled) return;
            if (!["v8", "istanbul"].includes(coverage.provider ?? "v8"))
              throw new Error("Proofline requires a supported native coverage provider");
            const directory = path.resolve(
              vitest.config.root,
              coverage.reportsDirectory ?? "coverage",
            );
            assertCoverageDirectory(directory, { protectedRoot });
            for (const reporter of coverage.reporter ?? []) {
              if (!Array.isArray(reporter) || !reporter[1]) continue;
              for (const key of ["file", "subdir", "dir"]) {
                const destination = reporter[1][key];
                if (typeof destination === "string")
                  assertCoverageDirectory(path.resolve(directory, destination), { protectedRoot });
              }
            }
          },
        },
      ],
    },
  );
  if (!context.shouldKeepServer()) await context.exit();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
}
