import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { createTestCapabilityGate } from "../../../apps/crm-web/src/test-capability.ts";
import { withProoflineGuard } from "../run-guarded.mjs";
import {
  assertProductionNegativeArtifact,
  DEFAULT_PRODUCTION_FORBIDDEN_MARKERS,
} from "./production-negative.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const harness = JSON.parse(
  readFileSync(path.join(repositoryRoot, "proofline.harness.json"), "utf8"),
) as {
  adapters: { testModeEnvironment: string; auth: string; api: string; providers: string[] };
  commands: { testEntrypoint: { argv: string[]; cwd: string } };
};
const referenceForbiddenModules = [
  harness.adapters.testModeEnvironment,
  harness.adapters.auth,
  harness.adapters.api,
  ...harness.adapters.providers,
  "apps/crm-web/src/test-entry.tsx",
  "apps/crm-web/src/test-capability.ts",
];
const referenceForbiddenMarkers = [
  ...DEFAULT_PRODUCTION_FORBIDDEN_MARKERS,
  {
    label: "reference Test API capability",
    content: /\b(?:createTestApi|createMswHandlers|__CRM_TEST_API__)\b/,
  },
];
const temporaryRoots: string[] = [];
const temporaryDirectory = () => {
  const directory = mkdtempSync(path.join(tmpdir(), "proofline-production-negative-"));
  temporaryRoots.push(directory);
  return directory;
};

const fetchThroughGuard = async (
  origin: string,
  pathname = "/",
  headers: Record<string, string> = {},
) => {
  const directory = temporaryDirectory();
  const client = path.join(directory, "client.mjs");
  writeFileSync(
    client,
    `
      const response = await fetch(new URL(process.argv[3], process.argv[2]), {
        redirect: "manual",
        headers: JSON.parse(process.argv[4]),
      });
      process.stdout.write(JSON.stringify({
        status: response.status,
        text: await response.text(),
        cookie: response.headers.get("set-cookie"),
      }));
    `,
  );
  const result = await withProoflineGuard(
    [process.execPath, client, origin, pathname, JSON.stringify(headers)],
    { allowedOrigins: [origin], cwd: repositoryRoot },
  );
  if (result.code !== 0) throw new Error(result.stderr || `Guarded fetch exited ${result.code}`);
  return JSON.parse(result.stdout) as { status: number; text: string; cookie: string | null };
};

const writePositiveManifests = async (directory: string) => {
  await mkdir(path.join(directory, ".proofline"), { recursive: true });
  await mkdir(path.join(directory, ".vite"), { recursive: true });
  writeFileSync(
    path.join(directory, ".proofline/modules.json"),
    JSON.stringify({
      version: 1,
      chunks: [
        {
          file: "assets/app.js",
          modules: ["examples/acme/src/main.ts", "examples/acme/src/bootstrap.ts"],
          imports: [],
          dynamicImports: [],
        },
      ],
    }),
  );
  writeFileSync(
    path.join(directory, ".vite/manifest.json"),
    JSON.stringify({
      "index.html": {
        file: "assets/app.js",
        src: "examples/acme/src/main.ts",
        isEntry: true,
      },
    }),
  );
};

afterAll(() => {
  for (const directory of temporaryRoots) rmSync(directory, { recursive: true, force: true });
});

