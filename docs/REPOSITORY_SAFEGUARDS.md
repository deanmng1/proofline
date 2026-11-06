# Repository safeguards

The minimum policy in [`.github/proofline-safeguards.json`](../.github/proofline-safeguards.json) applies only to `deanmng1/proofline`, `refs/heads/main`. It requires pull requests, an up-to-date branch, resolved review conversations, blocked deletion and force pushes, and enforcement without bypass. Both required checks must come from GitHub Actions **app 15368**:

- `verify (linux-x64-chromium)`
- `verify (darwin-arm64-chromium)`

Private vulnerability reporting must be enabled. Additional checks, positive approval counts, signatures, linear history and other stronger installed controls remain in place. The policy is a minimum, never a replacement instruction.

There is one known maintainer. The initial minimum is **zero mandatory human approvals** so that ordinary maintenance does not deadlock. Human approval is not currently enforced by this minimum. Independent agent spec and quality review remains required by the project instructions. An existing positive approval count must not be reduced; report any resulting maintenance conflict. A future second trusted maintainer can support a separately reviewed one-approval policy.

## Read-only audit

Run the source-native CLI with explicit files using the pinned project toolchain:

```sh
node tools/proofline/repository-safeguards.mjs \
  --policy .github/proofline-safeguards.json \
  --observation /absolute/path/safeguards-observation.json
```

The CLI reads the two files and prints a JSON report to stdout. It has no authentication, network, apply or mutation mode, and importing the module does nothing. Exit codes are `0` for a matching observation, `1` for mismatches, and `2` for rejected arguments/policy/input. Duplicate/unknown arguments are rejected. Redirect stdout explicitly if a saved report is wanted. Inputs are bounded to 4 MiB each. The pure exports are `validateSafeguardPolicy(policy)` and `auditRepositorySafeguards(policy, observation)`.

A passing report establishes consistency of supplied observations only. Its provenance is always `offline-observation-unverified`, including when an administrator supplies actual API captures. The controller must separately attest the acquisition, exact source, credentials/access scope, completion of pagination, and timestamp. No file can authenticate its own claimed provenance. This is an observation at a time, not permanent enforcement or a safe-denial proof.

## Capture actual settings

Prefer a connected GitHub administration capability when available. If it cannot read these settings, an administrator can use the authenticated GitHub CLI outside tests. Never print tokens or use shell tracing. Record the full source commit and UTC time, save native bodies and statuses, and distinguish a genuine `404` from a permissions/transport failure. All requests target the same repository and branch:

```sh
gh api repos/deanmng1/proofline
gh api repos/deanmng1/proofline/branches/main
gh api repos/deanmng1/proofline/branches/main/protection
gh api --paginate 'repos/deanmng1/proofline/rules/branches/main?per_page=100'
gh api repos/deanmng1/proofline/private-vulnerability-reporting
```

For every `ruleset_id` in the complete effective-rules response, also save:

```sh
gh api 'repos/deanmng1/proofline/rulesets/42?includes_parents=true'
```

