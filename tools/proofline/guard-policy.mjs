import { realpathSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const numericLoopback = (hostname) => {
  if (hostname === "[::1]") return true;
  const octets = hostname.split(".");
  return (
    octets.length === 4 && octets.every((part) => /^\d{1,3}$/.test(part)) && octets[0] === "127"
  );
};

export const normalizeAllowedOrigins = (origins) => {
  if (!Array.isArray(origins) || origins.length === 0)
    throw new Error("Proofline requires at least one exact loopback origin.");
  const normalized = origins.map((value, index) => {
    if (typeof value !== "string" || !value.trim())
      throw new Error(`Proofline allowlist entry ${index} must be a non-empty origin string.`);
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`Proofline allowlist entry ${index} is not a valid origin.`);
    }
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol))
      throw new Error(`Proofline allowlist entry ${index} uses an unsupported protocol.`);
    if (url.username || url.password)
      throw new Error(`Proofline allowlist entry ${index} must not contain credentials.`);
    if (!numericLoopback(url.hostname))
      throw new Error(`Proofline allowlist entry ${index} must use a numeric loopback host.`);
    if (url.pathname !== "/" || url.search || url.hash)
      throw new Error(`Proofline allowlist entry ${index} must be an exact origin.`);
    return url.origin;
  });
  if (new Set(normalized).size !== normalized.length)
    throw new Error("Proofline allowlist contains duplicate normalized origins.");
  return normalized;
};

export const parseAllowedOriginsEnvironment = (value) => {
  let parsed;
  try {
    parsed = JSON.parse(value ?? "");
  } catch {
    throw new Error("PROOFLINE_ALLOWED_ORIGINS must be a JSON array of exact loopback origins.");
  }
  return normalizeAllowedOrigins(parsed);
};

const childPurposes = new Set([
  "esbuild-service",
  "git-local",
  "nx-build",
  "playwright-browser",
  "playwright-cli",
  "playwright-ffmpeg",
  "pnpm-runner",
  "vitest-cli",
]);

export const normalizeAllowedChildCapabilities = (capabilities = []) => {
  if (!Array.isArray(capabilities))
    throw new Error("Proofline child capabilities must be an array.");
  const normalized = capabilities.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`Proofline child capability ${index} must be an object.`);
    const keys = Object.keys(value).sort();
    if (keys.join(",") !== "executable,purpose")
      throw new Error(
        `Proofline child capability ${index} must contain only executable and purpose.`,
      );
    if (typeof value.executable !== "string" || !path.isAbsolute(value.executable))
      throw new Error(`Proofline child capability ${index} must use an absolute executable path.`);
    if (typeof value.purpose !== "string" || !childPurposes.has(value.purpose))
      throw new Error(`Proofline child capability ${index} has an unsupported purpose.`);
    let executable;
    try {
      executable = realpathSync(value.executable);
      if (!statSync(executable).isFile()) throw new Error();
    } catch {
      throw new Error(`Proofline child capability ${index} must resolve to a file.`);
    }
    return { executable, purpose: value.purpose };
  });
  const identities = normalized.map((value) => `${value.executable}\0${value.purpose}`);
  if (new Set(identities).size !== identities.length)
    throw new Error("Proofline child capabilities contain duplicates.");
  return normalized;
};

export const parseAllowedChildCapabilitiesEnvironment = (value) => {
  let parsed;
  try {
    parsed = JSON.parse(value ?? "[]");
  } catch {
    throw new Error("PROOFLINE_ALLOWED_CHILD_CAPABILITIES must be a JSON array.");
  }
  return normalizeAllowedChildCapabilities(parsed);
};

export const guardPreloadUrl = pathToFileURL(
  path.join(import.meta.dirname, "egress-guard.mjs"),
).href;
export const guardImportOption = `--import=${guardPreloadUrl}`;
// Only the reviewed structured launcher attaches this in-memory marker. It lets a guarded runner
// create a more specific guarded child (for a newly allocated loopback server or exact browser
// executable) without honoring environment overrides from ordinary child_process calls.
export const prooflineDelegatedPolicy = Symbol.for("proofline.egress-guard.delegated-policy");

const safeGitIdentityEnvironment = new Set([
  "GIT_AUTHOR_EMAIL",
  "GIT_AUTHOR_NAME",
  "GIT_COMMITTER_EMAIL",
  "GIT_COMMITTER_NAME",
]);

export const unsafeGitEnvironmentKey = (key) =>
  key.startsWith("GIT_") && !safeGitIdentityEnvironment.has(key);