describe("Proofline production boundary", () => {
  test("rejects_test_markers_in_a_production_bundle", async () => {
    execFileSync("pnpm", ["nx", "run", "crm-web:build", "--skip-nx-cache"], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "pipe",
    });

    const productionDirectory = path.join(repositoryRoot, "dist/crm-web");
    expect(() =>
      assertProductionNegativeArtifact({
        directory: productionDirectory,
        forbiddenModules: referenceForbiddenModules,
        forbiddenMarkers: referenceForbiddenMarkers,
      }),
    ).not.toThrow();

    const positive = temporaryDirectory();
    await mkdir(path.join(positive, "assets"), { recursive: true });
    await writePositiveManifests(positive);
    writeFileSync(
      path.join(positive, "assets/app.js"),
      'console.log("Mock month view with seeded events is ordinary product copy.");\n',
    );
    expect(() => assertProductionNegativeArtifact({ directory: positive })).not.toThrow();

    const incompleteGraphs = [
      { chunks: [] },
      {
        chunks: [
          {
            file: "assets/missing.js",
            modules: ["apps/crm-web/src/main.tsx"],
            imports: [],
            dynamicImports: [],
          },
        ],
      },
    ];
    for (const graph of incompleteGraphs) {
      const fixture = temporaryDirectory();
      await mkdir(path.join(fixture, ".proofline"), { recursive: true });
      await mkdir(path.join(fixture, ".vite"), { recursive: true });
      writeFileSync(
        path.join(fixture, ".proofline/modules.json"),
        JSON.stringify({ version: 1, ...graph }),
      );
      writeFileSync(path.join(fixture, ".vite/manifest.json"), "{}");
      expect(() => assertProductionNegativeArtifact({ directory: fixture })).toThrow(
        /invalid Proofline module graph/i,
      );
    }

    const extraChunk = temporaryDirectory();
    await mkdir(path.join(extraChunk, "assets"), { recursive: true });
    await writePositiveManifests(extraChunk);
    writeFileSync(path.join(extraChunk, "assets/app.js"), "console.log('declared');");
    writeFileSync(path.join(extraChunk, "assets/unreported.js"), "console.log('unreported');");
    expect(() => assertProductionNegativeArtifact({ directory: extraChunk })).toThrow(
      /invalid Proofline module graph/i,
    );

    const invalidViteManifest = temporaryDirectory();
    await mkdir(path.join(invalidViteManifest, "assets"), { recursive: true });
    await writePositiveManifests(invalidViteManifest);
    writeFileSync(path.join(invalidViteManifest, "assets/app.js"), "console.log('declared');");
    writeFileSync(path.join(invalidViteManifest, ".vite/manifest.json"), "[]");
    expect(() => assertProductionNegativeArtifact({ directory: invalidViteManifest })).toThrow(
      /invalid Vite manifest/i,
    );

    const forbiddenViteReference = temporaryDirectory();
    await mkdir(path.join(forbiddenViteReference, "assets"), { recursive: true });
    await writePositiveManifests(forbiddenViteReference);
    writeFileSync(path.join(forbiddenViteReference, "assets/app.js"), "console.log('declared');");
    writeFileSync(
      path.join(forbiddenViteReference, ".vite/manifest.json"),
      JSON.stringify({
        [harness.adapters.api]: {
          file: "assets/app.js",
          src: `${harness.adapters.api}?worker`,
          imports: [],
          dynamicImports: [],
        },
      }),
    );
    expect(() =>
      assertProductionNegativeArtifact({
        directory: forbiddenViteReference,
        forbiddenModules: referenceForbiddenModules,
      }),
    ).toThrow(/forbidden production module/i);

    const outsideRepositoryModule = temporaryDirectory();
    await mkdir(path.join(outsideRepositoryModule, "assets"), { recursive: true });
    await writePositiveManifests(outsideRepositoryModule);
    writeFileSync(path.join(outsideRepositoryModule, "assets/app.js"), "console.log('declared');");
    writeFileSync(
      path.join(outsideRepositoryModule, ".proofline/modules.json"),
      JSON.stringify({
        version: 1,
        chunks: [
          {
            file: "assets/app.js",
            modules: [path.join(outsideRepositoryModule, "outside.ts")],
            imports: [],
            dynamicImports: [],
          },
        ],
      }),
    );
    expect(() => assertProductionNegativeArtifact({ directory: outsideRepositoryModule })).toThrow(
      /invalid Proofline module graph/i,
    );

    const injectedCases = [
      { file: "mockServiceWorker.js", content: "self.addEventListener('fetch', () => {});" },
      { file: "assets/test-api.js", content: "const api = createTestApi({});" },
      { file: "assets/msw.js", content: "setupWorker(...handlers);" },
      { file: "assets/fake-auth.js", content: 'import "@/mocks/handlers";' },
      { file: "assets/test-api-flag.js", content: "window.__CRM_TEST_API__ = true;" },
      { file: "assets/capability.js", content: "PROOFLINE_TEST_CAPABILITY" },
      { file: "assets/entry.js", content: 'import("/src/test-entry.tsx")' },
      { file: "assets/app.js", content: "//# sourceMappingURL=app.js.map" },
      { file: "assets/app.js.map", content: '{"version":3,"sources":[]}' },
      { file: "assets/app.js", content: 'import("./test-entry-D34DB33F.js")' },
      {
        file: ".proofline/modules.json",
        content: JSON.stringify({
          version: 1,
          chunks: [
            {
              file: "assets/app.js",
              modules: ["apps/crm-web/src/mocks/browser.ts"],
              imports: [],
              dynamicImports: [],
            },
          ],
        }),
      },
      {
        file: ".proofline/modules.json",
        content: JSON.stringify({
          version: 1,
          chunks: [
            {
              file: "assets/app.js",
              modules: [path.join(repositoryRoot, `${harness.adapters.api}?worker`)],
              imports: [],
              dynamicImports: [],
            },
          ],
        }),
      },
      {
        file: ".proofline/modules.json",
        content: JSON.stringify({
          version: 1,
          chunks: [
            {
              file: "assets/app.js",
              modules: [`${harness.adapters.api}?worker`],
              imports: [],
              dynamicImports: [],
            },
          ],
        }),
      },
    ];

    for (const [index, injected] of injectedCases.entries()) {
      const fixture = temporaryDirectory();
      await writePositiveManifests(fixture);
      const file = path.join(fixture, injected.file);
      await mkdir(path.dirname(file), { recursive: true });
      writeFileSync(file, injected.content);
      expect(
        () =>
          assertProductionNegativeArtifact({
            directory: fixture,
            forbiddenMarkers: referenceForbiddenMarkers,
            forbiddenModules: referenceForbiddenModules,
          }),
        `${index}: ${injected.file}`,
      ).toThrow(/production artifact.*forbidden|source map/i);
    }
  }, 60_000);

  test("refuses_test_entry_without_a_launcher_capability", () => {
    const capability = "Proofline_9fYp3dC2xV7nM5qR8tL6sK4jH1gW0zA";

    expect(() => createTestCapabilityGate(undefined)).toThrow(/launcher capability/i);
    expect(() => createTestCapabilityGate("fixed-capability")).toThrow(/malformed/i);

    const gate = createTestCapabilityGate(capability);
    expect(() =>
      gate.consume({
        supplied: undefined,
        origin: "http://127.0.0.1:4173",
      }),
    ).toThrow(/missing/i);
    expect(() =>
      gate.consume({
        supplied: `${capability}wrong`,
        origin: "http://127.0.0.1:4173",
      }),
    ).toThrow(/does not match/i);
    expect(() =>
      gate.consume({
        supplied: capability,
        origin: "https://proofline.example:4173",
      }),
    ).toThrow(/loopback/i);

    expect(
      gate.consume({
        supplied: capability,
        origin: "http://127.0.0.1:4173",
      }),
    ).toEqual({ origin: "http://127.0.0.1:4173" });
    expect(() =>
      gate.consume({
        supplied: capability,
        origin: "http://127.0.0.1:4173",
      }),
    ).toThrow(/already consumed/i);
  });

  test("builds_the_test_entry_only_with_a_launcher_supplied_capability", () => {
    const testDirectory = path.join(repositoryRoot, "dist/crm-web-test");
    const capability = "Proofline_Launch_7vN4qP8rT2wX6yZ9aB3cD5eF";
    execFileSync("pnpm", ["nx", "run", "crm-web:build-test", "--skip-nx-cache"], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "pipe",
    });

    const files = Array.from(
      (function* walk(directory: string): Generator<string> {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const absolute = path.join(directory, entry.name);
          if (entry.isDirectory()) yield* walk(absolute);
          else if (entry.isFile()) yield absolute;
        }
      })(testDirectory),
    );
    const output = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(output).not.toContain(capability);
    expect(output).toMatch(/test-entry|PROOFLINE_TEST_ENTRY/);
  }, 60_000);

  test("launches_the_test_artifact_only_after_one_server_side_capability_proof", async () => {
    const artifact = path.join(repositoryRoot, "dist/crm-web-test");
    const launcher = path.join(repositoryRoot, "tools/proofline/serve-test-app.mjs");
    const missing = execFileSync;
    expect(() =>
      missing(process.execPath, [launcher, "--directory", artifact, "--port", "0"], {
        cwd: repositoryRoot,
        env: { ...process.env, PROOFLINE_TEST_CAPABILITY: "" },
        stdio: "pipe",
      }),
    ).toThrow(/fresh launcher capability/i);

    const callerCapability = "Proofline_Caller_8pQ4sT7vW2xY6zA9bC3dE5fG";
    const canonical = harness.commands.testEntrypoint;
    const [binary, ...args] = canonical.argv;
    const declaredOrigins = [
      process.env.PROOFLINE_PRODUCTION_TEST_ORIGIN_ONE,
      process.env.PROOFLINE_PRODUCTION_TEST_ORIGIN_TWO,
    ].filter((value): value is string => Boolean(value));
    let launchIndex = 0;
    const launch = () => {
      const launchArgs = [...args];
      const declaredOrigin = declaredOrigins[launchIndex++];
      if (declaredOrigin) {
        const portIndex = launchArgs.indexOf("--port") + 1;
        if (portIndex <= 0 || launchArgs[portIndex] !== "0")
          throw new Error("Canonical test entrypoint must retain its ephemeral --port 0 contract.");
        launchArgs[portIndex] = new URL(declaredOrigin).port;
      }
      const child = spawn(binary === "node" ? process.execPath : binary, launchArgs, {
        cwd: path.resolve(repositoryRoot, canonical.cwd),
        env: { ...process.env, PROOFLINE_TEST_CAPABILITY: callerCapability },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.setEncoding("utf8");
      let buffered = "";
      const ready = new Promise<{ origin: string; capability: string }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Test server did not start")), 10_000);
        child.once("error", reject);
        child.stdout.on("data", (chunk) => {
          buffered += chunk;
          const newline = buffered.indexOf("\n");
          if (newline < 0) return;
          clearTimeout(timeout);
          resolve(JSON.parse(buffered.slice(0, newline)) as { origin: string; capability: string });
        });
      });
      return { child, ready };
    };
    const first = launch();
    const second = launch();
    const [{ origin, capability }, secondReady] = await Promise.all([first.ready, second.ready]);
    expect(capability).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(secondReady.capability).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(capability).not.toBe(secondReady.capability);
    expect(capability).not.toBe(callerCapability);
    expect(secondReady.capability).not.toBe(callerCapability);
    expect(new URL(origin).hostname).toBe("127.0.0.1");
    try {
      expect((await fetchThroughGuard(origin)).status).toBe(403);
      expect((await fetchThroughGuard(origin, "/?__proofline_capability=wrong")).status).toBe(403);
      const accepted = await fetchThroughGuard(
        origin,
        `/?__proofline_capability=${encodeURIComponent(capability)}`,
      );
      expect(accepted.status).toBe(200);
      expect(accepted.text).toContain(capability);
      expect(accepted.cookie).toMatch(/__proofline_session=/);
      const sessionCookie = accepted.cookie?.split(";", 1)[0];
      expect(sessionCookie).toBeTruthy();
      expect(
        (
          await fetchThroughGuard(
            origin,
            `/?__proofline_capability=${encodeURIComponent(capability)}`,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await fetchThroughGuard(
            origin,
            `/?__proofline_capability=${encodeURIComponent(capability)}`,
            { cookie: sessionCookie ?? "" },
          )
        ).status,
      ).toBe(409);
    } finally {
      first.child.kill("SIGTERM");
      second.child.kill("SIGTERM");
      await Promise.all([
        new Promise<void>((resolve) => first.child.once("close", () => resolve())),
        new Promise<void>((resolve) => second.child.once("close", () => resolve())),
      ]);
      await expect(fetchThroughGuard(origin)).rejects.toThrow();
    }
  }, 30_000);
  test("rejects_marker_free_module_aliases_escapes_and_duplicate_filesystem_identities", async () => {
    const forbiddenAlias = "packages/api-contracts/src/../src/test-api.ts?worker";
    const invalidIds = [
      forbiddenAlias,
      "../outside.ts",
      "././examples/acme/src/main.ts",
      "examples//acme/src/main.ts",
      "examples/acme/./src/main.ts",
      "",
      "?worker",
      "virtual:",
      " examples/acme/src/main.ts",
      "examples/acme/src/main.ts ",
      "\\outside.ts",
      "C:\\outside.ts",
      "\u0000",
      "examples/\u0000main.ts",
    ];
    const valid = "examples/acme/src/main.ts";
    const moduleSets = [
      ...invalidIds.map((id) => [id]),
      [valid, `./${valid}`],
      [valid, path.join(repositoryRoot, valid)],
      [valid, valid.replaceAll("/", "\\")],
    ];
    for (const modules of moduleSets) {
      const fixture = temporaryDirectory();
      await writePositiveManifests(fixture);
      await mkdir(path.join(fixture, "assets"));
      writeFileSync(path.join(fixture, "assets/app.js"), "console.log('ordinary');");
      writeFileSync(
        path.join(fixture, ".proofline/modules.json"),
        JSON.stringify({
          version: 1,
          chunks: [{ file: "assets/app.js", modules, imports: [], dynamicImports: [] }],
        }),
      );
      expect
        .soft(
          () =>
            assertProductionNegativeArtifact({
              directory: fixture,
              forbiddenModules: referenceForbiddenModules,
            }),
          JSON.stringify(modules),
        )
        .toThrow(/invalid Proofline module graph|forbidden production module/);
    }
    for (const id of invalidIds) {
      for (const field of ["entry", "src"]) {
        const fixture = temporaryDirectory();
        await writePositiveManifests(fixture);
        await mkdir(path.join(fixture, "assets"));
        writeFileSync(path.join(fixture, "assets/app.js"), "console.log('ordinary');");
        writeFileSync(
          path.join(fixture, ".vite/manifest.json"),
          JSON.stringify({
            [field === "entry" ? id : "index.html"]: {
              file: "assets/app.js",
              src: field === "src" ? id : valid,
            },
          }),
        );
        expect
          .soft(
            () =>
              assertProductionNegativeArtifact({
                directory: fixture,
                forbiddenModules: referenceForbiddenModules,
              }),
            `${field} ${JSON.stringify(id)}`,
          )
          .toThrow(/invalid Vite manifest|forbidden production module/);
      }
    }
    const fixture = temporaryDirectory();
    await writePositiveManifests(fixture);
    await mkdir(path.join(fixture, "assets"));
    writeFileSync(path.join(fixture, "assets/app.js"), "console.log('ordinary');");
    writeFileSync(
      path.join(fixture, ".vite/manifest.json"),
      JSON.stringify({
        [valid]: { file: "assets/app.js" },
        [path.join(repositoryRoot, valid)]: { file: "assets/app.js" },
      }),
    );
    expect(() => assertProductionNegativeArtifact({ directory: fixture })).toThrow(
      /invalid Vite manifest/,
    );
    await writePositiveManifests(fixture);
    for (const forbidden of invalidIds)
      expect
        .soft(
          () =>
            assertProductionNegativeArtifact({ directory: fixture, forbiddenModules: [forbidden] }),
          `configured ${JSON.stringify(forbidden)}`,
        )
        .toThrow();
  });

  test("preserves_distinct_vite_virtual_and_query_module_identities", async () => {
    const fixture = temporaryDirectory();
    await writePositiveManifests(fixture);
    await mkdir(path.join(fixture, "assets"));
    writeFileSync(path.join(fixture, "assets/app.js"), "console.log('ordinary');");
    const modules = [
      "examples/acme/src/main.ts",
      "\u0000examples/acme/src/main.ts",
      "examples/acme/src/main.ts?worker",
      "examples/acme/src/main.ts?raw",
      "\u0000examples/acme/src/main.ts?commonjs-proxy",
      "\u0000vite/modulepreload-polyfill.js",
      "virtual:plugin-module",
      "./examples/acme/src/bootstrap.ts",
      path.join(repositoryRoot, "examples/acme/src/absolute.ts"),
    ];
    writeFileSync(
      path.join(fixture, ".proofline/modules.json"),
      JSON.stringify({
        version: 1,
        chunks: [{ file: "assets/app.js", modules, imports: [], dynamicImports: [] }],
      }),
    );
    writeFileSync(
      path.join(fixture, ".vite/manifest.json"),
      JSON.stringify(
        Object.fromEntries(modules.map((id) => [id, { file: "assets/app.js", src: id }])),
      ),
    );
    expect(() => assertProductionNegativeArtifact({ directory: fixture })).not.toThrow();
    for (const id of [
      "examples/acme/src/main.ts?worker",
      "\u0000examples/acme/src/main.ts?commonjs-proxy",
    ]) {
      writeFileSync(
        path.join(fixture, ".proofline/modules.json"),
        JSON.stringify({
          version: 1,
          chunks: [{ file: "assets/app.js", modules: [id], imports: [], dynamicImports: [] }],
        }),
      );
      expect(() =>
        assertProductionNegativeArtifact({
          directory: fixture,
          forbiddenModules: ["examples/acme/src/main.ts"],
        }),
      ).toThrow(/forbidden production module/);
    }
  });
});
