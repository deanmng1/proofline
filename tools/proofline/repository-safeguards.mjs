import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const repository = "deanmng1/proofline";
const targetRef = "refs/heads/main";
const canonicalChecks = ["verify (linux-x64-chromium)", "verify (darwin-arm64-chromium)"];
const controlNames = [
  "pullRequests",
  "minimumApprovals",
  "upToDate",
  "conversationsResolved",
  "blockDeletion",
  "blockForcePush",
  "noBypass",
  "privateVulnerabilityReporting",
];
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const requireValue = (condition, message) => {
  if (!condition) throw new Error(message);
};
const keys = (value, required, optional = []) => {
  requireValue(object(value), "Expected an object");
  requireValue(
    required.every((key) => Object.hasOwn(value, key)),
    "Missing required fields",
  );
  requireValue(
    Object.keys(value).every((key) => [...required, ...optional].includes(key)),
    "Unknown fields",
  );
};
const approvalCount = (value) => Number.isSafeInteger(value) && value >= 0;
const array = (value) => Array.isArray(value) && value.length <= 1000;

/** A minimum policy, never a replacement instruction for installed stronger settings. */
export const validateSafeguardPolicy = (policy) => {
  keys(policy, ["schemaVersion", "repository", "ref", "requiredChecks", "controls"]);
  requireValue(
    policy.schemaVersion === 1 && policy.repository === repository && policy.ref === targetRef,
    "Policy must target schema 1 deanmng1/proofline refs/heads/main",
  );
  keys(policy.controls, controlNames);
  requireValue(
    controlNames.every((key) =>
      key === "minimumApprovals"
        ? approvalCount(policy.controls[key])
        : policy.controls[key] === true,
    ),
    "Every safeguard is mandatory; approval count must be a nonnegative safe integer",
  );
  requireValue(
    array(policy.requiredChecks) && policy.requiredChecks.length >= 2,
    "Required checks missing",
  );
  const identities = new Set();
  for (const check of policy.requiredChecks) {
    keys(check, ["context", "appId"]);
    requireValue(
      typeof check.context === "string" &&
        check.context.trim() === check.context &&
        check.context.length > 0 &&
        Number.isSafeInteger(check.appId) &&
        check.appId > 0,
      "Check requires exact context and positive app identity",
    );
    requireValue(!identities.has(check.context), "Duplicate check context");
    identities.add(check.context);
  }
  requireValue(
    canonicalChecks.every((context) =>
      policy.requiredChecks.some((check) => check.context === context && check.appId === 15368),
    ),
    "Both canonical Chromium checks must originate from GitHub Actions app 15368",
  );
  return structuredClone(policy);
};

const initialBranchProtection = (policy) => ({
  observedAbsent: true,
  precondition:
    "Re-read immediately before a separately reviewed administrator PUT: protection must still be 404, active rules empty, and exact repository/main unchanged. Existing protection must use additive ruleset remediation instead.",
  method: "PUT",
  path: `/repos/${repository}/branches/main/protection`,
  body: {
    required_status_checks: {
      strict: true,
      checks: policy.requiredChecks.map((check) => ({
        context: check.context,
        app_id: check.appId,
      })),
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      required_approving_review_count: policy.controls.minimumApprovals,
      bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
    },
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: true,
  },
});
const remediation = (policy, observedAbsent) => ({
  branchProtection: observedAbsent ? initialBranchProtection(policy) : null,
  automaticMutation: false,
  strategy:
    "Add a separately reviewed no-bypass main ruleset; preserve all existing protections, checks and positive approval counts.",
  ruleset: {
    method: "POST",
    path: `/repos/${repository}/rulesets`,
    body: {
      name: "Proofline main minimum safeguards",
      target: "branch",
      enforcement: "active",
      bypass_actors: [],
      conditions: { ref_name: { include: [targetRef], exclude: [] } },
      rules: [
        { type: "deletion" },
        { type: "non_fast_forward" },
        {
          type: "pull_request",
          parameters: {
            dismiss_stale_reviews_on_push: false,
            require_code_owner_review: false,
            require_last_push_approval: false,
            required_approving_review_count: policy.controls.minimumApprovals,
            required_review_thread_resolution: true,
          },
        },
        {
          type: "required_status_checks",
          parameters: {
            strict_required_status_checks_policy: true,
            do_not_enforce_on_create: false,
            required_status_checks: policy.requiredChecks.map((check) => ({
              context: check.context,
              integration_id: check.appId,
            })),
          },
        },
      ],
    },
  },
  privateReporting: { method: "PUT", path: `/repos/${repository}/private-vulnerability-reporting` },
  recovery: [
    "Before any separate administrator operation, save timestamped prior GET responses and current source identity, verify administrator recovery access, and review the exact additive payload.",
    "Retain the saved responses and newly created ruleset ID. If activation blocks authorized work, report the conflict; do not bypass or lower stronger settings.",
    "A separately authorized recovery may DELETE only the newly created ruleset by its saved ID after comparison with saved/current state; never replace existing stronger rules from a stale snapshot.",
    "For initial branch protection, recovery requires separate authorization, saved genuinely absent prestate, and a fresh full definition matching the installed snapshot with no intervening stronger settings; only then consider DELETE /repos/deanmng1/proofline/branches/main/protection.",
    "Private reporting should remain enabled; any separately authorized restoration of its prior disabled state requires an explicit recorded decision. Re-read and audit after recovery.",
  ],
});

