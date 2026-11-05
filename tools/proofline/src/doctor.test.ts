import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
// @ts-expect-error Portable JavaScript API.
import { collectPreflight, parseDoctorOptions, renderPreflight } from "../doctor.mjs";

const stack: Record<string, string> = {
  react: "19.2.8",
  vite: "6.4.3",
  vitest: "3.2.7",
  "@vitest/coverage-v8": "3.2.7",
  "@playwright/test": "1.62.1",
};
const pkg = {
  packageManager: "pnpm@11.24.0",
  engines: { node: ">=24.22.1 <25" },
  devDependencies: stack,
};
function fixture(
  overrides: Record<string, string> = {},
  probes: Record<string, string> = {},
  cwd = "/fixture",
) {
  const files: Record<string, string> = {
    "package.json": JSON.stringify(pkg),
    ".nvmrc": "24.22.1",
    "proofline.harness.json": JSON.stringify({
      version: 1,
      coverage: [{ provider: "v8", providerVersion: "3.2.7" }],
    }),
    "pnpm-lock.yaml": `lockfileVersion: '9.0'\nimporters:\n  .:\n    devDependencies:\n${Object.entries(
      stack,
    )
      .map(
        ([key, value]) => `      '${key}':\n        specifier: ${value}\n        version: ${value}`,
      )
      .join("\n")}`,
    ...overrides,
  };
  const calls: string[][] = [];
  return {
    calls,
    options: {
      cwd,
      runtime: { version: "v24.22.1", execPath: "/bin/node", platform: "darwin", arch: "arm64" },
      readFile: (file: string) => {
        const key = file.replace(`${cwd}/`, "");
        if (!(key in files)) throw new Error("missing");
        return files[key];
      },
      runProbe: (command: string, args: string[]) => {
        calls.push([command, ...args]);
        const key = [command, ...args].join(" ");
        return (
          probes[key] ??
          (
            {
              "node -p JSON.stringify({version:process.version,execPath:process.execPath})":
                '{"version":"v24.22.1","execPath":"/bin/node"}',
              "pnpm --version": "11.24.0",
              "git --version": "git version 2.48.0",
              "git rev-parse --is-inside-work-tree": "true",
              "git rev-parse --is-shallow-repository": "false",
            } as Record<string, string>
          )[key] ??
          ""
        );
      },
    },
  };
}
describe("offline preflight", () => {
  test("source mode works without dependencies using only bounded read-only probes", async () => {
    const f = fixture();
    const result = await collectPreflight(f.options);
    expect(result.ready).toBe(true);
    expect(result.kind).toBe("preflight");
    expect(result.checks.find((c: { id: string }) => c.id === "platform").status).toBe("info");
    expect(f.calls.every((c) => ["node", "pnpm", "git"].includes(c[0]))).toBe(true);
    expect(renderPreflight(result)).toContain("not proof of passed tests");
  });
  test("reports missing locks manifest and incoherent package pins with remediation", async () => {
    for (const [file, value] of [
      ["pnpm-lock.yaml", ""],
      ["proofline.harness.json", "{}"],
      [".nvmrc", "22"],
      ["package.json", "{}"],
    ]) {
      const result = await collectPreflight(fixture({ [file]: value }).options);
      expect(result.ready).toBe(false);
      expect(
        result.checks.some(
          (c: { status: string; remediation: string }) =>
            c.status === "fail" && c.remediation.length > 0,
        ),
      ).toBe(true);
    }
  });
  test("rejects wrong child Node pnpm Git shallow history and invalid revisions", async () => {
    for (const [key, value] of [
      [
        "node -p JSON.stringify({version:process.version,execPath:process.execPath})",
        '{"version":"v22.0.0","execPath":"/other/node"}',
      ],
      ["pnpm --version", "11.25.0"],
      ["git --version", "git version 2.47.0"],
      ["git rev-parse --is-shallow-repository", "true"],
    ])
      expect((await collectPreflight(fixture({}, { [key]: value }).options)).ready).toBe(false);
    expect((await collectPreflight({ ...fixture().options, base: "bad", head: "bad" })).ready).toBe(
      false,
    );
  });
  test("installed stage requires actual contained dependencies and reviewed browser metadata", async () => {
    const result = await collectPreflight({
      ...fixture().options,
      stage: "installed",
      independent: true,
    });
    expect(result.ready).toBe(false);
    expect(
      result.checks.some(
        (c: { id: string; status: string }) => c.id === "dependencies" && c.status === "fail",
      ),
    ).toBe(true);
  });
  test("parses a strict CLI with paired immutable revisions and no fix operation", () => {
    expect(parseDoctorOptions(["--json", "--stage", "source"])).toMatchObject({
      json: true,
      stage: "source",
    });
    for (const args of [
      ["--fix"],
      ["--stage", "all"],
      ["--base", "a".repeat(40)],
      ["--json", "--json"],
    ])
      expect(() => parseDoctorOptions(args)).toThrow();
  });
});

