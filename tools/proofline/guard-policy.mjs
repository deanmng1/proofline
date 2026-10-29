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

export const normalizeAllowedChildExecutables = (executables = []) => {
  if (!Array.isArray(executables))
    throw new Error("Proofline child executable allowlist must be an array.");
  const normalized = executables.map((value, index) => {
    if (typeof value !== "string" || !path.isAbsolute(value))
      throw new Error(`Proofline child executable ${index} must be an absolute path.`);
    let executable;
    try {
      executable = realpathSync(value);
      if (!statSync(executable).isFile()) throw new Error();
    } catch {
      throw new Error(`Proofline child executable ${index} must resolve to a file.`);
    }
    return executable;
  });
  if (new Set(normalized).size !== normalized.length)
    throw new Error("Proofline child executable allowlist contains duplicates.");
  return normalized;
};

export const parseAllowedChildExecutablesEnvironment = (value) => {
  let parsed;
  try {
    parsed = JSON.parse(value ?? "[]");
  } catch {
    throw new Error("PROOFLINE_ALLOWED_CHILD_EXECUTABLES must be a JSON array.");
  }
  return normalizeAllowedChildExecutables(parsed);
};

export const guardPreloadUrl = pathToFileURL(
  path.join(import.meta.dirname, "egress-guard.mjs"),
).href;
export const guardImportOption = `--import=${guardPreloadUrl}`;
// Only the reviewed structured launcher attaches this in-memory marker. It lets a guarded runner
// create a more specific guarded child (for a newly allocated loopback server or exact browser
// executable) without honoring environment overrides from ordinary child_process calls.
export const prooflineDelegatedPolicy = Symbol.for("proofline.egress-guard.delegated-policy");

const unsafePreload = /(?:^|\s)(?:--require|-r|--import|--loader|--experimental-loader)(?:=|\s)/;

export const mergeGuardNodeOptions = (value = "") => {
  const withoutGuard = value.split(guardImportOption).join(" ").trim();
  if (unsafePreload.test(withoutGuard))
    throw new Error(
      "Proofline child NODE_OPTIONS cannot add a preload or loader that overrides the guard.",
    );
  return [withoutGuard, guardImportOption].filter(Boolean).join(" ");
};

export const guardedEnvironment = ({ env = {}, allowedOrigins, allowedChildExecutables = [] }) => {
  const normalized = normalizeAllowedOrigins(allowedOrigins);
  const childExecutables = normalizeAllowedChildExecutables(allowedChildExecutables);
  return {
    ...process.env,
    ...env,
    PROOFLINE_ALLOWED_ORIGINS: JSON.stringify(normalized),
    PROOFLINE_ALLOWED_CHILD_EXECUTABLES: JSON.stringify(childExecutables),
    PROOFLINE_GUARD_PRELOAD: guardPreloadUrl,
    NODE_OPTIONS: mergeGuardNodeOptions(env.NODE_OPTIONS ?? process.env.NODE_OPTIONS ?? ""),
  };
};

export const assertSafeNodeArgv = (argv = []) => {
  for (const value of argv) {
    if (value === "--") break;
    if (!value.startsWith("-")) break;
    if (
      /^(?:--require|-r|--import|--loader|--experimental-loader)(?:=|$)/.test(value) ||
      /^--inspect(?:-brk|-port)?(?:=|$)/.test(value) ||
      /^--run(?:=|$)/.test(value)
    )
      throw new Error(
        "Proofline unsupported-child-plane: Node argv cannot replace preload execution.",
      );
  }
};
