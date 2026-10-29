import { createHash, randomBytes } from "node:crypto";
import { createReadStream, readFileSync, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const capabilityPattern = /^[A-Za-z0-9_-]{32,128}$/;
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"],
]);

const capabilityDigest = (value) => createHash("sha256").update(value).digest();
const sameCapability = (left, right) => {
  if (!capabilityPattern.test(left ?? "") || !capabilityPattern.test(right ?? "")) return false;
  return capabilityDigest(left).equals(capabilityDigest(right));
};

export const startTestAppServer = async ({
  directory,
  capability,
  host = "127.0.0.1",
  port = 0,
}) => {
  if (!capabilityPattern.test(capability ?? ""))
    throw new Error("Proofline test server requires a fresh launcher capability.");
  if (host !== "127.0.0.1" && host !== "::1")
    throw new Error("Proofline test server may bind only to numeric loopback.");
  const root = realpathSync(directory);
  if (!statSync(root).isDirectory()) throw new Error("Proofline test artifact is not a directory.");
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const session = randomBytes(32).toString("base64url");
  let launchConsumed = false;

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://${host}`);
    const cookie = request.headers.cookie ?? "";
    const sessionAuthorized = cookie
      .split(";")
      .map((part) => part.trim())
      .includes(`__proofline_session=${session}`);
    const supplied = requestUrl.searchParams.get("__proofline_capability");
    const acceptsDocument = (request.headers.accept ?? "").includes("text/html");
    const documentRequest =
      requestUrl.pathname === "/" ||
      requestUrl.pathname === "/index.html" ||
      (acceptsDocument && !path.posix.extname(requestUrl.pathname));

    if (supplied !== null) {
      if (launchConsumed) {
        response.writeHead(409, { "content-type": "text/plain; charset=utf-8" });
        response.end("Proofline launch capability was already consumed.");
        return;
      }
      if (!sameCapability(capability, supplied)) {
        response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        response.end("Proofline launch capability was rejected.");
        return;
      }
      launchConsumed = true;
      response.setHeader(
        "set-cookie",
        `__proofline_session=${session}; HttpOnly; SameSite=Strict; Path=/`,
      );
    } else if (!sessionAuthorized) {
      response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      response.end("Proofline launch capability is required.");
      return;
    }

    if (documentRequest) {
      const adapter = request.headers["x-proofline-adapter"] === "context" ? "context" : "legacy";
      const injection = `<script>window.__PROOFLINE_TEST_BOOTSTRAP__=Object.freeze({capability:${JSON.stringify(capability)},adapter:${JSON.stringify(adapter)}});</script>`;
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(index.replace("<head>", `<head>${injection}`));
      return;
    }

    let decoded;
    try {
      decoded = decodeURIComponent(requestUrl.pathname);
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    const relative = decoded.replace(/^\/+/, "");
    const candidate = path.resolve(root, relative);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
      response.writeHead(400);
      response.end();
      return;
    }
    try {
      if (!statSync(candidate).isFile()) throw new Error("not a file");
      response.writeHead(200, {
        "content-type": contentTypes.get(path.extname(candidate)) ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      createReadStream(candidate).pipe(response);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Proofline server has no address.");
  return {
    origin: `http://${address.family === "IPv6" ? `[${address.address}]` : address.address}:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
};

const runCli = async () => {
  let directory;
  let port = 0;
  for (let index = 2; index < process.argv.length; index += 2) {
    const flag = process.argv[index];
    const value = process.argv[index + 1];
    if (flag === "--directory") directory = value;
    else if (flag === "--port") port = Number(value);
    else throw new Error(`Unknown Proofline test-server option: ${flag ?? "<missing>"}`);
  }
  if (!directory || !Number.isInteger(port) || port < 0 || port > 65_535)
    throw new Error("Usage: serve-test-app.mjs --directory <artifact> --port <port-or-zero>");
  const running = await startTestAppServer({
    directory,
    port,
    capability: process.env.PROOFLINE_TEST_CAPABILITY,
  });
  process.stdout.write(`${JSON.stringify({ origin: running.origin })}\n`);
  const stop = async () => {
    await running.close();
    process.exit(0);
  };
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
