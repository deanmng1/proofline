import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
// @ts-expect-error Portable JavaScript entrypoint.
import { auditRepositorySafeguards, validateSafeguardPolicy } from "../repository-safeguards.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const checks = [
  { context: "verify (linux-x64-chromium)", appId: 15368 },
  { context: "verify (darwin-arm64-chromium)", appId: 15368 },
];
const policy = () => ({
  schemaVersion: 1,
  repository: "deanmng1/proofline",
  ref: "refs/heads/main",
  requiredChecks: structuredClone(checks),
  controls: {
    pullRequests: true,
    minimumApprovals: 0,
    upToDate: true,
    conversationsResolved: true,
    blockDeletion: true,
    blockForcePush: true,
    noBypass: true,
    privateVulnerabilityReporting: true,
  },
});
const prefix = "/repos/deanmng1/proofline";
const response = <T>(suffix: string, body: T, status = 200) => ({
  path: `${prefix}${suffix}`,
  status,
  body,
});
const observation = () => ({
  schemaVersion: 1,
  repository: "deanmng1/proofline",
  ref: "refs/heads/main",
  observedAt: "2026-11-06T18:00:00Z",
  repositoryResponse: response("", { full_name: "deanmng1/proofline", default_branch: "main" }),
  branch: response("/branches/main", { name: "main", protected: true }),
  protection: response("/branches/main/protection", {
    required_status_checks: {
      strict: true,
      contexts: checks.map((check) => check.context),
      checks: checks.map((check) => ({ context: check.context, app_id: check.appId })),
    },
    enforce_admins: { enabled: true },
    required_pull_request_reviews: {
      required_approving_review_count: 0,
      bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
    },
    required_conversation_resolution: { enabled: true },
    allow_deletions: { enabled: false },
    allow_force_pushes: { enabled: false },
  }),
  effectiveRules: {
    ...response("/rules/branches/main", [] as Record<string, unknown>[]),
    complete: true,
  },
  rulesets: [] as ReturnType<typeof response>[],
  privateReporting: response("/private-vulnerability-reporting", { enabled: true }),
});
const rulesObservation = () => {
  const data = observation();
  data.protection.status = 404;
  data.protection.body = null as never;
  const rules = [
    {
      type: "pull_request",
      parameters: { required_approving_review_count: 0, required_review_thread_resolution: true },
    },
    {
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: checks.map((check) => ({
          context: check.context,
          integration_id: check.appId,
        })),
      },
    },
    { type: "deletion" },
    { type: "non_fast_forward" },
  ];
  data.effectiveRules.body = rules.map((rule) => ({
    ...rule,
    ruleset_id: 42,
    ruleset_source_type: "Repository",
    ruleset_source: "deanmng1/proofline",
  }));
  data.rulesets = [
    response("/rulesets/42?includes_parents=true", {
      id: 42,
      source_type: "Repository",
      source: "deanmng1/proofline",
      target: "branch",
      enforcement: "active",
      bypass_actors: [],
      conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
      rules,
    }),
  ];
  return data;
};
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("repository safeguard policy and effective audit", () => {
  test("accepts the checked-in exact policy and preserves stricter observations without mutation", () => {
    const loaded = JSON.parse(
      readFileSync(path.join(root, ".github/proofline-safeguards.json"), "utf8"),
    );
    expect(validateSafeguardPolicy(loaded)).toEqual(policy());
    const data = observation();
    data.protection.body.required_status_checks.checks.push({
      context: "extra check",
      app_id: 999,
    });
    data.protection.body.required_status_checks.contexts.push("extra check");
    data.protection.body.required_pull_request_reviews.required_approving_review_count = 2;
    const before = JSON.stringify(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(true);
    expect(report.mismatches).toEqual([]);
    expect(report.limitations.join(" ")).toMatch(/single maintainer.*zero.*human approval/i);
    expect(report.effective.minimumApprovals).toBe(2);
    expect(JSON.stringify(data)).toBe(before);
    expect(report.remediation.automaticMutation).toBe(false);
  });
  test("rejects wrong repository in minimum policy", () => {
    const mutate = (p: ReturnType<typeof policy>) => {
      p.repository = "elsewhere/proofline";
    };

    const value = policy();
    mutate(value);
    expect(() => validateSafeguardPolicy(value)).toThrow();
  });
  test("rejects wrong ref in minimum policy", () => {
    const mutate = (p: ReturnType<typeof policy>) => {
      p.ref = "refs/heads/develop";
    };

    const value = policy();
    mutate(value);
    expect(() => validateSafeguardPolicy(value)).toThrow();
  });
  test("rejects missing check in minimum policy", () => {
    const mutate = (p: ReturnType<typeof policy>) => {
      p.requiredChecks.pop();
    };

    const value = policy();
    mutate(value);
    expect(() => validateSafeguardPolicy(value)).toThrow();
  });
  test("rejects wrong source app in minimum policy", () => {
    const mutate = (p: ReturnType<typeof policy>) => {
      p.requiredChecks[0].appId = 999;
    };

    const value = policy();
    mutate(value);
    expect(() => validateSafeguardPolicy(value)).toThrow();
  });
  test("rejects duplicate check in minimum policy", () => {
    const mutate = (p: ReturnType<typeof policy>) => {
      p.requiredChecks.push(p.requiredChecks[0]);
    };

    const value = policy();
    mutate(value);
    expect(() => validateSafeguardPolicy(value)).toThrow();
  });
  test("rejects unknown policy field in minimum policy", () => {
    const mutate = (p: ReturnType<typeof policy>) => {
      Object.assign(p, { bypass: true });
    };

    const value = policy();
    mutate(value);
    expect(() => validateSafeguardPolicy(value)).toThrow();
  });
  test("rejects unknown control in minimum policy", () => {
    const mutate = (p: ReturnType<typeof policy>) => {
      Object.assign(p.controls, { bypass: false });
    };

    const value = policy();
    mutate(value);
    expect(() => validateSafeguardPolicy(value)).toThrow();
  });
  test("rejects missing control in minimum policy", () => {
    const mutate = (p: ReturnType<typeof policy>) => {
      Reflect.deleteProperty(p.controls, "noBypass");
    };

    const value = policy();
    mutate(value);
    expect(() => validateSafeguardPolicy(value)).toThrow();
  });
  test("rejects weakened control in minimum policy", () => {
    const mutate = (p: ReturnType<typeof policy>) => {
      Object.assign(p.controls, { blockDeletion: false });
    };

    const value = policy();
    mutate(value);
    expect(() => validateSafeguardPolicy(value)).toThrow();
  });
  test("rejects invalid approval count in minimum policy", () => {
    const mutate = (p: ReturnType<typeof policy>) => {
      p.controls.minimumApprovals = -1;
    };

    const value = policy();
    mutate(value);
    expect(() => validateSafeguardPolicy(value)).toThrow();
  });
  test("fails closed on wrong observation repository", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.repository = "other/repo";
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on wrong observation ref", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.ref = "refs/heads/other";
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on wrong API repository", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.repositoryResponse.body.full_name = "other/repo";
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on wrong API path", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.branch.path = "/repos/other/repo/branches/main";
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on wrong API branch", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.branch.body.name = "develop";
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on unprotected branch", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.branch.body.protected = false;
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on missing protection", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.protection.status = 404;
      d.protection.body = null as never;
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on unavailable enforcement", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.protection.status = 403;
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on missing check", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.protection.body.required_status_checks.checks.pop();
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on wrong check context", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.protection.body.required_status_checks.checks[0].context = "verify";
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on wrong check app", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.protection.body.required_status_checks.checks[0].app_id = 999;
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on unbound check app", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      Reflect.deleteProperty(d.protection.body.required_status_checks.checks[0], "app_id");
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on stale checks", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.protection.body.required_status_checks.strict = false;
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on missing PR control", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.protection.body.required_pull_request_reviews = null as never;
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on administrator bypass", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.protection.body.enforce_admins.enabled = false;
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on PR bypass actor", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      Object.assign(
        d.protection.body.required_pull_request_reviews.bypass_pull_request_allowances,
        { users: [{ login: "owner" }] },
      );
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on missing bypass evidence", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      Reflect.deleteProperty(
        d.protection.body.required_pull_request_reviews,
        "bypass_pull_request_allowances",
      );
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on deletion allowed", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.protection.body.allow_deletions.enabled = true;
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on force allowed", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.protection.body.allow_force_pushes.enabled = true;
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on unresolved conversations", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.protection.body.required_conversation_resolution.enabled = false;
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on missing critical field", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      Reflect.deleteProperty(d.protection.body, "allow_force_pushes");
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on disabled reporting", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.privateReporting.body.enabled = false;
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on unknown reporting", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.privateReporting.status = 404;
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on truncated rules", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.effectiveRules.complete = false;
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on missing active-rules response", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      Reflect.deleteProperty(d, "effectiveRules");
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on unknown input field", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      Object.assign(d, { enforced: true });
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("fails closed on invalid timestamp", () => {
    const mutate = (d: ReturnType<typeof observation>) => {
      d.observedAt = "yesterday";
    };

    const data = observation();
    mutate(data);
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
  test("reports every absent minimum and provides an additive ruleset payload with explicit recovery", () => {
    const data = observation();
    data.protection.status = 404;
    data.protection.body = null as never;
    data.privateReporting.body.enabled = false;
    const report = auditRepositorySafeguards(policy(), data);
    expect(report.mismatches.map((item: { code: string }) => item.code)).toEqual(
      expect.arrayContaining([
        "pull-requests",
        "required-check",
        "up-to-date",
        "conversation-resolution",
        "block-deletion",
        "block-force-push",
        "private-reporting",
      ]),
    );
    expect(report.remediation.ruleset).toMatchObject({
      method: "POST",
      path: "/repos/deanmng1/proofline/rulesets",
      body: {
        enforcement: "active",
        target: "branch",
        bypass_actors: [],
        conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
      },
    });
    expect(report.remediation.recovery.join(" ")).toMatch(/saved.*newly created.*stronger/i);
  });
  test("accepts applicable active rulesets and retains additional signature controls", () => {
    const data = rulesObservation();
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(true);
    const detail = data.rulesets[0].body as {
      rules: Array<{ type: string; parameters?: unknown }>;
    };
    detail.rules.push({ type: "required_signatures" });
    data.effectiveRules.body.push({
      type: "required_signatures",
      ruleset_id: 42,
      ruleset_source_type: "Repository",
      ruleset_source: "deanmng1/proofline",
    });
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(true);
  });
  test("accepts explicit 404/null protection absence with sufficient active rules", () => {
    const data = rulesObservation();
    expect(data.protection).toMatchObject({ status: 404, body: null });
    expect(auditRepositorySafeguards(policy(), data)).toMatchObject({ ok: true, mismatches: [] });
  });
  test("rejects malformed protection 200/null despite sufficient alternate enforcement", () => {
    const status = 200;
    const body = null;

    const data = rulesObservation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    const result = auditRepositorySafeguards(policy(), data);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "protection" })]),
    );
  });
  test("rejects malformed protection 200/false despite sufficient alternate enforcement", () => {
    const status = 200;
    const body = false;

    const data = rulesObservation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    const result = auditRepositorySafeguards(policy(), data);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "protection" })]),
    );
  });
  test("rejects malformed protection 200/zero despite sufficient alternate enforcement", () => {
    const status = 200;
    const body = 0;

    const data = rulesObservation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    const result = auditRepositorySafeguards(policy(), data);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "protection" })]),
    );
  });
  test("rejects malformed protection 200/empty string despite sufficient alternate enforcement", () => {
    const status = 200;
    const body = "";

    const data = rulesObservation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    const result = auditRepositorySafeguards(policy(), data);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "protection" })]),
    );
  });
  test("rejects malformed protection 200/array despite sufficient alternate enforcement", () => {
    const status = 200;
    const body: unknown[] = [];

    const data = rulesObservation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    const result = auditRepositorySafeguards(policy(), data);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "protection" })]),
    );
  });
  test("rejects malformed protection 200/empty object despite sufficient alternate enforcement", () => {
    const status = 200;
    const body = {};

    const data = rulesObservation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    const result = auditRepositorySafeguards(policy(), data);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "protection" })]),
    );
  });
  test("rejects malformed protection 404/object despite sufficient alternate enforcement", () => {
    const status = 404;
    const body = { unexpected: "native failure" };

    const data = rulesObservation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    const result = auditRepositorySafeguards(policy(), data);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "protection" })]),
    );
  });
  test("rejects malformed protection 404/false despite sufficient alternate enforcement", () => {
    const status = 404;
    const body = false;

    const data = rulesObservation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    const result = auditRepositorySafeguards(policy(), data);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "protection" })]),
    );
  });
  test("rejects malformed protection 404/zero despite sufficient alternate enforcement", () => {
    const status = 404;
    const body = 0;

    const data = rulesObservation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    const result = auditRepositorySafeguards(policy(), data);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "protection" })]),
    );
  });
  test("rejects malformed protection 404/empty string despite sufficient alternate enforcement", () => {
    const status = 404;
    const body = "";

    const data = rulesObservation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    const result = auditRepositorySafeguards(policy(), data);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "protection" })]),
    );
  });
  test("rejects malformed protection 404/array despite sufficient alternate enforcement", () => {
    const status = 404;
    const body: unknown[] = [];

    const data = rulesObservation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    const result = auditRepositorySafeguards(policy(), data);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "protection" })]),
    );
  });
  test("rejects malformed protection 403/null despite sufficient alternate enforcement", () => {
    const status = 403;
    const body = null;

    const data = rulesObservation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    const result = auditRepositorySafeguards(policy(), data);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "protection" })]),
    );
  });
  test("withholds absence-dependent PUT for malformed protection 200/null", () => {
    const status = 200;
    const body = null;

    const data = observation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    expect(auditRepositorySafeguards(policy(), data).remediation.branchProtection).toBeNull();
  });
  test("withholds absence-dependent PUT for malformed protection 404/object", () => {
    const status = 404;
    const body = { unexpected: "native failure" };

    const data = observation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    expect(auditRepositorySafeguards(policy(), data).remediation.branchProtection).toBeNull();
  });
  test("withholds absence-dependent PUT for malformed protection 404/false", () => {
    const status = 404;
    const body = false;

    const data = observation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    expect(auditRepositorySafeguards(policy(), data).remediation.branchProtection).toBeNull();
  });
  test("withholds absence-dependent PUT for malformed protection 404/zero", () => {
    const status = 404;
    const body = 0;

    const data = observation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    expect(auditRepositorySafeguards(policy(), data).remediation.branchProtection).toBeNull();
  });
  test("withholds absence-dependent PUT for malformed protection 404/empty string", () => {
    const status = 404;
    const body = "";

    const data = observation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    expect(auditRepositorySafeguards(policy(), data).remediation.branchProtection).toBeNull();
  });
  test("withholds absence-dependent PUT for malformed protection 404/array", () => {
    const status = 404;
    const body: unknown[] = [];

    const data = observation();
    data.protection.status = status as number;
    data.protection.body = body as never;
    expect(auditRepositorySafeguards(policy(), data).remediation.branchProtection).toBeNull();
  });
  test("does not accept inert/ambiguous rules: evaluate", () => {
    const mutate = (d: ReturnType<typeof rulesObservation>) => {
      Object.assign(d.rulesets[0].body as object, { enforcement: "evaluate" });
    };

    const data = rulesObservation();
    mutate(data);
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(false);
  });
  test("does not accept inert/ambiguous rules: disabled", () => {
    const mutate = (d: ReturnType<typeof rulesObservation>) => {
      Object.assign(d.rulesets[0].body as object, { enforcement: "disabled" });
    };

    const data = rulesObservation();
    mutate(data);
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(false);
  });
  test("does not accept inert/ambiguous rules: tag target", () => {
    const mutate = (d: ReturnType<typeof rulesObservation>) => {
      Object.assign(d.rulesets[0].body as object, { target: "tag" });
    };

    const data = rulesObservation();
    mutate(data);
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(false);
  });
  test("does not accept inert/ambiguous rules: inapplicable ref", () => {
    const mutate = (d: ReturnType<typeof rulesObservation>) => {
      Object.assign(d.rulesets[0].body as object, {
        conditions: { ref_name: { include: ["refs/heads/develop"], exclude: [] } },
      });
    };

    const data = rulesObservation();
    mutate(data);
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(false);
  });
  test("does not accept inert/ambiguous rules: excluded ref", () => {
    const mutate = (d: ReturnType<typeof rulesObservation>) => {
      Object.assign(d.rulesets[0].body as object, {
        conditions: { ref_name: { include: ["~ALL"], exclude: ["refs/heads/main"] } },
      });
    };

    const data = rulesObservation();
    mutate(data);
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(false);
  });
  test("does not accept inert/ambiguous rules: bypass", () => {
    const mutate = (d: ReturnType<typeof rulesObservation>) => {
      Object.assign(d.rulesets[0].body as object, {
        bypass_actors: [{ actor_type: "RepositoryRole", actor_id: 5, bypass_mode: "always" }],
      });
    };

    const data = rulesObservation();
    mutate(data);
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(false);
  });
  test("does not accept inert/ambiguous rules: unknown bypasses", () => {
    const mutate = (d: ReturnType<typeof rulesObservation>) => {
      Reflect.deleteProperty(d.rulesets[0].body as object, "bypass_actors");
    };

    const data = rulesObservation();
    mutate(data);
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(false);
  });
  test("does not accept inert/ambiguous rules: wrong source", () => {
    const mutate = (d: ReturnType<typeof rulesObservation>) => {
      d.effectiveRules.body[0].ruleset_source = "elsewhere/proofline";
    };

    const data = rulesObservation();
    mutate(data);
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(false);
  });
  test("does not accept inert/ambiguous rules: missing detail", () => {
    const mutate = (d: ReturnType<typeof rulesObservation>) => {
      d.rulesets = [];
    };

    const data = rulesObservation();
    mutate(data);
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(false);
  });
  test("does not accept inert/ambiguous rules: inactive rules absent from effective API", () => {
    const mutate = (d: ReturnType<typeof rulesObservation>) => {
      d.effectiveRules.body = [];
    };

    const data = rulesObservation();
    mutate(data);
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(false);
  });
  test("does not accept inert/ambiguous rules: missing rule", () => {
    const mutate = (d: ReturnType<typeof rulesObservation>) => {
      d.effectiveRules.body.pop();
    };

    const data = rulesObservation();
    mutate(data);
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(false);
  });
  test("does not accept inert/ambiguous rules: wrong app", () => {
    const mutate = (d: ReturnType<typeof rulesObservation>) => {
      const detail = d.rulesets[0].body as {
        rules: Array<{
          parameters?: { required_status_checks?: Array<{ integration_id: number }> };
        }>;
      };
      const check = detail.rules[1].parameters?.required_status_checks?.[0];
      if (check) check.integration_id = 999;
    };

    const data = rulesObservation();
    mutate(data);
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(false);
  });
  test("does not accept inert/ambiguous rules: unknown rule", () => {
    const mutate = (d: ReturnType<typeof rulesObservation>) => {
      d.effectiveRules.body.push({
        type: "future_bypass_control",
        ruleset_id: 42,
        ruleset_source_type: "Repository",
        ruleset_source: "deanmng1/proofline",
      });
    };

    const data = rulesObservation();
    mutate(data);
    expect(auditRepositorySafeguards(policy(), data).ok).toBe(false);
  });
  test("exposes bypass as a failed minimum", () => {
    const bypassed = observation();
    bypassed.protection.body.enforce_admins.enabled = false;
    expect(
      auditRepositorySafeguards(policy(), bypassed).mismatches.map(
        (item: { code: string }) => item.code,
      ),
    ).toContain("no-bypass");
  });
  test("offers PUT only for absent protection and empty active rules", () => {
    const absent = observation();
    absent.protection.status = 404;
    absent.protection.body = null as never;
    absent.branch.body.protected = false;
    const fresh = auditRepositorySafeguards(policy(), absent);
    expect(fresh.remediation.branchProtection).toMatchObject({
      observedAbsent: true,
      method: "PUT",
      path: "/repos/deanmng1/proofline/branches/main/protection",
      body: {
        enforce_admins: true,
        restrictions: null,
        required_pull_request_reviews: {
          required_approving_review_count: 0,
          bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
        },
        required_status_checks: {
          strict: true,
          checks: [
            { context: "verify (linux-x64-chromium)", app_id: 15368 },
            { context: "verify (darwin-arm64-chromium)", app_id: 15368 },
          ],
        },
        allow_force_pushes: false,
        allow_deletions: false,
        required_conversation_resolution: true,
      },
    });
    expect(
      auditRepositorySafeguards(policy(), observation()).remediation.branchProtection,
    ).toBeNull();
    expect(
      auditRepositorySafeguards(policy(), rulesObservation()).remediation.branchProtection,
    ).toBeNull();
  });
  test("validates stronger policy approvals and preserves ruleset approval requirements", () => {
    const minimum = policy();
    minimum.controls.minimumApprovals = 1;
    expect(auditRepositorySafeguards(minimum, observation()).ok).toBe(false);
    const data = rulesObservation();
    const detail = data.rulesets[0].body as {
      rules: Array<{ parameters?: { required_approving_review_count?: number } }>;
    };
    const parameters = detail.rules[0].parameters;
    if (parameters) parameters.required_approving_review_count = 2;
    const result = auditRepositorySafeguards(minimum, data);
    expect(result.ok).toBe(true);
    expect(result.effective.minimumApprovals).toBe(2);
  });
  test("retains high positive approval counts as a stronger minimum", () => {
    const data = observation();
    data.protection.body.required_pull_request_reviews.required_approving_review_count = 9;
    expect(auditRepositorySafeguards(policy(), data)).toMatchObject({
      ok: true,
      effective: { minimumApprovals: 9 },
    });
  });
  test("importing the module performs no audit or network operation", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `globalThis.fetch = () => { throw new Error("Network forbidden"); }; await import(${JSON.stringify(new URL("../repository-safeguards.mjs", import.meta.url).href)});`,
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
  });
  test("CLI is offline, explicit, non-mutating and exits nonzero for a failed observation", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "proofline-safeguards-"));
    directories.push(directory);
    const policyFile = path.join(directory, "policy.json");
    const input = path.join(directory, "observation.json");
    writeFileSync(policyFile, JSON.stringify(policy()));
    writeFileSync(input, JSON.stringify(observation()));
    const args = [
      path.join(root, "tools/proofline/repository-safeguards.mjs"),
      "--policy",
      policyFile,
      "--observation",
      input,
    ];
    const before = readdirSync(directory).map((file) => [
      file,
      readFileSync(path.join(directory, file), "utf8"),
    ]);
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      provenance: "offline-observation-unverified",
    });
    expect(
      readdirSync(directory).map((file) => [
        file,
        readFileSync(path.join(directory, file), "utf8"),
      ]),
    ).toEqual(before);
    const bad = observation();
    bad.privateReporting.body.enabled = false;
    writeFileSync(input, JSON.stringify(bad));
    expect(spawnSync(process.execPath, args, { encoding: "utf8" }).status).toBe(1);
    for (const extra of [
      ["--apply"],
      ["--token", "secret"],
      ["--policy", policyFile],
      ["--observation"],
    ]) {
      const invalid = spawnSync(process.execPath, [...args, ...extra], { encoding: "utf8" });
      expect(invalid.status).toBe(2);
      expect(invalid.stderr).not.toContain("secret");
    }
    expect(spawnSync(process.execPath, [args[0]], { encoding: "utf8" }).status).toBe(2);
  });
});
