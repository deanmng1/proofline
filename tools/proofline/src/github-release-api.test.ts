import { inspect } from "node:util";
import { describe, expect, test } from "vitest";
// @ts-expect-error Portable JavaScript entrypoint.
import { createGithubReleaseApi } from "../github-release-api.mjs";

const repository = "acme/proofline";
const token = "offline-secret-never-echo";
const records = Array.from({ length: 100 }, (_, id) => ({ id }));
const json = (value: unknown, init?: ResponseInit) => new Response(JSON.stringify(value), init);

describe("bounded GitHub release transport", () => {
  test("collects complete bounded pages with exact authenticated API requests", async () => {
    const urls: string[] = [];
    const transport = createGithubReleaseApi({
      token,
      fetchImpl: async (url: string, init: RequestInit) => {
        urls.push(url);
        expect(init.redirect).toBe("manual");
        expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${token}`);
        expect(new Headers(init.headers).get("x-github-api-version")).toBe("2022-11-28");
        return json({ artifacts: urls.length === 1 ? records : [{ id: 100 }] });
      },
    });
    expect(
      await transport.list(repository, "/actions/runs/123/artifacts", "artifacts", token),
    ).toHaveLength(101);
    expect(urls).toEqual(
      [1, 2].map(
        (page) =>
          `https://api.github.com/repos/${repository}/actions/runs/123/artifacts?per_page=100&page=${page}`,
      ),
    );
  });
  test.each([401, 403, 404, 410, 429, 500])("sanitizes HTTP failure %s", async (status) => {
    const { api } = createGithubReleaseApi({
      token,
      fetchImpl: async () => new Response(token, { status }),
    });
    await expect(api(repository, "/actions/runs/123", token)).rejects.toThrow(`HTTP ${status}`);
    try {
      await api(repository, "/actions/runs/123", token);
    } catch (error) {
      expect(String(error)).not.toContain(token);
    }
  });
  test("sanitizes network and malformed JSON errors", async () => {
    for (const fetchImpl of [
      async () => {
        throw new Error(token);
      },
      async () => new Response(`{${token}`),
    ]) {
      const { api } = createGithubReleaseApi({ token, fetchImpl });
      await expect(api(repository, "/actions/runs/123", token)).rejects.toThrow(/GitHub/);
      try {
        await api(repository, "/actions/runs/123", token);
      } catch (error) {
        expect(String(error)).not.toContain(token);
      }
    }
  });
  test("bounds pages and rejects malformed or oversized collections", async () => {
    for (const artifacts of [null, {}, Array(101).fill(1)]) {
      const { list } = createGithubReleaseApi({
        token,
        fetchImpl: async () => json({ artifacts }),
      });
      await expect(
        list(repository, "/actions/runs/123/artifacts", "artifacts", token),
      ).rejects.toThrow(/collection/);
    }
    const { list } = createGithubReleaseApi({
      token,
      maxPages: 1,
      fetchImpl: async () => json({ artifacts: records }),
    });
    await expect(
      list(repository, "/actions/runs/123/artifacts", "artifacts", token),
    ).rejects.toThrow(/bounds/);
  });
  test("requests identity encoding and rejects compressed response ambiguity", async () => {
    const { api } = createGithubReleaseApi({
      token,
      fetchImpl: async (_url: string, init: RequestInit) => {
        expect(new Headers(init.headers).get("accept-encoding")).toBe("identity");
        return new Response("{}", { headers: { "content-encoding": "gzip" } });
      },
    });
    await expect(api(repository, "/actions/runs/123", token)).rejects.toThrow(/encoding/);
  });
  test("bounds streamed and declared bodies and rejects truncated downloads", async () => {
    for (const response of [
      new Response("123456"),
      new Response("{}", { headers: { "content-length": "6" } }),
      new Response("{}", { headers: { "content-length": "3" } }),
    ]) {
      const { api } = createGithubReleaseApi({
        token,
        maxJsonBytes: 5,
        fetchImpl: async () => response,
      });
      await expect(api(repository, "/actions/runs/123", token)).rejects.toThrow(/body|length/);
    }
    const { api } = createGithubReleaseApi({
      token,
      maxArchiveBytes: 2,
      fetchImpl: async () => new Response("zip"),
    });
    await expect(api(repository, "/actions/artifacts/456/zip", token, true)).rejects.toThrow(
      /body/,
    );
  });
  test("times out fetch and stalled body reads within the same request budget", async () => {
    for (const fetchImpl of [
      () => new Promise(() => {}),
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([123]));
            },
          }),
        ),
    ]) {
      const { api } = createGithubReleaseApi({ token, timeoutMs: 10, fetchImpl });
      await expect(api(repository, "/actions/runs/123", token)).rejects.toThrow(/timed out/);
    }
  });
  test("cancels a stalled response body on timeout", async () => {
    let cancelled = false;
    const { api } = createGithubReleaseApi({
      token,
      timeoutMs: 10,
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
        ),
    });
    await expect(api(repository, "/actions/runs/123", token)).rejects.toThrow(/timed out/);
    expect(cancelled).toBe(true);
  });
  test("downloads bytes only through reviewed HTTPS storage and strips credentials", async () => {
    const signed =
      "https://productionresultssa199.blob.core.windows.net/actions-results/artifact.zip?sig=secret";
    const { api } = createGithubReleaseApi({
      token,
      fetchImpl: async (url: string, init: RequestInit) => {
        if (url.startsWith("https://api.github.com/"))
          return new Response(null, { status: 302, headers: { location: signed } });
        expect(url).toBe(signed);
        expect(new Headers(init.headers).has("authorization")).toBe(false);
        expect(init.redirect).toBe("manual");
        return new Response(new Uint8Array([1, 2, 3]));
      },
    });
    expect(await api(repository, "/actions/artifacts/456/zip", token, true)).toEqual(
      Buffer.from([1, 2, 3]),
    );
  });
  test.each([
    "http://productionresultssa1.blob.core.windows.net/x",
    "https://evil.example/x?sig=secret",
    "https://productionresultssa1.blob.core.windows.net.evil.example/x",
    "https://user:secret@productionresultssa1.blob.core.windows.net/x",
    "https://productionresultssa1.blob.core.windows.net:444/x",
    "/relative",
  ])("rejects unreviewed redirect %s", async (location) => {
    let count = 0;
    const { api } = createGithubReleaseApi({
      token,
      fetchImpl: async () => {
        count++;
        return new Response(null, { status: 302, headers: { location } });
      },
    });
    await expect(api(repository, "/actions/artifacts/456/zip", token, true)).rejects.toThrow(
      /redirect/,
    );
    expect(count).toBe(1);
  });
  test("rejects redirects for JSON, missing locations and storage redirect loops", async () => {
    for (const [route, binary, location] of [
      ["/actions/runs/123", false, "https://results-receiver.actions.githubusercontent.com/x"],
      ["/actions/artifacts/456/zip", true, ""],
      [
        "/actions/artifacts/456/zip",
        true,
        "https://results-receiver.actions.githubusercontent.com/x",
      ],
    ] as const) {
      const { api } = createGithubReleaseApi({
        token,
        fetchImpl: async () => new Response(null, { status: 302, headers: { location } }),
      });
      await expect(api(repository, route, token, binary)).rejects.toThrow(/redirect/);
    }
  });
  test("rejects unsafe repository routes and bounds before any request", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return json({});
    };
    const { api, list } = createGithubReleaseApi({ token, fetchImpl });
    for (const repo of [
      "../proofline",
      "acme/..",
      "acme/proofline?token=x",
      "acme/proofline/other",
    ])
      await expect(api(repo, "/actions/runs/123", token)).rejects.toThrow();
    for (const route of [
      "//evil.example/x",
      "/actions/../secrets",
      "/actions/runs/123?token=x",
      "/actions/runs/123#secret",
      "/git/ref/tags/..",
      "/git/ref/tags/%0A",
    ])
      await expect(api(repository, route, token)).rejects.toThrow();
    await expect(
      list(repository, "/actions/runs/123/artifacts?page=2", "artifacts", token),
    ).rejects.toThrow();
    for (const timeoutMs of [0, -1, Infinity, 30001])
      expect(() => createGithubReleaseApi({ token, fetchImpl, timeoutMs })).toThrow();
    expect(calls).toBe(0);
  });
  test.each(["fetch", "body"])(
    "sanitizes the complete returned exception from an injected %s failure",
    async (plane) => {
      const signed = "SIGNED-URL-SENTINEL";
      const credential = "TOKEN-SENTINEL";
      const external = Object.assign(new Error("GitHub request timed out", { cause: { signed } }), {
        credential,
        nested: { signed },
      });
      external.stack += `\n${credential} ${signed}`;
      Object.defineProperty(external, "hidden", { value: credential });
      Object.defineProperty(external, Symbol(signed), { value: credential });
      const { api } = createGithubReleaseApi({
        token,
        fetchImpl: async () => {
          if (plane === "fetch") throw external;
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.error(external);
              },
            }),
          );
        },
      });
      const returned = await api(repository, "/actions/runs/123", token).catch(
        (error: unknown) => error,
      );
      expect(returned).toBeInstanceOf(Error);
      expect(returned).not.toBe(external);
      expect(Reflect.ownKeys(returned)).toEqual(expect.arrayContaining(["stack", "message"]));
      expect(Reflect.ownKeys(returned)).toHaveLength(2);
      const complete = inspect(returned, { showHidden: true, depth: null });
      expect(complete).not.toContain(credential);
      expect(complete).not.toContain(signed);
    },
  );
});
