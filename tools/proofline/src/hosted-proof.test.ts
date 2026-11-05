import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, test } from "vitest";
// @ts-expect-error Portable JavaScript entrypoint.
import { createGithubReleaseApi, githubTransportProvenance } from "../github-release-api.mjs";
// @ts-expect-error Portable JavaScript entrypoint.
import { auditHostedProof, parseHostedProofArgs } from "../hosted-proof.mjs";

describe("hosted proof provenance and workflow preparation", () => {
  test("classifies injected transport as fixture regardless of caller declarations", () => {
    const fixture = createGithubReleaseApi({
      token: "offline",
      fetchImpl: async () => new Response("{}"),
      mode: "hosted",
    });
    const actual = createGithubReleaseApi({ token: "offline" });
    expect(githubTransportProvenance(fixture.api, fixture.list)).toBe("fixture");
    expect(githubTransportProvenance(actual.api, actual.list)).toBe("hosted");
    expect(githubTransportProvenance(actual.api, fixture.list)).toBe("fixture");
    expect(
      githubTransportProvenance(
        () => {},
        () => {},
      ),
    ).toBe("fixture");
  });
  test("parses one immutable source and refuses ambiguous unsupported CLI options", () => {
    const options = [
      "--repository",
      "acme/proofline",
      "--commit",
      "a".repeat(40),
      "--directory",
      "/tmp/verified",
      "--receipt",
      "/tmp/observation.json",
    ];
    expect(parseHostedProofArgs(options)).toMatchObject({
      repository: "acme/proofline",
      sourceCommit: "a".repeat(40),
      receipt: "/tmp/observation.json",
    });
    expect(
      parseHostedProofArgs(options.map((arg) => (arg === "--commit" ? "--tag" : arg))),
    ).toHaveProperty("tag");
    for (const args of [
      [],
      options.slice(0, -1),
      [...options, "--mode", "hosted"],
      [...options, "--tag", "v1"],
      [...options, "--commit", "b".repeat(40)],
      options.map((arg) => (arg === "/tmp/verified" ? "relative" : arg)),
    ])
      expect(() => parseHostedProofArgs(args)).toThrow();
  });
  test("rejects internal receipt destinations and missing authority before requesting", async () => {
    let calls = 0;
    const api = async () => {
      calls++;
      throw new Error("Must not request");
    };
    for (const receipt of ["/tmp/verified/receipt.json", "/tmp/verified"])
      await expect(
        auditHostedProof({
          repository: "acme/proofline",
          sourceCommit: "a".repeat(40),
          token: "offline",
          directory: "/tmp/verified",
          receipt,
          api,
          list: api,
        }),
      ).rejects.toThrow(/outside/);
    expect(calls).toBe(0);
  });
  test("prepares read-only exact-commit audit and manual immutable preview without production deployment", () => {
    const require = createRequire(import.meta.url);
    const yaml = createRequire(require.resolve("nx/package.json"))("yaml");
    const root = path.resolve(import.meta.dirname, "../../..");
    const audit = yaml.parse(
      readFileSync(path.join(root, ".github/workflows/hosted-proof.yml"), "utf8"),
    );
    const preview = yaml.parse(
      readFileSync(path.join(root, ".github/workflows/stage-demo.yml"), "utf8"),
    );
    const production = yaml.parse(
      readFileSync(path.join(root, ".github/workflows/deploy-demo.yml"), "utf8"),
    );
    expect(Object.keys(audit.on)).toEqual(["workflow_dispatch"]);
    expect(Object.keys(preview.on)).toEqual(["workflow_dispatch"]);
    expect(audit.permissions).toEqual({ contents: "read", actions: "read" });
    expect(preview.jobs.preview.environment).toBe("preview");
    expect(production.jobs.deploy.if).toContain("github.event.release.prerelease == false");
    for (const workflow of [audit, preview]) {
      const steps = (
        Object.values(workflow.jobs) as Array<{ steps: Array<Record<string, unknown>> }>
      )[0].steps;
      expect(steps[0].with).toMatchObject({
        ref: "$" + "{{ github.event.repository.default_branch }}",
        "persist-credentials": false,
      });
      for (const step of steps) if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
      const commands = steps.map((step) => step.run ?? "").join("\n");
      expect(commands).toContain("tools/proofline/hosted-proof.mjs");
      expect(commands).not.toMatch(
        /--prod|(?:pnpm|npm) (?:run )?build|git push|workflow run|rerun/,
      );
      expect(commands).not.toMatch(/echo.*TOKEN|printenv|set -x/);
      const uploads = steps.filter((step) =>
        String(step.uses).startsWith("actions/upload-artifact"),
      );
      expect(
        uploads.every((step) =>
          String((step.with as Record<string, unknown>).name).startsWith("proofline-observation-"),
        ),
      ).toBe(true);
    }
    const steps = preview.jobs.preview.steps;
    const check = steps.findIndex(
      (step: { name: string }) =>
        step.name === "Require preview credentials before provider invocation",
    );
    const deploy = steps.findIndex(
      (step: { name: string }) => step.name === "Deploy exact verified preview output",
    );
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(deploy);
    expect(steps[check].run).toContain(":?Preview project credentials are required");
    expect(steps[deploy].run).toContain("--package=vercel@65.11.0 -- vercel deploy --prebuilt");
    expect(steps[deploy].run).not.toContain("--prod");
  });
  test("classifies inherited effective fetch as fixture and captures its getter once", async () => {
    let reads = 0;
    let calls = 0;
    const options = Object.assign(
      Object.create({
        get fetchImpl() {
          reads++;
          return async () => {
            calls++;
            return new Response('{"fixture":true}');
          };
        },
      }),
      { token: "offline-inherited-fixture" },
    );
    const { api, list } = createGithubReleaseApi(options);
    expect(await api("acme/proofline", "/actions/runs/123")).toEqual({ fixture: true });
    expect(calls).toBe(1);
    expect(reads).toBe(1);
    expect(githubTransportProvenance(api, list)).toBe("fixture");
  });
});
