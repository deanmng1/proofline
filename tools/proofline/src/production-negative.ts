import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

export type ForbiddenProductionMarker = {
  label: string;
  path?: RegExp;
  content?: RegExp;
};

export const DEFAULT_PRODUCTION_FORBIDDEN_MARKERS: readonly ForbiddenProductionMarker[] = [
  {
    label: "MSW service worker artifact",
    path: /(?:^|\/)mockServiceWorker\.js$/i,
    content: /\bsetupWorker\s*\(/,
  },
  { label: "test mock module", content: /(?:@\/|\/src\/)mocks\/(?:browser|handlers|data)/ },
  {
    label: "test entrypoint",
    content: /(?:\/src\/)?test-entry(?:-[A-Za-z0-9_-]+)?\.(?:tsx?|jsx?|mjs)/i,
  },
  { label: "test entrypoint marker", content: /\bPROOFLINE_TEST_ENTRY\b/ },
  { label: "test launch capability", content: /\bPROOFLINE_TEST_CAPABILITY\b/ },
  { label: "Vite test launch capability", content: /\bVITE_PROOFLINE_TEST_CAPABILITY\b/ },
  { label: "source map reference", content: /[#@]\s*sourceMappingURL\s*=/ },
];

const visitFiles = (root: string): Array<{ absolute: string; relative: string }> => {
  const files: Array<{ absolute: string; relative: string }> = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const metadata = lstatSync(absolute);
      if (metadata.isSymbolicLink())
        throw new Error(`Production artifact contains a forbidden symbolic link: ${relative}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push({ absolute, relative });
    }
  };
  visit(root);
  return files;
};

export const assertProductionNegativeArtifact = ({
  directory,
  forbiddenMarkers = DEFAULT_PRODUCTION_FORBIDDEN_MARKERS,
  forbiddenModules = [],
  repositoryRoot = process.cwd(),
}: {
  directory: string;
  forbiddenMarkers?: readonly ForbiddenProductionMarker[];
  forbiddenModules?: readonly string[];
  repositoryRoot?: string;
}): void => {
  const resolved = realpathSync(directory);
  if (!statSync(resolved).isDirectory())
    throw new Error(`Production artifact is not a directory: ${directory}`);

  const failures: string[] = [];
  const files = visitFiles(resolved);
  const artifactFiles = new Set(files.map((file) => file.relative));
  const repositoryRootReal = realpathSync(repositoryRoot);
  const normalizeModuleId = (raw: string) => {
    const withoutVirtualPrefix = raw.replace(/^\0+/, "");
    const withoutQuery = withoutVirtualPrefix.split(/[?#]/, 1)[0];
    if (!path.isAbsolute(withoutQuery))
      return withoutQuery.replaceAll("\\", "/").replace(/^\.\//, "");
    const relative = path.relative(repositoryRootReal, withoutQuery);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error();
    return relative.split(path.sep).join("/");
  };
  const configuredForbiddenModules = new Set(forbiddenModules.map(normalizeModuleId));
  const genericForbiddenModules = [
    /(?:^|\/)src\/mocks\//,
    /(?:^|\/)src\/test-entry\.[cm]?[jt]sx?$/,
    /(?:^|\/)src\/test-capability\.[cm]?[jt]sx?$/,
  ];
  const inspectModuleReference = (raw: string, owner: string) => {
    const normalized = normalizeModuleId(raw);
    if (
      configuredForbiddenModules.has(normalized) ||
      genericForbiddenModules.some((pattern) => pattern.test(normalized))
    )
      failures.push(`${owner}: forbidden production module ${normalized}`);
    return normalized;
  };
  const moduleManifest = files.find((file) => file.relative === ".proofline/modules.json");
  const viteManifest = files.find((file) => file.relative === ".vite/manifest.json");
  if (!moduleManifest) failures.push(".proofline/modules.json: required module graph is missing");
  if (!viteManifest) failures.push(".vite/manifest.json: required Vite manifest is missing");
  if (viteManifest) {
    try {
      const parsed = JSON.parse(readFileSync(viteManifest.absolute, "utf8")) as Record<
        string,
        unknown
      >;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        Object.keys(parsed).length === 0
      )
        throw new Error();
      const entries = new Set(Object.keys(parsed));
      for (const [entryId, rawEntry] of Object.entries(parsed)) {
        if (!entryId || !rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry))
          throw new Error();
        const entry = rawEntry as {
          file?: unknown;
          src?: unknown;
          imports?: unknown;
          dynamicImports?: unknown;
        };
        if (
          typeof entry.file !== "string" ||
          !entry.file ||
          path.isAbsolute(entry.file) ||
          entry.file.split("/").includes("..") ||
          !artifactFiles.has(entry.file) ||
          (entry.src !== undefined && typeof entry.src !== "string") ||
          (entry.imports !== undefined && !Array.isArray(entry.imports)) ||
          (entry.dynamicImports !== undefined && !Array.isArray(entry.dynamicImports))
        )
          throw new Error();
        inspectModuleReference(entryId, ".vite/manifest.json");
        inspectModuleReference(entry.file, ".vite/manifest.json");
        if (entry.src !== undefined)
          inspectModuleReference(entry.src as string, ".vite/manifest.json");
        for (const imported of [
          ...((entry.imports ?? []) as unknown[]),
          ...((entry.dynamicImports ?? []) as unknown[]),
        ]) {
          if (typeof imported !== "string" || !entries.has(imported)) throw new Error();
          inspectModuleReference(imported, ".vite/manifest.json");
        }
      }
    } catch {
      failures.push(".vite/manifest.json: invalid Vite manifest");
    }
  }
  if (moduleManifest) {
    try {
      const parsed = JSON.parse(readFileSync(moduleManifest.absolute, "utf8")) as {
        version?: unknown;
        chunks?: unknown;
      };
      if (parsed.version !== 1 || !Array.isArray(parsed.chunks) || parsed.chunks.length === 0)
        throw new Error();
      const artifactJavaScript = new Set(
        files.map((file) => file.relative).filter((file) => /\.(?:c|m)?js$/i.test(file)),
      );
      const declaredFiles = new Set<string>();
      const declaredModules = new Set<string>();
      const chunks = parsed.chunks as Array<{
        file: string;
        modules: string[];
        imports: string[];
        dynamicImports: string[];
      }>;
      for (const chunk of chunks) {
        if (
          !chunk ||
          typeof chunk !== "object" ||
          typeof chunk.file !== "string" ||
          !Array.isArray(chunk.modules) ||
          !Array.isArray(chunk.imports) ||
          !Array.isArray(chunk.dynamicImports)
        )
          throw new Error();
        if (
          !/\.(?:c|m)?js$/i.test(chunk.file) ||
          path.isAbsolute(chunk.file) ||
          chunk.file.split("/").includes("..") ||
          declaredFiles.has(chunk.file) ||
          !artifactFiles.has(chunk.file) ||
          chunk.modules.length === 0
        )
          throw new Error();
        declaredFiles.add(chunk.file);
        for (const module of chunk.modules) {
          if (typeof module !== "string" || !module) throw new Error();
          const normalizedModule = normalizeModuleId(module);
          if (!normalizedModule || declaredModules.has(normalizedModule)) throw new Error();
          declaredModules.add(normalizedModule);
          inspectModuleReference(normalizedModule, chunk.file);
        }
        for (const imported of [...chunk.imports, ...chunk.dynamicImports]) {
          if (typeof imported !== "string") throw new Error();
        }
      }
      if (
        declaredFiles.size !== artifactJavaScript.size ||
        [...artifactJavaScript].some((file) => !declaredFiles.has(file)) ||
        chunks.some((chunk) =>
          [...chunk.imports, ...chunk.dynamicImports].some(
            (imported) => !declaredFiles.has(imported),
          ),
        )
      )
        throw new Error();
    } catch {
      failures.push(".proofline/modules.json: invalid Proofline module graph");
    }
  }

  for (const file of files) {
    if (/\.map$/i.test(file.relative)) {
      failures.push(`${file.relative}: source map files are forbidden`);
      continue;
    }
    const content = readFileSync(file.absolute, "utf8");
    for (const marker of forbiddenMarkers) {
      if (marker.path?.global || marker.path?.sticky) marker.path.lastIndex = 0;
      if (marker.content?.global || marker.content?.sticky) marker.content.lastIndex = 0;
      if (marker.path?.test(file.relative) || marker.content?.test(content))
        failures.push(`${file.relative}: forbidden ${marker.label}`);
    }
  }
  if (failures.length)
    throw new Error(`Production artifact contains forbidden test content:\n${failures.join("\n")}`);
};
