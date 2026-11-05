# Proofline security policy

## Supported scope

This policy covers the unpublished **0.9.0-preview.2** source preview at its reported immutable commit, with manifest schema 1 and the [documented compatibility](SUPPORT.md). The original dashboard 0.8.0 releases are historical and do not identify a Proofline release. Preview support is best-effort; there is no security response SLA or claim of a deployed service.

Potential bypasses of deny-by-default test egress, child executable/argv authority, launch capability checks, role/tenant test contracts, native required-test verification, evidence integrity, production-negative auditing or verified-release artifact validation are in scope. Intentional fake auth and deterministic provider adapters are test/demo capabilities; their exposure in a production artifact or a bypass of their boundaries is a reportable issue.

Proofline is not a hostile-code OS sandbox. A target application's production backend must implement its own authentication, authorization and persistence. The preview does not validate live providers, production database durability or unrestricted browser/version/platform combinations.

## Report privately

The maintainer is [@deanmng1](https://github.com/deanmng1). Private vulnerability reporting was **disabled at readiness reconnaissance**; this policy does not change that remote setting. If GitHub private vulnerability reporting is subsequently available on [deanmng1/proofline](https://github.com/deanmng1/proofline), use **Security → Report a vulnerability**. Its availability is a remote repository setting and is not guaranteed by this checked-in policy. If unavailable, open an [ordinary issue](https://github.com/deanmng1/proofline/issues) requesting a private reporting channel **without technical exploit details, credentials or customer data**, then wait for a maintainer-provided private channel. Do not post a sensitive proof of concept publicly.

Include the immutable source commit, runtime/package versions, OS/architecture, affected boundary, minimal deterministic reproduction and sanitized native evidence. Preserve the original logs for private follow-up, but remove real secrets and one-time local demo capabilities from shared excerpts. Do not contact live providers or attack systems you do not control to demonstrate a test-harness issue.

For evidence expiry, stale attempts or failed release verification, preserve the original evidence and follow [release recovery](../docs/RELEASE_RECOVERY.md). Do not rerun or deploy automatically as part of a vulnerability report.
