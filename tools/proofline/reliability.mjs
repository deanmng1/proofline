import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createGithubReliabilityApi,
  reliabilityRepository,
  reliabilityTransportProvenance,
} from "./reliability-api.mjs";

const WORKFLOW = ".github/workflows/verify.yml";
const PLATFORMS = ["linux-x64-chromium", "darwin-arm64-chromium"];
const GATES = {
  lint: "Lint",
  typecheck: "Typecheck",
  manifest: "Validate portable harness manifest",
  production: "Build and audit the production application boundary",
  record: "Validate portable execution record and generated catalog",
  impactPreview: "Preview impact selection",
  impact: "Run impact-selected tests",
  unit: "Run full Vitest safety gate",
  browser: "Run full Chromium safety gate",
  browserScenario: "Run explicit multi-worker scenario gate",
  browserScenarioShard1: "Run explicit scenario shard one",
  browserScenarioShard2: "Run explicit scenario shard two",
  coverage: "Generate Vitest coverage baseline",
  coverageCheck: "Check scoped critical-file coverage ratchets",
  whitespace: "Check patch whitespace",
  portability: "Validate independent application portability",
};
const MAXIMUMS = { maxPages: 10, maxRuns: 999, maxAttempts: 10, maxJobs: 200, maxRequests: 3000 };
const LIMITATIONS = [
  "Supplementary aggregate observations; required native verification and release authority are unchanged.",
  "PR runs are outside this sample; their original outcomes are unchanged.",
  "Per-test flake rates and infrastructure causes are unknown from workflow aggregates.",
  "Unobserved history is unknown; finite samples do not establish future reliability or an SLA.",
  "Gate names describe the current canonical workflow; historical absent gates remain unknown.",
];
const check = (condition, message) => {
  if (!condition) throw new Error(`Reliability ${message}`);
};
const integer = (v) => Number.isSafeInteger(v) && v > 0;
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
};
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function timestamp(value, nullable = false) {
  if (nullable && value === null) return null;
  check(
    typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value),
    "invalid timestamp",
  );
  const ms = Date.parse(value);
  check(
    Number.isFinite(ms) &&
      new Date(ms).toISOString() === value.replace(/Z$/, value.includes(".") ? "Z" : ".000Z"),
    "invalid timestamp",
  );
  return ms;
}
function state(value) {
  check(
    value &&
      ["queued", "in_progress", "completed", "waiting", "requested", "pending"].includes(
        value.status,
      ),
    "invalid status",
  );
  check(
    value.status === "completed"
      ? [
          "success",
          "failure",
          "cancelled",
          "timed_out",
          "action_required",
          "neutral",
          "skipped",
          "stale",
          "startup_failure",
        ].includes(value.conclusion)
      : value.conclusion === null,
    "contradictory conclusion",
  );
}
function timedState(value, startedKey, completedKey, cutoff) {
  state(value);
  const start = timestamp(value[startedKey], true);
  const end = timestamp(value[completedKey], true);
  check(start === null || start <= cutoff, "start after observation cutoff");
  check(
    end === null || (start !== null && end >= start && end <= cutoff),
    "invalid completion interval",
  );
  check(value.status === "completed" || end === null, "pending completion timestamp");
  return {
    status: value.status,
    conclusion: value.conclusion,
    startedAt: value[startedKey],
    completedAt: value[completedKey],
    durationMs: start !== null && end !== null ? end - start : null,
  };
}
function metadata(repository, repositoryMetadata, workflowMetadata) {
  check(
    reliabilityRepository(repository) &&
      repositoryMetadata?.full_name === repository &&
      /^[A-Za-z0-9_./-]{1,200}$/.test(repositoryMetadata.default_branch ?? "") &&
      !repositoryMetadata.default_branch.includes(".."),
    "repository metadata mismatch",
  );
  check(
    integer(workflowMetadata?.id) &&
      workflowMetadata.path === WORKFLOW &&
      workflowMetadata.name === "Verify Proofline regression harness" &&
      workflowMetadata.state === "active",
    "canonical workflow metadata mismatch",
  );
}
function validateRun(run, context) {
  const { repository, branch, workflowId, cutoff } = context;
  check(
    run &&
      integer(run.id) &&
      integer(run.run_attempt) &&
      run.workflow_id === workflowId &&
      run.path === WORKFLOW &&
      run.repository?.full_name === repository &&
      run.head_repository?.full_name === repository &&
      run.head_branch === branch &&
      /^[a-f0-9]{40}$/.test(run.head_sha ?? "") &&
      ["push", "workflow_dispatch", "pull_request"].includes(run.event),
    "run identity mismatch",
  );
  state(run);
  const created = timestamp(run.created_at);
  const started = timestamp(run.run_started_at, true);
  const updated = timestamp(run.updated_at);
  check(
    created <= updated &&
      updated <= cutoff &&
      (started === null || (started >= created && started <= updated)),
    "run timestamp interval mismatch",
  );
  return run;
}
const runIdentity = (r) => [
  r.id,
  r.workflow_id,
  r.path,
  r.head_sha,
  r.head_branch,
  r.event,
  r.repository.full_name,
  r.head_repository.full_name,
  r.created_at,
];
function limits(input = {}) {
  check(
    input &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      Object.keys(input).every((key) => Object.hasOwn(MAXIMUMS, key)),
    "invalid bounds",
  );
  return Object.fromEntries(
    Object.entries(MAXIMUMS).map(([key, maximum]) => {
      const value = input[key] ?? maximum;
      check(integer(value) && value <= maximum, "invalid bounds");
      return [key, value];
    }),
  );
}
function collectionValues(response, key, page, expectedTotal, maximum) {
  check(
    response &&
      Number.isSafeInteger(response.total_count) &&
      response.total_count >= 0 &&
      response.total_count <= maximum &&
      Array.isArray(response[key]) &&
      response[key].length <= 100,
    "collection bounds or schema mismatch",
  );
  if (expectedTotal !== null)
    check(response.total_count === expectedTotal, "collection changed during pagination");
  check(
    response[key].length === Math.min(100, Math.max(0, response.total_count - (page - 1) * 100)),
    "missing or truncated page",
  );
  return response;
}
function deduplicate(values, key, label, counter) {
  const seen = new Map();
  for (const value of values) {
    const identity = key(value);
    if (seen.has(identity)) {
      check(equal(seen.get(identity), value), `conflicting duplicate ${label}`);
      counter.count++;
    } else seen.set(identity, value);
  }
  return [...seen.values()];
}
function normalizeJobs(values, run, cutoff, counter) {
  const jobs = deduplicate(values, (job) => job.id, "job", counter);
  const platforms = new Set();
  return jobs
    .map((job) => {
      const platform = PLATFORMS.find((p) => job.name === `verify (${p})`);
      check(
        integer(job.id) &&
          job.run_id === run.id &&
          job.run_attempt === run.run_attempt &&
          job.head_sha === run.head_sha &&
          platform &&
          !platforms.has(platform),
        "job identity or platform mismatch",
      );
      platforms.add(platform);
      check(Array.isArray(job.steps) && job.steps.length <= 200, "invalid steps");
      const names = new Set();
      const numbers = new Set();
      const normalized = job.steps.map((step) => {
        check(
          typeof step.name === "string" &&
            step.name.length > 0 &&
            step.name.length <= 500 &&
            integer(step.number) &&
            !names.has(step.name) &&
            !numbers.has(step.number),
          "ambiguous step identity",
        );
        names.add(step.name);
        numbers.add(step.number);
        return {
          name: step.name,
          number: step.number,
          ...timedState(step, "started_at", "completed_at", cutoff),
        };
      });
      const gateValues = Object.entries(GATES).map(([key, name]) => {
        const step = normalized.find((s) => s.name === name);
        return step
          ? { key, ...step }
          : {
              key,
              name,
              number: null,
              status: "unknown",
              conclusion: null,
              startedAt: null,
              completedAt: null,
              durationMs: null,
            };
      });
      return {
        jobId: String(job.id),
        runId: String(run.id),
        attempt: run.run_attempt,
        platform,
        name: job.name,
        ...timedState(job, "started_at", "completed_at", cutoff),
        steps: normalized,
        gates: gateValues,
        failedSteps: normalized
          .filter((s) =>
            ["failure", "timed_out", "startup_failure", "action_required"].includes(s.conclusion),
          )
          .map((s) => s.name),
        failedGates: gateValues
          .filter((g) =>
            ["failure", "timed_out", "startup_failure", "action_required"].includes(g.conclusion),
          )
          .map((g) => g.key),
      };
    })
    .sort((a, b) => PLATFORMS.indexOf(a.platform) - PLATFORMS.indexOf(b.platform));
}
function normalizeAttempt(run, jobs, availability, reason = null) {
  const unknownReasons = reason ? [reason] : [];
  for (const platform of PLATFORMS) {
    const job = jobs.find((j) => j.platform === platform);
    if (!job) unknownReasons.push(`missing-platform:${platform}`);
    else
      for (const gate of job.gates)
        if (gate.status === "unknown") unknownReasons.push(`missing-gate:${platform}:${gate.key}`);
    if (
      job &&
      ["failure", "timed_out", "startup_failure", "action_required"].includes(job.conclusion) &&
      job.failedGates.length === 0
    )
      unknownReasons.push(`failed-gate-unidentified:${platform}`);
  }
  if (run.status !== "completed") unknownReasons.push("run-not-completed");
  const completedJobs = jobs.filter((j) => j.completedAt !== null);
  const completedAt =
    run.status === "completed" && completedJobs.length
      ? completedJobs
          .map((j) => j.completedAt)
          .sort((a, b) => timestamp(a) - timestamp(b))
          .at(-1)
      : null;
  const start = timestamp(run.run_started_at, true);
  return {
    runId: String(run.id),
    attempt: run.run_attempt,
    sourceCommit: run.head_sha,
    branch: run.head_branch,
    event: run.event,
    availability,
    status: run.status,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    startedAt: run.run_started_at,
    updatedAt: run.updated_at,
    completedAt,
    durationMs: start !== null && completedAt !== null ? timestamp(completedAt) - start : null,
    completionBasis: completedAt === null ? "unknown" : "last-observed-job",
    jobs,
    unknownReasons,
  };
}
export async function collectVerificationHistory(options) {
  const { repository, workflow, since, until, api } = options;
  const observedAt = options.observedAt ?? new Date().toISOString();
  check(
    reliabilityRepository(repository) && workflow === WORKFLOW && typeof api === "function",
    "explicit repository/workflow/API required",
  );
  const lower = timestamp(since);
  const upper = timestamp(until);
  const cutoff = timestamp(observedAt);
  check(
    !since.includes(".") &&
      !until.includes(".") &&
      lower < upper &&
      upper <= cutoff &&
      upper - lower <= 90 * 86400000,
    "window must be ordered and at most 90 days",
  );
  const bounds = limits(options.bounds);
  let requests = 0;
  async function request(route) {
    check(++requests <= bounds.maxRequests, "request bounds exceeded");
    try {
      return await api(repository, route);
    } catch {
      throw new Error("Reliability API request failed; no response or credential details retained");
    }
  }
  const repositoryMetadata = await request("");
  const workflowMetadata = await request("/actions/workflows/verify.yml");
  metadata(repository, repositoryMetadata, workflowMetadata);
  const context = {
    repository,
    branch: repositoryMetadata.default_branch,
    workflowId: workflowMetadata.id,
    cutoff,
  };
  const counter = { count: 0 };
  async function pages(route, key, maximum, unavailable = false) {
    const values = [];
    let total = null;
    for (let page = 1; page <= bounds.maxPages; page++) {
      const response = await request(
        `${route}${route.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
      );
      if (unavailable && [404, 410].includes(response?.unavailable)) return response;
      collectionValues(response, key, page, total, maximum);
      total = response.total_count;
      values.push(...response[key]);
      if (values.length === total) return values;
    }
    check(false, "pagination bounds exceeded");
  }
  const route = `/actions/workflows/${workflowMetadata.id}/runs?branch=${encodeURIComponent(context.branch)}&created=${encodeURIComponent(`${since}..${until}`)}`;
  const rawRuns = await pages(route, "workflow_runs", bounds.maxRuns);
  const runs = deduplicate(rawRuns, (r) => r.id, "run", counter).map((r) =>
    validateRun(r, context),
  );
  const attempts = [];
  const selectedRuns = [];
  for (const listed of runs.sort((a, b) => a.id - b.id)) {
    check(
      timestamp(listed.created_at) >= lower && timestamp(listed.created_at) <= upper,
      "run outside requested window",
    );
    if (listed.event === "pull_request") continue;
    check(listed.run_attempt <= bounds.maxAttempts, "attempt bounds exceeded");
    selectedRuns.push({
      runId: String(listed.id),
      latestAttempt: listed.run_attempt,
      sourceCommit: listed.head_sha,
    });
    for (let attempt = 1; attempt <= listed.run_attempt; attempt++) {
      const base = `/actions/runs/${listed.id}/attempts/${attempt}`;
      const raw = await request(base);
      if ([404, 410].includes(raw?.unavailable)) {
        attempts.push(
          normalizeAttempt(
            {
              ...listed,
              run_attempt: attempt,
              status: "unknown",
              conclusion: null,
              run_started_at: null,
              updated_at: null,
            },
            [],
            "unavailable",
            `attempt-metadata-unavailable:${raw.unavailable}`,
          ),
        );
        continue;
      }
      validateRun(raw, context);
      check(
        equal(runIdentity(raw), runIdentity(listed)) && raw.run_attempt === attempt,
        "attempt identity mismatch",
      );
      if (attempt === listed.run_attempt)
        check(
          raw.status === listed.status &&
            raw.conclusion === listed.conclusion &&
            raw.updated_at === listed.updated_at,
          "run advanced during collection",
        );
      const jobValues = await pages(`${base}/jobs`, "jobs", bounds.maxJobs, true);
      if (!Array.isArray(jobValues))
        attempts.push(
          normalizeAttempt(
            raw,
            [],
            "jobs-unavailable",
            `attempt-jobs-unavailable:${jobValues.unavailable}`,
          ),
        );
      else
        attempts.push(
          normalizeAttempt(raw, normalizeJobs(jobValues, raw, cutoff, counter), "observed"),
        );
    }
    const final = validateRun(await request(`/actions/runs/${listed.id}`), context);
    check(
      equal(runIdentity(final), runIdentity(listed)) &&
        final.run_attempt === listed.run_attempt &&
        final.status === listed.status &&
        final.conclusion === listed.conclusion &&
        final.updated_at === listed.updated_at,
      "run advanced during collection",
    );
  }
  return {
    schemaVersion: 1,
    authority: "supplementary-only",
    transport: reliabilityTransportProvenance(api),
    repository,
    defaultBranch: context.branch,
    workflow: { id: workflowMetadata.id, path: WORKFLOW, name: workflowMetadata.name },
    window: { since, until, selection: "run-created-at-inclusive", cutoff: observedAt },
    observedAt,
    bounds,
    requests,
    duplicateFacts: counter.count,
    excludedPullRequests: runs.filter((r) => r.event === "pull_request").length,
    runs: selectedRuns,
    attempts,
  };
}
const countOutcome = (target, value) => {
  target[value] = (target[value] ?? 0) + 1;
};
function outcomeBucket() {
  return { total: 0, known: 0, unknown: 0, outcomes: {} };
}
function addOutcome(bucket, value) {
  bucket.total++;
  if (value?.status === "completed" && value.conclusion !== null) {
    bucket.known++;
    countOutcome(bucket.outcomes, value.conclusion);
  } else bucket.unknown++;
}
function terminalFacts(attempt) {
  const facts = [];
  if (attempt.status === "completed") facts.push(["run", attempt.conclusion]);
  for (const job of attempt.jobs) {
    if (job.status === "completed")
      facts.push([`job:${job.jobId}`, [job.conclusion, job.startedAt, job.completedAt]]);
    for (const step of job.steps)
      if (step.status === "completed")
        facts.push([
          `job:${job.jobId}:step:${step.number}:${step.name}`,
          [step.conclusion, step.startedAt, step.completedAt],
        ]);
  }
  return facts;
}
function validateObservation(observation) {
  check(
    observation?.schemaVersion === 1 &&
      observation.authority === "supplementary-only" &&
      ["github-api", "injected-offline"].includes(observation.transport),
    "invalid observation",
  );
  metadata(
    observation.repository,
    { full_name: observation.repository, default_branch: observation.defaultBranch },
    { ...observation.workflow, state: "active" },
  );
  const cutoff = timestamp(observation.observedAt);
  const lower = timestamp(observation.window?.since);
  const upper = timestamp(observation.window?.until);
  check(
    lower < upper &&
      upper <= cutoff &&
      upper - lower <= 90 * 86400000 &&
      observation.window.cutoff === observation.observedAt &&
      observation.window.selection === "run-created-at-inclusive",
    "invalid observation window",
  );
  const bounds = limits(observation.bounds);
  check(
    integer(observation.requests) &&
      observation.requests <= bounds.maxRequests &&
      Number.isSafeInteger(observation.duplicateFacts) &&
      observation.duplicateFacts >= 0 &&
      Number.isSafeInteger(observation.excludedPullRequests) &&
      observation.excludedPullRequests >= 0,
    "invalid observation counters",
  );
  check(
    Array.isArray(observation.runs) &&
      observation.runs.length <= bounds.maxRuns &&
      Array.isArray(observation.attempts) &&
      observation.attempts.length <= bounds.maxRuns * bounds.maxAttempts,
    "invalid observation sample",
  );
  const runs = new Map();
  for (const run of observation.runs) {
    check(
      /^[1-9]\d*$/.test(run.runId) &&
        integer(Number(run.runId)) &&
        integer(run.latestAttempt) &&
        run.latestAttempt <= bounds.maxAttempts &&
        /^[a-f0-9]{40}$/.test(run.sourceCommit) &&
        !runs.has(run.runId),
      "invalid observed run",
    );
    runs.set(run.runId, run);
  }
  const identities = new Set();
  for (const attempt of observation.attempts) {
    const run = runs.get(attempt.runId);
    const key = `${attempt.runId}/${attempt.attempt}`;
    check(
      run &&
        integer(attempt.attempt) &&
        attempt.attempt <= run.latestAttempt &&
        attempt.sourceCommit === run.sourceCommit &&
        !identities.has(key) &&
        ["observed", "unavailable", "jobs-unavailable"].includes(attempt.availability),
      "invalid observed attempt",
    );
    identities.add(key);
    const raw = {
      id: Number(attempt.runId),
      workflow_id: observation.workflow.id,
      path: WORKFLOW,
      repository: { full_name: observation.repository },
      head_repository: { full_name: observation.repository },
      head_branch: attempt.branch,
      head_sha: attempt.sourceCommit,
      event: attempt.event,
      run_attempt: attempt.attempt,
      status: attempt.status,
      conclusion: attempt.conclusion,
      created_at: attempt.createdAt,
      run_started_at: attempt.startedAt,
      updated_at: attempt.updatedAt,
    };
    const unavailable = attempt.availability === "unavailable";
    if (unavailable)
      check(
        attempt.status === "unknown" &&
          attempt.conclusion === null &&
          attempt.startedAt === null &&
          attempt.updatedAt === null,
        "invalid unavailable attempt",
      );
    validateRun(unavailable ? { ...raw, status: "queued", updated_at: raw.created_at } : raw, {
      repository: observation.repository,
      branch: observation.defaultBranch,
      workflowId: observation.workflow.id,
      cutoff,
    });
    check(
      attempt.event !== "pull_request" &&
        timestamp(attempt.createdAt) >= lower &&
        timestamp(attempt.createdAt) <= upper &&
        Array.isArray(attempt.jobs) &&
        attempt.jobs.length <= bounds.maxJobs,
      "invalid attempt scope",
    );
    const rawJobs = attempt.jobs.map((job) => {
      check(Array.isArray(job.steps) && job.steps.length <= 200, "invalid step sample");
      const steps = job.steps.map((step) => ({
        name: step.name,
        number: step.number,
        status: step.status,
        conclusion: step.conclusion,
        started_at: step.startedAt,
        completed_at: step.completedAt,
      }));
      check(/^[1-9]\d*$/.test(job.jobId), "invalid observed job");
      return {
        id: Number(job.jobId),
        run_id: Number(job.runId),
        run_attempt: job.attempt,
        head_sha: attempt.sourceCommit,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        started_at: job.startedAt,
        completed_at: job.completedAt,
        steps,
      };
    });
    check(
      attempt.availability === "observed" || rawJobs.length === 0,
      "unavailable attempt has jobs",
    );
    const normalized = normalizeJobs(rawJobs, raw, cutoff, { count: 0 });
    check(equal(normalized, attempt.jobs), "malformed observed job facts");
    let reason = null;
    if (attempt.availability !== "observed") {
      reason = attempt.unknownReasons?.[0];
      check(
        typeof reason === "string" &&
          (unavailable
            ? /^attempt-metadata-unavailable:(404|410)$/
            : /^attempt-jobs-unavailable:(404|410)$/
          ).test(reason),
        "invalid unavailable reason",
      );
    }
    check(
      equal(normalizeAttempt(raw, normalized, attempt.availability, reason), attempt),
      "malformed observed attempt facts",
    );
  }
  check(
    identities.size === [...runs.values()].reduce((total, run) => total + run.latestAttempt, 0),
    "missing observed attempt; preserve explicit unknowns",
  );
}
export function summarizeReliability(input) {
  const values = Array.isArray(input) ? input : [input];
  check(values.length > 0 && values.length <= 1000, "invalid observation count");
  const observations = [];
  let duplicateObservations = 0;
  for (const value of values) {
    validateObservation(value);
    if (observations.some((o) => equal(o, value))) duplicateObservations++;
    else observations.push(value);
  }
  observations.sort((a, b) => timestamp(a.observedAt) - timestamp(b.observedAt));
  const reference = observations[0];
  const latest = new Map();
  const facts = new Map();
  const runs = new Map();
  for (const observation of observations) {
    check(
      observation.repository === reference.repository &&
        equal(observation.workflow, reference.workflow) &&
        observation.defaultBranch === reference.defaultBranch,
      "observation scope conflict",
    );
    for (const run of observation.runs) {
      const previous = runs.get(run.runId);
      check(!previous || previous.sourceCommit === run.sourceCommit, "run source conflict");
      if (!previous || run.latestAttempt > previous.latestAttempt) runs.set(run.runId, run);
    }
    for (const attempt of observation.attempts) {
      const key = `${attempt.runId}/${attempt.attempt}`;
      const previous = latest.get(key);
      check(
        !previous || previous.value.sourceCommit === attempt.sourceCommit,
        "attempt source conflict",
      );
      check(
        !previous ||
          previous.observedAt !== observation.observedAt ||
          equal(previous.value, attempt),
        "same-time observation conflict",
      );
      const terminal = facts.get(key) ?? new Map();
      const incoming = new Map(terminalFacts(attempt));
      if (attempt.availability === "observed")
        for (const identity of terminal.keys())
          check(incoming.has(identity), "terminal fact regression conflict");
      for (const [identity, value] of incoming) {
        check(
          !terminal.has(identity) || equal(terminal.get(identity), value),
          "terminal outcome conflict",
        );
        terminal.set(identity, value);
      }
      facts.set(key, terminal);
      if (
        !previous ||
        (previous.value.status !== "completed" && attempt.availability !== "unavailable") ||
        attempt.status === "completed"
      )
        latest.set(key, { value: attempt, observedAt: observation.observedAt });
    }
  }
  const attempts = [...latest.values()]
    .map((a) => a.value)
    .sort((a, b) => Number(a.runId) - Number(b.runId) || a.attempt - b.attempt);
  const firstAttempt = outcomeBucket();
  const retry = outcomeBucket();
  for (const run of runs.values())
    for (let attempt = 1; attempt <= run.latestAttempt; attempt++)
      addOutcome(
        attempt === 1 ? firstAttempt : retry,
        latest.get(`${run.runId}/${attempt}`)?.value,
      );
  const platforms = Object.fromEntries(
    PLATFORMS.map((platform) => [
      platform,
      {
        jobs: 0,
        missing: 0,
        outcomes: {},
        gates: Object.fromEntries(Object.keys(GATES).map((gate) => [gate, outcomeBucket()])),
      },
    ]),
  );
  for (const attempt of attempts)
    for (const platform of PLATFORMS) {
      const job = attempt.jobs.find((j) => j.platform === platform);
      const bucket = platforms[platform];
      if (job) {
        bucket.jobs++;
        if (job.status === "completed") countOutcome(bucket.outcomes, job.conclusion);
      } else bucket.missing++;
      for (const gate of Object.keys(GATES))
        addOutcome(
          bucket.gates[gate],
          job?.gates.find((g) => g.key === gate),
        );
    }
  return {
    schemaVersion: 1,
    authority: "supplementary-only",
    repository: reference.repository,
    workflow: reference.workflow,
    window: {
      since: observations.map((o) => o.window.since).sort()[0],
      until: observations
        .map((o) => o.window.until)
        .sort()
        .at(-1),
      firstObservedAt: observations[0].observedAt,
      lastObservedAt: observations.at(-1).observedAt,
    },
    history: runs.size ? "finite-observed-sample" : "unknown-no-runs",
    sample: {
      observations: observations.length,
      duplicateObservations,
      runs: runs.size,
      attempts: firstAttempt.total + retry.total,
      firstAttempt,
      retry,
    },
    platforms,
    attempts,
    snapshots: observations.map((o) => ({
      observedAt: o.observedAt,
      transport: o.transport,
      attempts: o.attempts,
    })),
    limitations: LIMITATIONS,
  };
}
function readableSummary(summary) {
  const lines = [
    "# Supplementary verification reliability",
    "",
    `${summary.sample.runs} runs / ${summary.sample.attempts} attempts; ${summary.sample.observations} distinct observations.`,
    "",
    `Repository: ${summary.repository}; workflow: ${summary.workflow.path} (ID ${summary.workflow.id}).`,
    `Window by run creation: ${summary.window.since} through ${summary.window.until}; latest observation ${summary.window.lastObservedAt}.`,
    `History: ${summary.history}.`,
    "",
    "| Attempt group | Total | Known terminal | Unknown | Outcomes |",
    "| --- | ---: | ---: | ---: | --- |",
  ];
  for (const [name, bucket] of [
    ["First attempt", summary.sample.firstAttempt],
    ["Retries", summary.sample.retry],
  ])
    lines.push(
      `| ${name} | ${bucket.total} | ${bucket.known} | ${bucket.unknown} | ${JSON.stringify(bucket.outcomes)} |`,
    );
  lines.push(
    "",
    "| Platform | Observed jobs | Missing jobs | Outcomes |",
    "| --- | ---: | ---: | --- |",
  );
  for (const [platform, bucket] of Object.entries(summary.platforms))
    lines.push(
      `| ${platform} | ${bucket.jobs} | ${bucket.missing} | ${JSON.stringify(bucket.outcomes)} |`,
    );
  lines.push(
    "",
    "| Platform / gate | Known terminal | Unknown | Outcomes |",
    "| --- | ---: | ---: | --- |",
  );
  for (const [platform, bucket] of Object.entries(summary.platforms))
    for (const [gate, counts] of Object.entries(bucket.gates))
      lines.push(
        `| ${platform} / ${gate} | ${counts.known} | ${counts.unknown} | ${JSON.stringify(counts.outcomes)} |`,
      );
  lines.push("", ...summary.limitations.map((value) => `- ${value}`), "");
  return lines.join("\n");
}
export function writeReliabilityObservation({ observation, output }) {
  check(typeof output === "string" && path.isAbsolute(output), "absolute output required");
  const directory = path.resolve(output);
  const parent = path.dirname(directory);
  for (let current = parent; ; current = path.dirname(current)) {
    const stat = lstatSync(current);
    check(!stat.isSymbolicLink() && stat.isDirectory(), "output ancestor symlink or non-directory");
    if (path.dirname(current) === current) break;
  }
  const summary = summarizeReliability(observation);
  mkdirSync(directory, { mode: 0o700 });
  const observationFile = path.join(directory, "observation.json");
  const summaryFile = path.join(directory, "summary.md");
  writeFileSync(observationFile, `${JSON.stringify(observation, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(path.join(directory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(summaryFile, readableSummary(summary), { flag: "wx", mode: 0o600 });
  return { observationFile, summaryFile };
}
export function parseReliabilityOptions(argv) {
  const result = {};
  const required = ["repository", "workflow", "since", "until", "output"];
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    const value = argv[index + 1];
    check(
      required.includes(key) &&
        argv[index] === `--${key}` &&
        !Object.hasOwn(result, key) &&
        typeof value === "string" &&
        value.length > 0 &&
        !value.startsWith("--"),
      "invalid or duplicate CLI option",
    );
    result[key] = value;
  }
  check(
    required.every((key) => Object.hasOwn(result, key)) && path.isAbsolute(result.output),
    "explicit repository workflow window and absolute output required",
  );
  return result;
}
export function authorizeReliabilityTrigger({
  eventName,
  event,
  repository,
  repositoryMetadata,
  workflowMetadata,
}) {
  metadata(repository, repositoryMetadata, workflowMetadata);
  if (event?.repository?.full_name !== repository) return false;
  if (["schedule", "workflow_dispatch"].includes(eventName)) return true;
  const run = event?.workflow_run;
  return (
    eventName === "workflow_run" &&
    run?.workflow_id === workflowMetadata.id &&
    run.path === WORKFLOW &&
    run.status === "completed" &&
    run.event === "push" &&
    run.repository?.full_name === repository &&
    run.head_repository?.full_name === repository &&
    run.head_branch === repositoryMetadata.default_branch
  );
}
export async function collectReliabilityForTrigger({
  eventName,
  event,
  repository,
  api,
  output,
  now = new Date().toISOString(),
}) {
  let repositoryMetadata;
  let workflowMetadata;
  try {
    repositoryMetadata = await api(repository, "");
    workflowMetadata = await api(repository, "/actions/workflows/verify.yml");
  } catch {
    throw new Error("Reliability trigger metadata API request failed");
  }
  if (
    !authorizeReliabilityTrigger({
      eventName,
      event,
      repository,
      repositoryMetadata,
      workflowMetadata,
    })
  )
    return { collected: false };
  const until = new Date(timestamp(now)).toISOString().replace(/\.\d{3}Z$/, "Z");
  const since = new Date(timestamp(until) - 30 * 86400000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const observation = await collectVerificationHistory({
    repository,
    workflow: WORKFLOW,
    since,
    until,
    observedAt: now,
    api,
  });
  return { collected: true, ...writeReliabilityObservation({ observation, output }) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseReliabilityOptions(process.argv.slice(2));
    const api = createGithubReliabilityApi({
      token: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN,
    });
    const observation = await collectVerificationHistory({ ...options, api });
    const result = writeReliabilityObservation({ observation, output: options.output });
    console.log(`Supplementary reliability observation: ${result.observationFile}`);
  } catch {
    console.error(
      "Reliability collection failed; validate explicit inputs, read access, bounds and immutable output. No credential details emitted.",
    );
    process.exitCode = 1;
  }
}
