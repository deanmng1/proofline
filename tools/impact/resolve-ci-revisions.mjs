#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const fail = (message) => {
  process.stderr.write(`CI revision authority error: ${message}\n`);
  process.exit(1);
};

const git = (...args) => {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (result.status !== 0) return undefined;
  return result.stdout.trim();
};

const eventName = process.env.GITHUB_EVENT_NAME ?? "";
const requestedHead = process.env.IMPACT_HEAD ?? "";
if (!eventName) fail("missing GITHUB_EVENT_NAME");
if (!requestedHead) fail("missing IMPACT_HEAD");

let requestedBase;
if (eventName === "workflow_dispatch") {
  const manualBaseRef = process.env.PROOFLINE_MANUAL_BASE_REF ?? "";
  if (!["main", "master"].includes(manualBaseRef))
    fail("manual base ref must be the reviewed main or master choice");
  requestedBase = `refs/remotes/origin/${manualBaseRef}`;
} else if (["pull_request", "push"].includes(eventName)) {
  requestedBase = process.env.IMPACT_BASE ?? "";
  if (!requestedBase) fail("missing event-supplied IMPACT_BASE");
} else fail(`unsupported event ${eventName}`);

if (git("rev-parse", "--is-shallow-repository") !== "false")
  fail("repository history is shallow or unavailable");
const resolvedBase = git("rev-parse", "--verify", `${requestedBase}^{commit}`);
if (!resolvedBase) fail(`base authority does not resolve: ${requestedBase}`);
const resolvedHead = git("rev-parse", "--verify", `${requestedHead}^{commit}`);
if (!resolvedHead) fail(`head authority does not resolve: ${requestedHead}`);
const checkoutHead = git("rev-parse", "--verify", "HEAD^{commit}");
if (!checkoutHead) fail("checkout HEAD does not resolve");
if (resolvedHead !== checkoutHead)
  fail("checkout HEAD differs from the event-supplied head authority");

const mergeBases = git("merge-base", "--all", resolvedBase, resolvedHead);
if (!mergeBases) fail("base and head have no merge base");
if (mergeBases.split(/\r?\n/).filter(Boolean).length !== 1)
  fail("base and head do not have exactly one merge base");

process.stdout.write(`IMPACT_BASE=${resolvedBase}\nIMPACT_HEAD=${resolvedHead}\n`);
