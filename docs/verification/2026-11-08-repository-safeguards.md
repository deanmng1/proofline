# Repository safeguards after the protected repair merge

Actual read-back at **2026-11-08T21:26:26.998Z** identifies main **`a4a6558344fae88c7398634ad6e5fbd3cac2dda1` (N)** as protected. The supplied observation passes the unchanged policy audit with zero mismatches. Independent closing API observations corroborate the controls. The pure auditor retains `offline-observation-unverified` provenance; actual authenticated acquisition supplies the separate external evidence.

Ruleset **26720099** is active on main with no bypass actors. PRs, up-to-date branches and resolved conversations are required; deletion and non-fast-forward updates are prohibited. Both required checks are bound to Actions app **15368**:

- `verify (linux-x64-chromium)`
- `verify (darwin-arm64-chromium)`

Private vulnerability reporting is enabled. Required human approvals remain **zero** for the sole-maintainer repository. The installed checks do not establish human review or a support SLA. These are read-back observations; the controls were not reapplied or weakened during this repair.

## Evaluated enforcement

[PR5](https://github.com/deanmng1/proofline/pull/5) is blocked while both required checks are incomplete, then becomes clean after both exact-head Actions checks pass. Normal expected-head merge creates N from M and reviewed head H `30c0c1e2bf88ddecb3fef3a92ebe0eaf32d6e11e`, with an identical complete H/N tree. No bypass, intentionally invalid main write, force/delete operation or denied merge attempt was performed. Configuration and the evaluated ordinary PR supply the bounded enforcement evidence.

The [initial activation report](2026-11-06-repository-safeguards.md) preserves the original unprotected prestate, reviewed additive payload and earlier operator timestamp-format rejections. The later source does not rewrite those outcomes. [Main verification](2026-11-08-hosted-adopter-confidence.md) records the separate successful push/main gates and artifacts.

## Exact snapshot

The [snapshot directory](2026-11-08-safeguards/) retains native bytes with explicit filename mapping:

| Native acquisition filename | Source-controlled filename |
| --- | --- |
| `observation.json` | `observation.json.txt` |
| `acquisition.json` | `acquisition.json.txt` |
| Supplied-observation audit JSON | `audit.json.txt` |

[SHA256SUMS](2026-11-08-safeguards/SHA256SUMS) covers all three files. Working raw HTTP responses and read-back logs remain under `output/adopter-confidence/safeguards-main-N-readback`; independent closing captures supplement them. The [operator guide](../REPOSITORY_SAFEGUARDS.md) remains the policy and recovery reference. A dated read-back is not a guarantee against later administrative changes.