const emptyControls = () => ({
  pullRequests: false,
  minimumApprovals: 0,
  upToDate: false,
  conversationsResolved: false,
  blockDeletion: false,
  blockForcePush: false,
  noBypass: false,
  checks: [],
});
const mergeControls = (effective, source) => {
  for (const key of [
    "pullRequests",
    "upToDate",
    "conversationsResolved",
    "blockDeletion",
    "blockForcePush",
  ])
    effective[key] ||= source[key];
  effective.noBypass = true;
  effective.minimumApprovals = Math.max(effective.minimumApprovals, source.minimumApprovals);
  effective.checks.push(...source.checks);
};
const bypassesEmpty = (value) => {
  keys(value, ["users", "teams", "apps"]);
  requireValue([value.users, value.teams, value.apps].every(array), "Unknown bypass actors");
  return value.users.length + value.teams.length + value.apps.length === 0;
};
const parseProtection = (body) => {
  requireValue(object(body), "Unknown branch protection");
  const result = emptyControls();
  for (const key of [
    "enforce_admins",
    "allow_deletions",
    "allow_force_pushes",
    "required_conversation_resolution",
  ])
    requireValue(
      object(body[key]) && typeof body[key].enabled === "boolean",
      `Missing/unknown ${key}`,
    );
  const pr = body.required_pull_request_reviews;
  requireValue(pr === null || object(pr), "Missing/unknown pull request settings");
  let noBypass = body.enforce_admins.enabled;
  if (pr !== null) {
    requireValue(approvalCount(pr.required_approving_review_count), "Unknown approval count");
    noBypass = bypassesEmpty(pr.bypass_pull_request_allowances) && noBypass;
    result.pullRequests = true;
    result.minimumApprovals = pr.required_approving_review_count;
  }
  const status = body.required_status_checks;
  requireValue(status === null || object(status), "Missing/unknown required checks");
  if (status !== null) {
    requireValue(
      typeof status.strict === "boolean" && array(status.checks),
      "Unknown check identity/strictness",
    );
    const contexts = new Set();
    for (const check of status.checks) {
      requireValue(
        object(check) &&
          typeof check.context === "string" &&
          check.context.length > 0 &&
          (check.app_id === null || Number.isSafeInteger(check.app_id)) &&
          !contexts.has(check.context),
        "Unknown/duplicate check identity",
      );
      contexts.add(check.context);
      result.checks.push({ context: check.context, appId: check.app_id });
    }
    result.upToDate = status.strict && status.checks.length > 0;
  }
  result.blockDeletion = !body.allow_deletions.enabled;
  result.blockForcePush = !body.allow_force_pushes.enabled;
  result.conversationsResolved = body.required_conversation_resolution.enabled;
  return { controls: result, noBypass };
};