describe("preflight coherence and installed cache boundaries", () => {
  test("rejects ambiguous root importers and duplicate selected lock entries", async () => {
    const declarations = Object.entries(stack)
      .map(
        ([key, value]) => `      '${key}':\n        specifier: ${value}\n        version: ${value}`,
      )
      .join("\n");
    const root = `  .:\n    devDependencies:\n${declarations}\n`;
    for (const text of [
      `lockfileVersion: '9.0'\nimporters:\n${root}${root}`,
      `lockfileVersion: '9.0'\nimporters:\n${root}      'react':\n        specifier: 19.2.8\n        version: 19.2.8\n`,
    ]) {
      expect((await collectPreflight(fixture({ "pnpm-lock.yaml": text }).options)).ready).toBe(
        false,
      );
    }
  });

  test("rejects lock resolutions from a different importer and manifest provider mismatch", async () => {
    const lock = `lockfileVersion: '9.0'\nimporters:\n  other:\n    devDependencies:\n${Object.entries(
      stack,
    )
      .map(
        ([key, value]) => `      '${key}':\n        specifier: ${value}\n        version: ${value}`,
      )
      .join("\n")}`;
    expect((await collectPreflight(fixture({ "pnpm-lock.yaml": lock }).options)).ready).toBe(false);
    expect(
      (
        await collectPreflight(
          fixture({
            "proofline.harness.json": JSON.stringify({
              version: 1,
              coverage: [{ provider: "v8", providerVersion: "3.1.0" }],
            }),
          }).options,
        )
      ).ready,
    ).toBe(false);
  });
  test("reports missing commands wrong Node and missing history without exposing probe errors", async () => {
    const f = fixture();
    const missing = await collectPreflight({
      ...f.options,
      runProbe: () => {
        throw new Error("credential=secret");
      },
      runtime: { ...f.options.runtime, version: "v22.0.0" },
    });
    expect(missing.ready).toBe(false);
    expect(JSON.stringify(missing)).not.toContain("credential=secret");
    expect(
      (
        await collectPreflight(
          fixture({}, { "git rev-parse --is-inside-work-tree": "false" }).options,
        )
      ).ready,
    ).toBe(false);
  });
  test("requires supplied commits to exist and base to be a unique ancestor", async () => {
    const base = "a".repeat(40),
      head = "b".repeat(40);
    const probes = {
      [`git rev-parse --verify ${base}^{commit}`]: base,
      [`git rev-parse --verify ${head}^{commit}`]: head,
      [`git merge-base ${base} ${head}`]: base,
    };
    expect((await collectPreflight({ ...fixture({}, probes).options, base, head })).ready).toBe(
      true,
    );
    for (const changed of [
      { [`git merge-base ${base} ${head}`]: head },
      { [`git rev-parse --verify ${head}^{commit}`]: "" },
    ])
      expect(
        (await collectPreflight({ ...fixture({}, { ...probes, ...changed }).options, base, head }))
          .ready,
      ).toBe(false);
  });
  test("checks exact installed packages and safe registry files in an arbitrary cache", async () => {
    for (const mutation of [
      "valid",
      "missing",
      "lookalike",
      "escape",
      "directory-escape",
      "dependency",
      "host-link",
      "target-registry",
    ]) {
      const root = mkdtempSync(path.join(tmpdir(), "proofline-doctor-installed-"));
      try {
        const f = fixture({}, {}, root);
        writeFileSync(path.join(root, "package.json"), JSON.stringify(pkg));
        for (const [name, version] of Object.entries(stack)) {
          const directory = path.join(root, "node_modules", name);
          mkdirSync(directory, { recursive: true });
          writeFileSync(
            path.join(directory, "package.json"),
            JSON.stringify({
              name,
              version: mutation === "dependency" && name === "react" ? "19.0.0" : version,
            }),
          );
        }
        const cache = path.join(root, "arbitrary-cache-name");
        mkdirSync(cache);
        const registry = {
          findExecutable: (name: string) => {
            const directory = path.join(cache, name);
            return {
              directory,
              executablePath: () =>
                ["firefox", "webkit"].includes(name) ? undefined : path.join(directory, "binary"),
            };
          },
        };
        for (const name of ["chromium", "chromium-headless-shell", "ffmpeg"]) {
          const entry = registry.findExecutable(name);
          mkdirSync(entry.directory);
          writeFileSync(path.join(entry.directory, "binary"), "fixture binary");
        }
        if (mutation === "missing" || mutation === "lookalike")
          rmSync(path.join(cache, "chromium/binary"));
        if (mutation === "lookalike") writeFileSync(path.join(cache, "binary"), "lookalike");
        if (mutation === "escape") {
          rmSync(path.join(cache, "chromium/binary"));
          writeFileSync(path.join(root, "outside-binary"), "outside");
          symlinkSync(path.join(root, "outside-binary"), path.join(cache, "chromium/binary"));
        }
        if (mutation === "directory-escape") {
          rmSync(path.join(cache, "chromium"), { recursive: true });
          mkdirSync(path.join(root, "outside-installation"));
          writeFileSync(path.join(root, "outside-installation/binary"), "outside");
          symlinkSync(path.join(root, "outside-installation"), path.join(cache, "chromium"));
        }
        if (mutation === "host-link") {
          rmSync(path.join(root, "node_modules"), { recursive: true });
          symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"));
        }
        if (mutation === "target-registry") {
          const testDirectory = path.join(root, "node_modules/@playwright/test");
          writeFileSync(path.join(testDirectory, "index.js"), "module.exports = {};\n");
          const playwrightDirectory = path.join(root, "node_modules/playwright");
          const coreDirectory = path.join(root, "node_modules/playwright-core/lib");
          mkdirSync(playwrightDirectory, { recursive: true });
          mkdirSync(coreDirectory, { recursive: true });
          writeFileSync(
            path.join(playwrightDirectory, "package.json"),
            JSON.stringify({ name: "playwright", version: "1.62.1" }),
          );
          writeFileSync(
            path.join(coreDirectory, "coreBundle.js"),
            `exports.registry = {registry:{findExecutable(name){return {directory:require("node:path").join(${JSON.stringify(cache)},name),executablePath(){return ["firefox","webkit"].includes(name) ? undefined : require("node:path").join(${JSON.stringify(cache)},name,"binary");}};}}};`,
          );
        }
        const original = f.options.readFile;
        const result = await collectPreflight({
          ...f.options,
          stage: "installed",
          independent: true,
          readFile: (file: string) =>
            file.includes(`${path.sep}node_modules${path.sep}`)
              ? readFileSync(file, "utf8")
              : original(file),
          loadBrowserRegistry: mutation === "target-registry" ? undefined : async () => registry,
        });
        expect(result.ready, mutation).toBe(["valid", "target-registry"].includes(mutation));
        if (mutation === "valid")
          expect(
            result.checks
              .find((c: { id: string }) => c.id === "browser-files")
              .observed.map((c: { name: string }) => c.name),
          ).toEqual(["chromium", "chromium-headless-shell", "ffmpeg"]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });
});

describe("pnpm lock structural coherence", () => {
  test("requires unique importer parents root sections and selected dependency entries", async () => {
    const lock = fixture().options.readFile("/fixture/pnpm-lock.yaml");
    const root = lock.slice(lock.indexOf("  .:"));
    const edits: Array<[string, string]> = [
      ["missing importer parent", lock.replace("importers:", "notImporters:")],
      ["duplicate importer parent", `${lock}\nimporters:\n  other: {}\n`],
      ["quoted duplicate importer parent", `${lock}\n'importers':\n  other: {}\n`],
      ["inline importer parent with children", lock.replace("importers:", "importers: {}")],
      ["missing root", lock.replace("  .:", "  other:")],
      ["duplicate quoted root", `${lock}\n${root.replace("  .:", "  '.':")}`],
      ["missing dependency parent", lock.replace("    devDependencies:", "    notDependencies:")],
      ["duplicate dependency parent", `${lock}\n    devDependencies: {}\n`],
      ["duplicate lock version", `${lock}\nlockfileVersion: '8.0'\n`],
      [
        "orphan selected field",
        lock.replace("    devDependencies:\n", "    devDependencies:\n        version: 19.2.8\n"),
      ],
      ["selected dependency in another top-level section", lock.replace("importers:", "settings:")],
      [
        "selected dependency in wrong root parent",
        lock.replace("    devDependencies:", "    dependenciesMeta:"),
      ],
    ];
    for (const [name, text] of edits) {
      const result = await collectPreflight(fixture({ "pnpm-lock.yaml": text }).options);
      expect(result.checks.find((check: { id: string }) => check.id === "lock").status, name).toBe(
        "fail",
      );
      expect(result.ready, name).toBe(false);
    }
  });
  test("rejects duplicate selected scalar fields and unsupported YAML ambiguity", async () => {
    const lock = fixture().options.readFile("/fixture/pnpm-lock.yaml");
    const entry = "      'react':\n        specifier: 19.2.8\n        version: 19.2.8";
    const edits: Array<[string, string]> = [
      ["duplicate version", lock.replace(entry, `${entry}\n        version: 19.2.8`)],
      ["conflicting version", lock.replace(entry, `${entry}\n        version: 18.0.0`)],
      ["duplicate specifier", lock.replace(entry, `${entry}\n        specifier: 19.2.8`)],
      ["conflicting specifier", lock.replace(entry, `${entry}\n        specifier: 18.0.0`)],
      ["quoted duplicate version", lock.replace(entry, `${entry}\n        'version': 18.0.0`)],
      ["missing version", lock.replace(entry, "      'react':\n        specifier: 19.2.8")],
      ["missing specifier", lock.replace(entry, "      'react':\n        version: 19.2.8")],
      ["unknown selected field", lock.replace(entry, `${entry}\n        verified: true`)],
      ["scalar field with children", lock.replace(entry, `${entry}\n          nested: false`)],
      ["anchored importer map", lock.replace("importers:", "importers: &alias")],
      ["tab indentation", lock.replace("        version: 19.2.8", "\tversion: 19.2.8")],
    ];
    for (const [name, text] of edits) {
      const result = await collectPreflight(fixture({ "pnpm-lock.yaml": text }).options);
      expect(result.checks.find((check: { id: string }) => check.id === "lock").status, name).toBe(
        "fail",
      );
      expect(result.ready, name).toBe(false);
    }
  });
  test("accepts current root and work-orders block-map locks with explicit section boundaries", async () => {
    for (const directory of [".", "examples/work-orders"]) {
      const packageText = readFileSync(path.join(directory, "package.json"), "utf8");
      const lock = readFileSync(path.join(directory, "pnpm-lock.yaml"), "utf8");
      const result = await collectPreflight(
        fixture({ "package.json": packageText, "pnpm-lock.yaml": lock }).options,
      );
      expect(result.ready, directory).toBe(true);
    }
  });
});
