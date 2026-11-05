// Fixed GitHub.com transport. No configurable origin, retry, or ambient credential forwarding.
// Artifact API: https://docs.github.com/en/rest/actions/artifacts#download-an-artifact
// Reviewed storage names: GitHub-hosted runners reference and the 2026-10-22
// GitHub Actions blob-storage changelog (productionresultssa0..49, 100..199).
const nativeFetch = globalThis.fetch;
const transports = new WeakMap();
const diagnostics = new WeakMap();
const LIMITS = {
  timeoutMs: 30_000,
  maxPages: 100,
  maxJsonBytes: 8 * 1024 * 1024,
  maxArchiveBytes: 256 * 1024 * 1024,
};
function diagnosticError(message) {
  const diagnostic = `GitHub ${message}`;
  const error = new Error(diagnostic);
  diagnostics.set(error, diagnostic);
  return error;
}
const fail = (message) => {
  throw diagnosticError(message);
};
function bounded(value, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    fail("invalid transport bounds");
  return value;
}
function requestUrl(repository, route, binary) {
  if (
    typeof repository !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/.test(repository) ||
    [".", ".."].includes(repository.split("/")[1])
  )
    fail("invalid repository");
  if (typeof route !== "string" || /[\\#\s]/.test(route)) fail("invalid API route");
  const [pathname, query, extra] = route.split("?");
  if (extra !== undefined) fail("invalid API route");
  const archive = /^\/actions\/artifacts\/[1-9]\d*\/zip$/.test(pathname);
  const collection = /^\/actions\/(?:runs\/[1-9]\d*\/artifacts|workflows\/[1-9]\d*\/runs)$/.test(
    pathname,
  );
  let tagRoute = false;
  if (pathname.startsWith("/git/ref/tags/")) {
    const encoded = pathname.slice("/git/ref/tags/".length);
    try {
      const decoded = decodeURIComponent(encoded);
      tagRoute =
        encoded.length > 0 &&
        encodeURIComponent(decoded) === encoded &&
        ![...decoded].some(
          (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
        ) &&
        !/[~^:?*[\\]/.test(decoded) &&
        !decoded.includes("..") &&
        !decoded.includes("@{") &&
        !decoded
          .split("/")
          .some((part) => !part || part.startsWith(".") || part.endsWith(".lock")) &&
        !decoded.endsWith(".");
    } catch {
      /* Invalid encoding fails below. */
    }
  }
  if (
    !(
      archive ||
      collection ||
      tagRoute ||
      /^\/git\/tags\/[a-f0-9]{40}$/.test(pathname) ||
      /^\/actions\/(?:workflows\/verify\.yml|runs\/[1-9]\d*|artifacts\/[1-9]\d*)$/.test(pathname)
    ) ||
    Boolean(binary) !== archive
  )
    fail("invalid API route or response mode");
  if (query !== undefined) {
    if (!collection) fail("invalid API query");
    const seen = new Set();
    for (const [key, value] of new URLSearchParams(query)) {
      if (
        seen.has(key) ||
        !{
          head_sha: /^[a-f0-9]{40}$/,
          event: /^push$/,
          branch: /^main$/,
          status: /^success$/,
          per_page: /^100$/,
          page: /^(?:[1-9]|[1-9]\d|100)$/,
        }[key]?.test(value)
      )
        fail("invalid API query");
      seen.add(key);
    }
  }
  return `https://api.github.com/repos/${repository}${route}`;
}
function storageUrl(location) {
  let url;
  try {
    url = new URL(location);
  } catch {
    fail("unsafe artifact redirect");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !(
      url.hostname === "results-receiver.actions.githubusercontent.com" ||
      /^productionresultssa(?:[0-9]|[1-4][0-9]|1[0-9]{2})\.blob\.core\.windows\.net$/.test(
        url.hostname,
      )
    )
  )
    fail("unsafe artifact redirect");
  return url.href;
}
async function bodyBytes(response, maximum, signal) {
  if (![null, "identity"].includes(response.headers.get("content-encoding")))
    fail("unsupported response encoding");
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) ||
      !Number.isSafeInteger(Number(declared)) ||
      Number(declared) > maximum)
  )
    fail("response body exceeds bounds");
  const chunks = [];
  let length = 0;
  if (response.body) {
    const reader = response.body.getReader();
    const cancel = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maximum) {
          void reader.cancel().catch(() => {});
          fail("response body exceeds bounds");
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      signal.removeEventListener("abort", cancel);
      reader.releaseLock();
    }
  }
  if (declared !== null && Number(declared) !== length) fail("incomplete response length");
  return Buffer.concat(chunks, length);
}
export function githubTransportProvenance(api, list) {
  const identity = transports.get(api);
  return identity && identity === transports.get(list) ? identity.mode : "fixture";
}
export function createGithubReleaseApi(options = {}) {
  const { token } = options;
  if (typeof token !== "string" || !token || /[\r\n]/.test(token))
    fail("missing or invalid API token");
  // Capture the effective property once, including inherited/accessor options.
  const configuredFetch = options.fetchImpl;
  const fetchImpl = configuredFetch ?? nativeFetch;
  if (typeof fetchImpl !== "function") fail("invalid fetch implementation");
  const limits = Object.fromEntries(
    Object.entries(LIMITS).map(([key, maximum]) => [
      key,
      bounded(options[key] ?? maximum, maximum),
    ]),
  );
  const identity = {
    mode: configuredFetch != null || Object.hasOwn(options, "fetchImpl") ? "fixture" : "hosted",
  };
  async function api(repository, route, legacyToken = token, binary = false) {
    const url = requestUrl(repository, route, binary);
    if (legacyToken !== token) fail("inconsistent API credential");
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(diagnosticError("request timed out"));
      }, limits.timeoutMs);
    });
    const request = async () => {
      let destination = url;
      for (let redirects = 0; redirects <= 3; redirects++) {
        const response = await fetchImpl(destination, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers:
            destination === url
              ? {
                  Authorization: `Bearer ${token}`,
                  Accept: "application/vnd.github+json",
                  "X-GitHub-Api-Version": "2022-11-28",
                  "Accept-Encoding": "identity",
                }
              : { Accept: "application/octet-stream", "Accept-Encoding": "identity" },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          void response.body?.cancel().catch(() => {});
          if (!binary || redirects === 3) fail("unexpected or excessive artifact redirect");
          destination = storageUrl(response.headers.get("location"));
          continue;
        }
        if (response.status !== 200) {
          void response.body?.cancel().catch(() => {});
          fail(
            `release authority HTTP ${Number.isInteger(response.status) ? response.status : "invalid"}`,
          );
        }
        const bytes = await bodyBytes(
          response,
          binary ? limits.maxArchiveBytes : limits.maxJsonBytes,
          controller.signal,
        );
        if (binary) return bytes;
        try {
          return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        } catch {
          fail("malformed response JSON");
        }
      }
    };
    try {
      return await Promise.race([request(), timeout]);
    } catch (error) {
      // Copy only privately recorded diagnostics into a fresh Error. Never inspect
      // external Error fields or forward their stack, cause, accessors or properties.
      throw new Error(diagnostics.get(error) ?? "GitHub release authority network or body failure");
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  async function list(repository, route, key, legacyToken = token) {
    if (!["artifacts", "workflow_runs"].includes(key) || /[?&](?:page|per_page)=/.test(route))
      fail("invalid collection request");
    const values = [];
    for (let page = 1; page <= limits.maxPages; page++) {
      const value = await api(
        repository,
        `${route}${route.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
        legacyToken,
      );
      if (!Array.isArray(value?.[key]) || value[key].length > 100) fail("malformed collection");
      values.push(...value[key]);
      if (value[key].length < 100) return values;
    }
    fail("collection exceeds verification bounds");
  }
  transports.set(api, identity);
  transports.set(list, identity);
  return { api, list };
}