// The effective-rules endpoint supplies applicability. Independently check simple ref conditions;
// unsupported patterns fail closed rather than emulate GitHub's fnmatch implementation.
const applicableRef = (conditions, defaultBranch) => {
  keys(conditions, ["ref_name"]);
  keys(conditions.ref_name, ["include", "exclude"]);
  const match = (pattern) => {
    requireValue(typeof pattern === "string", "Unknown ref condition");
    if (pattern === "~ALL") return true;
    if (pattern === "~DEFAULT_BRANCH") return targetRef === `refs/heads/${defaultBranch}`;
    requireValue(
      /^refs\/heads\/[A-Za-z0-9_./-]+$/.test(pattern),
      "Unsupported ref pattern; applicability unknown",
    );
    return pattern === targetRef;
  };
  const { include, exclude } = conditions.ref_name;
  requireValue(array(include) && array(exclude), "Unknown ref conditions");
  // Evaluate every entry so a matching literal does not hide an unsupported exclusion.
  const includes = include.map(match);
  const excludes = exclude.map(match);
  return includes.some(Boolean) && !excludes.some(Boolean);
};
const additiveRules = new Set([
  "creation",
  "update",
  "required_linear_history",
  "merge_queue",
  "required_deployments",
  "required_signatures",
  "commit_message_pattern",
  "commit_author_email_pattern",
  "committer_email_pattern",
  "branch_name_pattern",
  "file_path_restriction",
  "max_file_path_length",
  "file_extension_restriction",
  "max_file_size",
  "required_workflows",
  "code_scanning",
  "copilot_code_review",
]);
const parseRules = (rules) => {
  const result = emptyControls();
  for (const rule of rules) {
    requireValue(object(rule) && typeof rule.type === "string", "Unknown rule");
    if (rule.type === "deletion") result.blockDeletion = true;
    else if (rule.type === "non_fast_forward") result.blockForcePush = true;
    else if (rule.type === "pull_request") {
      const parameters = rule.parameters;
      requireValue(
        object(parameters) &&
          approvalCount(parameters.required_approving_review_count) &&
          typeof parameters.required_review_thread_resolution === "boolean",
        "Unknown pull request rule",
      );
      result.pullRequests = true;
      result.minimumApprovals = Math.max(
        result.minimumApprovals,
        parameters.required_approving_review_count,
      );
      result.conversationsResolved ||= parameters.required_review_thread_resolution;
    } else if (rule.type === "required_status_checks") {
      const parameters = rule.parameters;
      requireValue(
        object(parameters) &&
          typeof parameters.strict_required_status_checks_policy === "boolean" &&
          array(parameters.required_status_checks),
        "Unknown required check rule",
      );
      const contexts = new Set();
      for (const check of parameters.required_status_checks) {
        requireValue(
          object(check) &&
            typeof check.context === "string" &&
            check.context.length > 0 &&
            (check.integration_id === undefined ||
              check.integration_id === null ||
              Number.isSafeInteger(check.integration_id)) &&
            !contexts.has(check.context),
          "Unknown/duplicate ruleset check identity",
        );
        contexts.add(check.context);
        result.checks.push({ context: check.context, appId: check.integration_id ?? null });
      }
      result.upToDate ||=
        parameters.strict_required_status_checks_policy &&
        parameters.required_status_checks.length > 0;
    } else requireValue(additiveRules.has(rule.type), `Unsupported effective rule ${rule.type}`);
  }
  return result;
};

