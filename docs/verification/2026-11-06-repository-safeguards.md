# Actual repository safeguards and protected integration

At **2026-11-06T19:57:54.542Z**, authenticated GitHub read-back confirms main is protected by active, main-only ruleset **26720099**, with private vulnerability reporting enabled. The checked source is **`df13196dcdc50ef5e59163a0273996ff0fe9573d` (M)**. The strict read-only policy audit exits0 with no mismatches. This is a timestamped observation, not a guarantee against future administrator changes.

## Installed controls

The [source-controlled minimum policy](../../.github/proofline-safeguards.json) targets only `deanmng1/proofline`, `refs/heads/main`.

| Control | Actual read-back |
| --- | --- |
| Pull request required | Enabled |
| Branch up to date before merge | Strict required-status-check policy |
| Required checks | `verify (linux-x64-chromium)` and `verify (darwin-arm64-chromium)` |
| Check producer | GitHub Actions app/integration15368 for both |
| Review conversations resolved | Required |
| Deletion and force push | Blocked by deletion/non-fast-forward rules |
| Bypass actors | Empty; administrator-visible independent read reports current-user bypass as never |
| Private vulnerability reporting | Enabled |
| Mandatory human approvals | Zero, explicitly the sole-maintainer minimum |

Human approval is **not enforced** by this minimum. CODEOWNERS and independent agent review do not establish a second human maintainer. Existing positive approval counts or other stronger controls must not be reduced; none existed in the saved prestate.

## Bounded activation and read-back

Local verification and independent source approval precede activation. Exact candidate K3 `6a4becb1e624d6904ebd5c74f3a97409cb00032e` passes the [25-step fresh gate and separate starter validation](2026-11-06-fresh-adopter-confidence.md). Component and integrated-source approvals are complete before remote administration. Independent acceptance of the full raw fresh evidence subsequently corroborates those executed results.

The authenticated prestate has main at `775c62087aa2f443fc409aba750911215ba2aa2e` (F), unprotected, no effective rules, genuinely absent traditional protection and private reporting disabled. Full HTTP responses and administrator visibility are saved. The observation wrapper maps only that authenticated traditional404 absence to null; the original status/body remains retained.

The controller submits the independently reviewed additive ruleset payload: POST returns201 and new ID26720099. Enabling private reporting returns204. No existing ruleset or stronger protection is replaced, no bypass is added, and no deployment or release publication occurs. Server-added rule defaults are retained as returned. The exact submitted payload has SHA256 `0a16f50129540066030fbb5ddc6419c8cca08c86e53d65d476f8e3219e58fbf5`.

The first controller operation exits1 after the actual settings changes: its Python-generated observation timestamp uses offset/microsecond formatting outside the auditor's canonical schema. A second read uses Z with microseconds and is also correctly rejected. Both report only the timestamp mismatch; all installed policy controls are visible. Those original captures and rejected audits remain unchanged. The capture wrapper is corrected to actual UTC milliseconds with Z, and a new read-back passes without reapplying or weakening rules.

A separate non-implementing reviewer makes fresh authenticated GETs at19:23:21.836Z and independently confirms exact active rule definitions, complete effective-rule pagination, administrator-visible bypass absence and private reporting. Its pure audit also passes. The later M read-back at19:57:54.542Z again passes and binds the actual main commit to the same installed ruleset.

The auditor deliberately retains provenance **offline-observation-unverified**, even for supplied actual captures. Its result establishes input consistency; authenticated HTTP acquisition, source identity, timestamps, pagination and independent read-back provide the separate operational corroboration. No JSON flag authenticates itself.

## Safe enforcement observation and normal merge

[PR4](https://github.com/deanmng1/proofline/pull/4) proposes exact K3 against F. While both required checks are queued, native GitHub PR state reports mergeable=true but **mergeable_state=blocked**. Both checks are from Actions app15368: Linux128102579755 and macOS128102580238. This safely demonstrates GitHub's evaluated pending-check state. No intentionally invalid main write, force push, deletion or denied-merge attempt is performed.

[Canonical PR run42278964129](https://github.com/deanmng1/proofline/actions/runs/42278964129), attempt1, subsequently passes both complete16-gate cells. Authenticated downloaded archives reconcile62 root native indexes per cell,309 required/806 observed unit and34 required/47 observed Chromium passes, scenario24 and12+12 shards. PR diagnostics remain ineligible as release authority; the PR compatibility artifact is a declaration, not an executed hosted compatibility receipt.

After the checks finish, native PR state is clean with both exact source/app checks successful. GitHub's ordinary merge API, pinned to expected head K3, returns successful M. No administrator override or bypass path is used.

M's parents are F and K3. Its entire file tree equals K3, tree SHA `dcf341fad67b3772c5c7980b8ea856be50495486`; the full file diff is empty. Distinct commit identities remain distinct: K3 local/PR evidence is never relabeled as M push/main evidence. Separate main verification and release observations are identified by [project status](../PROJECT_STATUS.md).

## Clone-visible raw snapshot and recovery

The [snapshot directory](2026-11-06-safeguards/) preserves exact native JSON bytes as .json.txt so formatters cannot rewrite evidence. Native-filename mapping:

- observation.json → observation.json.txt
- audit.json → audit.json.txt
- acquisition.json → acquisition.json.txt
- submitted request body → submitted-payload.json.txt

[SHA256SUMS](2026-11-06-safeguards/SHA256SUMS) covers all four files. Acquisition includes native response bodies/statuses, raw HTTP hashes, exact source and actual capture times. Working prestate, activation errors, independent read-back, pending/ready PR observations and merged-PR response remain separately retained under output/adopter-confidence.

Recovery is bounded by the [administrator guide](../REPOSITORY_SAFEGUARDS.md#recovery): any later weakening requires its own explicit decision, fresh definition comparison and preserved evidence. The saved new ruleset ID is not authority to remove unrelated or intervening stronger controls. Private reporting remains enabled. Force/deletion denial and future enforcement are not inferred beyond the captured configuration and safe evaluated PR observation.