Replace `42` with that exact numeric ID. Read repository ruleset details with administrator access so `bypass_actors` is visible. The effective-branch-rules endpoint returns active applicable rules, including inherited rules, and excludes evaluate/disabled rules. Do not substitute the general ruleset inventory for this response. Save every page and verify the terminal page has no next link before marking `complete: true`. Flatten the page arrays without dropping entries. Authentication errors, missing pages, unavailable rule details or hidden bypasses are unknown enforcement and fail the audit. These endpoints and their native shapes are documented in [GitHub's branch-protection API](https://docs.github.com/en/rest/branches/branch-protection) and [rules API](https://docs.github.com/en/rest/repos/rules).

Wrap those native bodies in the following schema. `path` is the exact API resource identity shown here, without the host; the effective rules body is the complete flattened array. The wrapper path omits pagination parameters. Record the actual HTTP status. A genuine absent traditional protection has status `404` and body `null`; other endpoints require `200`. Every envelope must have exactly `path`, `status`, `body`, plus `complete` for effective rules. Unknown wrapper/policy fields fail closed; native API bodies may contain additive metadata such as URLs.

```json
{
  "schemaVersion": 1,
  "repository": "deanmng1/proofline",
  "ref": "refs/heads/main",
  "observedAt": "2026-11-06T18:00:00Z",
  "repositoryResponse": {
    "path": "/repos/deanmng1/proofline",
    "status": 200,
    "body": { "full_name": "deanmng1/proofline", "default_branch": "main" }
  },
  "branch": {
    "path": "/repos/deanmng1/proofline/branches/main",
    "status": 200,
    "body": { "name": "main", "protected": false }
  },
  "protection": {
    "path": "/repos/deanmng1/proofline/branches/main/protection",
    "status": 404,
    "body": null
  },
  "effectiveRules": {
    "path": "/repos/deanmng1/proofline/rules/branches/main",
    "status": 200,
    "complete": true,
    "body": []
  },
  "rulesets": [],
  "privateReporting": {
    "path": "/repos/deanmng1/proofline/private-vulnerability-reporting",
    "status": 200,
    "body": { "enabled": false }
  }
}
```

This illustrative unprotected observation **fails**; it is not evidence of current settings. Keep complete original API captures alongside the wrapper. A protected traditional response must explicitly show `required_status_checks.strict: true` and `required_status_checks.checks` entries with each exact `context` and `app_id: 15368`; context names alone cannot establish the app. It must show `enforce_admins.enabled: true`, a non-null `required_pull_request_reviews` with integer `required_approving_review_count` and explicit empty `bypass_pull_request_allowances.users/teams/apps`, `required_conversation_resolution.enabled: true`, and both `allow_deletions.enabled` and `allow_force_pushes.enabled` false. Preserve native dismissal/code-owner/last-push fields and any restrictions in the saved capture; the audit does not weaken or rewrite them. Missing critical controls or bypass data are ambiguous and fail closed.

For rulesets, each detail envelope has path `/repos/deanmng1/proofline/rulesets/ID?includes_parents=true`. Each active effective rule must reconcile by ID, source, type and parameters with that detail. It must be a branch ruleset with `enforcement: "active"`, explicit empty `bypass_actors`, and conditions that apply to main. The rules must supply deletion, non-fast-forward, PR/thread resolution and strict checks with `integration_id: 15368`. Detail-only rules cannot satisfy enforcement. Literal branch conditions, `~ALL`, and `~DEFAULT_BRANCH` are supported; wildcard/other unknown condition semantics fail closed rather than guessing applicability. Unknown effective rule types also fail closed; known additive controls are preserved. Repository rules and same-owner inherited organization rules are recognized; unsupported source kinds remain unknown.

Controls from separate verified sources combine. A source allowing bypass cannot establish any minimum, but another independent source without bypass can still enforce it. Positive effective approval counts are reported. Each missing check/control and every malformed source gets a mismatch; bypassed sources are also named in warnings.

## Separate reviewed administrator activation

The audit never executes the operations it suggests. The controller must complete local verification and independent source/spec/quality review, inspect the exact current source and live state, and retain prior settings and a recovery plan before using the user's bounded administration authorization. Do not use an administrator bypass to merge failing checks. Source publication uses the reviewed feature PR and normal integration described in the active design.

The report includes a concrete additive ruleset `POST /repos/deanmng1/proofline/rulesets` body and a `PUT /repos/deanmng1/proofline/private-vulnerability-reporting` suggestion. The new ruleset targets exactly main, is active, has no bypass actors, and adds only the policy minimum. Existing protections and positive approvals continue to apply. Do not replace/update existing rulesets using a minimal payload.

When captured traditional protection is genuinely absent **and** the active-rules response is empty, the report also provides `remediation.branchProtection`, a bounded initial `PUT /repos/deanmng1/proofline/branches/main/protection` candidate. Otherwise it is `null`. Re-read both conditions immediately before mutation; an offline observation cannot authorize replacing newer settings. Its exact initial body is:

```json
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "verify (linux-x64-chromium)", "app_id": 15368 },
      { "context": "verify (darwin-arm64-chromium)", "app_id": 15368 }
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "bypass_pull_request_allowances": { "users": [], "teams": [], "apps": [] }
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
```

Save the exact independently reviewed body in a separate payload file. Only the separately reviewed controller operation can run either the initial protection PUT or additive ruleset POST, followed by enabling reporting:

```sh
# Initial PUT only after the fresh absence checks above; never use it over existing settings.
gh api --method PUT repos/deanmng1/proofline/branches/main/protection --input /absolute/path/reviewed-protection.json
# Alternative additive ruleset, preserving all existing protections:
gh api --method POST repos/deanmng1/proofline/rulesets --input /absolute/path/reviewed-ruleset.json
gh api --method PUT repos/deanmng1/proofline/private-vulnerability-reporting
```

These are alternative protection procedures, not instructions to apply both. Retain the returned ruleset ID if using POST. Capture all native read-backs again, create a new observation, and run the read-only audit. Confirm both exact check names/apps against actual canonical jobs, the actual positive approval count if present, no effective bypass, and reporting enabled. Record the actual acquisition/admin outcome separately from deterministic tests.

Use GitHub rule evaluation or an empty/disposable PR/branch to demonstrate denial where safely feasible. Do not put intentionally bad bytes on main or attempt a force push. If a safe denial check is unavailable, record it as **unproven**; a matching read-back does not imply it was demonstrated.

## Recovery

Before activation, retain timestamped prior repository, branch, protection, effective rules, applicable full details and private-reporting responses, the exact source, exact reviewed payload, installed read-back and administrator recovery access. Save errors as errors. Review the conflict before changing anything if stronger existing controls prevent normal authorized work.

For an added ruleset, separately authorized recovery may remove only its saved new ID with `DELETE /repos/deanmng1/proofline/rulesets/ID` after verifying that its current definition equals the saved installed definition and that existing stronger settings are untouched. Never restore a stale whole ruleset inventory. For initial traditional protection, recovery is a separate reviewed `DELETE /repos/deanmng1/proofline/branches/main/protection` only if the saved prestate was genuinely absent, a fresh full read-back matches the installed snapshot, and no intervening stronger controls would be removed; otherwise stop and report the conflict. The original user authorization is to strengthen safeguards, so recovery that weakens them requires its own explicit decision. Reporting should remain enabled; disabling it to restore a saved prestate also requires a separately authorized, recorded decision. Re-read/audit after any recovery and retain both the original failed and successor observations.