/** Pure audit of explicit captured responses; it never fetches, writes, or changes settings. */
export const auditRepositorySafeguards = (inputPolicy, observation) => {
  const policy = validateSafeguardPolicy(inputPolicy);
  const mismatches = [];
  const effective = emptyControls();
  const warnings = [];
  const issue = (code, message) => mismatches.push({ code, message });
  const attempt = (code, callback) => {
    try {
      return callback();
    } catch (error) {
      issue(code, error.message);
      return undefined;
    }
  };
  const prefix = `/repos/${repository}`;
  const readResponse = (response, suffix, allowedStatus = [200], paginated = false) => {
    keys(response, ["path", "status", "body"], paginated ? ["complete"] : []);
    requireValue(
      response.path === `${prefix}${suffix}` && allowedStatus.includes(response.status),
      `Unavailable or wrong-target response: ${suffix || "/repository"}`,
    );
    if (paginated)
      requireValue(response.complete === true, "Effective rules pagination is missing/truncated");
    return response.body;
  };
  attempt("observation", () => {
    keys(observation, [
      "schemaVersion",
      "repository",
      "ref",
      "observedAt",
      "repositoryResponse",
      "branch",
      "protection",
      "effectiveRules",
      "rulesets",
      "privateReporting",
    ]);
    requireValue(
      observation.schemaVersion === 1 &&
        observation.repository === repository &&
        observation.ref === targetRef,
      "Wrong observation schema/repository/ref",
    );
    requireValue(
      typeof observation.observedAt === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(observation.observedAt) &&
        Number.isFinite(Date.parse(observation.observedAt)) &&
        new Date(observation.observedAt).toISOString().replace(".000Z", "Z") ===
          observation.observedAt.replace(".000Z", "Z"),
      "Invalid observedAt UTC timestamp",
    );
  });
  const repo = attempt("repository", () => {
    const body = readResponse(observation?.repositoryResponse, "");
    requireValue(
      object(body) &&
        body.full_name === repository &&
        typeof body.default_branch === "string" &&
        body.default_branch.length > 0,
      "Wrong or unknown actual repository/default branch",
    );
    return body;
  });
  attempt("branch", () => {
    const body = readResponse(observation?.branch, "/branches/main");
    requireValue(
      object(body) && body.name === "main" && body.protected === true,
      "main is absent, unprotected or ambiguous",
    );
  });
  const protection = attempt("protection", () => {
    const body = readResponse(observation?.protection, "/branches/main/protection", [200, 404]);
    if (observation.protection.status === 404) {
      requireValue(body === null, "Absent protection requires status 404 with body null");
      return { kind: "absent" };
    }
    requireValue(object(body), "Status 200 requires a branch protection object");
    return { kind: "present", body };
  });
  if (protection?.kind === "present")
    attempt("protection", () => {
      const source = parseProtection(protection.body);
      if (source.noBypass) mergeControls(effective, source.controls);
      else
        warnings.push("Branch protection permits bypass; its controls cannot satisfy this policy.");
    });
  const rules = attempt("effective-rules", () => {
    const body = readResponse(observation?.effectiveRules, "/rules/branches/main", [200], true);
    requireValue(array(body), "Invalid or excessive active rules");
    return body;
  });
  attempt("rulesets", () => {
    requireValue(array(observation?.rulesets), "Missing ruleset detail inventory");
    const details = new Map();
    for (const response of observation.rulesets) {
      requireValue(
        object(response?.body) && Number.isSafeInteger(response.body.id) && response.body.id > 0,
        "Unknown ruleset ID",
      );
      const detail = readResponse(response, `/rulesets/${response.body.id}?includes_parents=true`);
      requireValue(!details.has(detail.id), "Duplicate ruleset detail");
      details.set(detail.id, detail);
    }
    const groups = new Map();
    for (const rule of rules ?? []) {
      requireValue(
        object(rule) && Number.isSafeInteger(rule.ruleset_id) && rule.ruleset_id > 0,
        "Missing effective ruleset identity",
      );
      if (!groups.has(rule.ruleset_id)) groups.set(rule.ruleset_id, []);
      groups.get(rule.ruleset_id).push(rule);
    }
    requireValue(
      [...details.keys()].every((id) => groups.has(id)),
      "Inert/non-applicable ruleset detail was supplied",
    );
    for (const [id, group] of groups)
      attempt(`ruleset-${id}`, () => {
        const detail = details.get(id);
        requireValue(
          object(detail) && detail.enforcement === "active" && detail.target === "branch",
          `Ruleset ${id} is absent/inactive/not a branch rule`,
        );
        requireValue(
          (detail.source_type === "Repository" && detail.source === repository) ||
            (detail.source_type === "Organization" && detail.source === repository.split("/")[0]),
          "Wrong ruleset source",
        );
        requireValue(
          repo && applicableRef(detail.conditions, repo.default_branch),
          "Ruleset does not apply to main",
        );
        requireValue(array(detail.bypass_actors), "Ruleset bypass actors unknown");
        requireValue(
          array(detail.rules) && detail.rules.length === group.length,
          "Effective rules disagree with ruleset detail",
        );
        const types = new Set();
        for (const rule of group) {
          requireValue(
            rule.ruleset_source_type === detail.source_type &&
              rule.ruleset_source === detail.source &&
              !types.has(rule.type),
            "Wrong/duplicate effective ruleset source/type",
          );
          types.add(rule.type);
          const configured = detail.rules.find((candidate) => candidate.type === rule.type);
          requireValue(
            configured && isDeepStrictEqual(configured.parameters, rule.parameters),
            "Effective rule parameters disagree with detail",
          );
        }
        const controls = parseRules(group);
        if (detail.bypass_actors.length === 0) mergeControls(effective, controls);
        else
          warnings.push(`Ruleset ${id} permits bypass; its controls cannot satisfy this policy.`);
      });
  });
  const requirements = [
    ["pull-requests", effective.pullRequests, "Pull requests required without bypass"],
    ["no-bypass", effective.noBypass, "Known applicable enforcement without bypass is required"],
    [
      "minimum-approvals",
      effective.minimumApprovals >= policy.controls.minimumApprovals,
      "Required approvals meet the minimum",
    ],
    ["up-to-date", effective.upToDate, "Required checks must use an up-to-date branch"],
    [
      "conversation-resolution",
      effective.conversationsResolved,
      "All review conversations must be resolved",
    ],
    ["block-deletion", effective.blockDeletion, "main deletion must be blocked"],
    ["block-force-push", effective.blockForcePush, "main force pushes must be blocked"],
  ];
  for (const [code, satisfied, message] of requirements) if (!satisfied) issue(code, message);
  for (const check of policy.requiredChecks)
    if (
      !effective.checks.some(
        (actual) => actual.context === check.context && actual.appId === check.appId,
      )
    )
      issue("required-check", `Require ${check.context} from app ${check.appId} without bypass`);
  attempt("private-reporting", () => {
    const body = readResponse(observation?.privateReporting, "/private-vulnerability-reporting");
    requireValue(
      object(body) && body.enabled === true,
      "Private vulnerability reporting is disabled or unknown",
    );
  });
  return {
    schemaVersion: 1,
    ok: mismatches.length === 0,
    repository,
    ref: targetRef,
    observedAt: observation?.observedAt ?? null,
    provenance: "offline-observation-unverified",
    mismatches,
    warnings,
    effective,
    limitations: [
      "Single maintainer: zero mandatory human approvals is the initial policy minimum; human approval is not enforced by that minimum. Existing positive approval counts remain effective and must not be reduced. Independent agent review is still required.",
      "This audit observes supplied settings at a time. Offline input cannot authenticate GitHub provenance, freshness, pagination claims or future enforcement. Safe-denial proof is a separate administrator operation and is not established by this report.",
    ],
    remediation: remediation(
      policy,
      protection?.kind === "absent" &&
        rules?.length === 0 &&
        !!repo &&
        observation?.repository === repository &&
        observation?.ref === targetRef,
    ),
  };
};

const main = () => {
  try {
    const options = new Map();
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index];
      const value = args[index + 1];
      requireValue(
        ["--policy", "--observation"].includes(key) &&
          !options.has(key) &&
          typeof value === "string" &&
          value.length > 0 &&
          !value.startsWith("--"),
        "Invalid arguments",
      );
      options.set(key, value);
    }
    requireValue(options.size === 2, "Explicit policy and observation files required");
    const read = (key) => {
      const text = readFileSync(options.get(key), "utf8");
      requireValue(Buffer.byteLength(text) <= 4 * 1024 * 1024, "Input exceeds 4 MiB");
      return JSON.parse(text);
    };
    const report = auditRepositorySafeguards(read("--policy"), read("--observation"));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.ok ? 0 : 1;
  } catch {
    // Never print raw arguments, input data, authentication errors or credentials.
    process.stderr.write(
      "Safeguard audit input rejected. Usage: node tools/proofline/repository-safeguards.mjs --policy POLICY.json --observation OBSERVATION.json\n",
    );
    process.exitCode = 2;
  }
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
