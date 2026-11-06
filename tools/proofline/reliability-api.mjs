// Supplementary observations only; no artifact, redirect, or mutation routes.
const nativeFetch = globalThis.fetch;
const identities = new WeakMap();
const diagnostics = new WeakMap();
const error = (message) => {
  const messageText = `GitHub reliability ${message}`;
  const result = new Error(messageText);
  diagnostics.set(result, messageText);
  return result;
};
const limit = (value, maximum) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw error("invalid bounds");
  return value;
};
export function reliabilityTransportProvenance(api) {
  return identities.get(api) ?? "injected-offline";
}
export function reliabilityRepository(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(value) &&
    ![".", ".."].includes(value.split("/")[1])
  );
}
function requestUrl(repository, route) {
  if (!reliabilityRepository(repository) || typeof route !== "string" || /[\\#\s]/.test(route))
    throw error("invalid request");
  const [pathname, query, extra] = route.split("?");
  const collection =
    /^\/actions\/(?:workflows\/[1-9]\d*\/runs|runs\/[1-9]\d*\/attempts\/[1-9]\d*\/jobs)$/.test(
      pathname,
    );
  if (
    extra !== undefined ||
    !(
      pathname === "" ||
      pathname === "/actions/workflows/verify.yml" ||
      /^\/actions\/runs\/[1-9]\d*(?:\/attempts\/[1-9]\d*)?$/.test(pathname) ||
      collection
    )
  )
    throw error("invalid route");
  if (collection !== (query !== undefined)) throw error("invalid collection query");
  if (query !== undefined) {
    const seen = new Set();
    const isRuns = pathname.includes("/workflows/");
    for (const [key, value] of new URLSearchParams(query)) {
      const valid = {
        per_page: /^100$/,
        page: /^(?:[1-9]|10)$/,
        branch: /^[A-Za-z0-9_./-]{1,200}$/,
        created: /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\.\.\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/,
      }[key];
      if (seen.has(key) || !valid?.test(value) || (!isRuns && !["per_page", "page"].includes(key)))
        throw error("invalid query");
      seen.add(key);
    }
    if (
      !["per_page", "page", ...(isRuns ? ["branch", "created"] : [])].every((key) => seen.has(key))
    )
      throw error("missing query");
  }
  return `https://api.github.com/repos/${repository}${route}`;
}
export function createGithubReliabilityApi(options = {}) {
  const token = options.token;
  if (typeof token !== "string" || !token || /[\r\n]/.test(token)) throw error("missing token");
  const fetchImpl = options.fetchImpl ?? nativeFetch;
  if (typeof fetchImpl !== "function") throw error("invalid fetch implementation");
  const timeoutMs = limit(options.timeoutMs ?? 15000, 30000);
  const maxJsonBytes = limit(options.maxJsonBytes ?? 2 * 1024 * 1024, 8 * 1024 * 1024);
  async function api(repository, route) {
    const url = requestUrl(repository, route);
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(error("request timed out"));
      }, timeoutMs);
    });
    const request = async () => {
      let response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          redirect: "error",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Accept-Encoding": "identity",
          },
        });
      } catch {
        throw error("network failure");
      }
      if (
        [404, 410].includes(response.status) &&
        /^\/actions\/runs\/[1-9]\d*\/attempts\//.test(route)
      ) {
        void response.body?.cancel().catch(() => {});
        return { unavailable: response.status };
      }
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => {});
        throw error(`HTTP ${Number.isInteger(response.status) ? response.status : "invalid"}`);
      }
      const encoding = response.headers.get("content-encoding");
      const declared = response.headers.get("content-length");
      if (
        (encoding !== null && encoding !== "identity") ||
        (declared !== null &&
          (!/^\d+$/.test(declared) ||
            !Number.isSafeInteger(Number(declared)) ||
            Number(declared) > maxJsonBytes))
      ) {
        void response.body?.cancel().catch(() => {});
        throw error("response exceeds bounds or unsupported encoding");
      }
      const chunks = [];
      let size = 0;
      const reader = response.body?.getReader();
      const cancel = () => {
        void reader?.cancel().catch(() => {});
      };
      controller.signal.addEventListener("abort", cancel, { once: true });
      try {
        if (reader)
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxJsonBytes) {
              cancel();
              throw error("response exceeds bounds");
            }
            chunks.push(Buffer.from(value));
          }
      } catch {
        throw error("body failure or bounds exceeded");
      } finally {
        controller.signal.removeEventListener("abort", cancel);
        reader?.releaseLock();
      }
      if (declared !== null && Number(declared) !== size) throw error("incomplete response");
      try {
        return JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size)),
        );
      } catch {
        throw error("malformed JSON");
      }
    };
    try {
      return await Promise.race([request(), timeout]);
    } catch (caught) {
      throw new Error(diagnostics.get(caught) ?? "GitHub reliability network or body failure");
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  identities.set(
    api,
    options.fetchImpl != null || Object.hasOwn(options, "fetchImpl")
      ? "injected-offline"
      : "github-api",
  );
  return api;
}