const unsafePreload = /(?:^|\s)(?:--require|-r|--import|--loader|--experimental-loader)(?:=|\s)/;

export const mergeGuardNodeOptions = (value = "") => {
  const withoutGuard = value.split(guardImportOption).join(" ").trim();
  if (unsafePreload.test(withoutGuard))
    throw new Error(
      "Proofline child NODE_OPTIONS cannot add a preload or loader that overrides the guard.",
    );
  return [withoutGuard, guardImportOption].filter(Boolean).join(" ");
};

export const guardedEnvironment = ({ env = {}, allowedOrigins, allowedChildCapabilities = [] }) => {
  const normalized = normalizeAllowedOrigins(allowedOrigins);
  const childCapabilities = normalizeAllowedChildCapabilities(allowedChildCapabilities);
  const guarded = {
    ...process.env,
    ...env,
    PROOFLINE_ALLOWED_ORIGINS: JSON.stringify(normalized),
    PROOFLINE_ALLOWED_CHILD_CAPABILITIES: JSON.stringify(childCapabilities),
    PROOFLINE_GUARD_PRELOAD: guardPreloadUrl,
    NODE_OPTIONS: mergeGuardNodeOptions(env.NODE_OPTIONS ?? process.env.NODE_OPTIONS ?? ""),
  };
  for (const key of Object.keys(guarded)) if (unsafeGitEnvironmentKey(key)) delete guarded[key];
  return guarded;
};

// This is an argv grammar, not Node's complete option catalog. An unknown option must
// not turn its next token into an apparent script and conceal a later preload.
const nodeBooleanOptions = new Set([
  "--enable-source-maps",
  "--experimental-strip-types",
  "--experimental-transform-types",
  "--experimental-import-meta-resolve",
  "--no-deprecation",
  "--no-warnings",
  "--trace-warnings",
  "--trace-deprecation",
  "--no-experimental-detect-module",
  "--no-experimental-require-module",
]);
const nodeOperandOptions = new Map([
  ["--conditions", (value) => value.length > 0],
  ["-C", (value) => value.length > 0],
  [
    "--input-type",
    (value) => ["module", "commonjs", "module-typescript", "commonjs-typescript"].includes(value),
  ],
  [
    "--unhandled-rejections",
    (value) => ["strict", "throw", "warn", "none", "warn-with-error-code"].includes(value),
  ],
  ["--max-old-space-size", (value) => /^[1-9]\d*$/.test(value)],
  ["--max-semi-space-size", (value) => /^[1-9]\d*$/.test(value)],
  ["--stack-trace-limit", (value) => /^\d+$/.test(value)],
  ["--eval", () => true],
  ["-e", () => true],
]);
// Print's expression is optional. Only the separate form is supported: Node's
// --print=... spelling can still consume the next token as its expression.
const nodeOptionalPrintOptions = new Set(["--print", "-p"]);
// V8's numeric options require their operand in the same argv token.
const nodeEqualsOnlyOptions = new Set([
  "--max-old-space-size",
  "--max-semi-space-size",
  "--stack-trace-limit",
]);

export const assertSafeNodeArgv = (argv = []) => {
  const reject = () => {
    throw new Error(
      "Proofline unsupported-child-plane: Node argv cannot replace preload execution or use an unreviewed option boundary.",
    );
  };
  if (
    !Array.isArray(argv) ||
    argv.some((value) => typeof value !== "string" || value.includes("\0"))
  )
    reject();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    // Node stops option processing at a script, stdin, or the explicit separator.
    if (value === "--" || value === "-" || !value.startsWith("-")) return;
    if (nodeBooleanOptions.has(value)) continue;
    if (nodeOptionalPrintOptions.has(value)) {
      const next = argv[index + 1];
      // A dash-prefixed token remains an option (or --/stdin), never source.
      if (next !== undefined && !next.startsWith("-")) index += 1;
      continue;
    }
    const equals = value.indexOf("=");
    const option = equals < 0 ? value : value.slice(0, equals);
    const validate = nodeOperandOptions.get(option);
    if (!validate || (equals < 0 && nodeEqualsOnlyOptions.has(option))) reject();
    const operand = equals < 0 ? argv[++index] : value.slice(equals + 1);
    if (
      typeof operand !== "string" ||
      (equals < 0 && operand.startsWith("-")) ||
      !validate(operand)
    )
      reject();
    // Eval consumes source, but does not end Node option parsing.
  }
};
