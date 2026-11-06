# Human onboarding worksheet

Complete this with a real participant using the [first-run guide](../GETTING_STARTED.md). Leave unknown fields blank. Agent validation is separate evidence and must not be reported as unassisted human adoption.

| Field | Observation |
| --- | --- |
| Participant / organization (consent to record) | |
| Date, source full SHA / receipt version | |
| OS, architecture, Node / pnpm / Git | |
| Starter or existing-app adaptation | |
| Prior Proofline / React testing experience | |
| Start time / timezone | |
| First readable plan time | |
| First successful installation time | |
| First validated ten-gate run time | |
| Elapsed active minutes / waiting minutes | |
| Exact target base / head | |
| Required unit / browser counts and native evidence paths | |
| Expected failing regression / restored green evidence | |
| Full gate outcome and logs | |

For each blocker, record the attempted command, expected result, actual result, time lost, resolution and whether documentation was enough. Preserve the first failure and subsequent attempts; do not replace them with the eventual pass.

| Time | Blocker / exact command | Result / evidence | Resolution | Minutes |
| --- | --- | --- | --- | --- |
| | | | | |

Record every form of assistance, including hints, screen sharing, copied commands, agent edits and maintainer intervention.

| Time | Human / agent / documentation assistance | What changed | Could participant proceed independently? |
| --- | --- | --- | --- |
| | | | |

State whether the participant completed a starter or engineered an existing-app adaptation; list target-owned routes, roles, providers, tests and ownership work actually completed. Record any core edits, collisions, upgrade/recovery attempts and receipt limitations. A copied core or passing starter does not prove the existing app is adapted.

Participant's own assessment: what was confusing, which step needed outside help, and what would prevent a second independent run?

Reviewer: name exact inspected source, preserved failures, assistance level, completion scope and unresolved blockers. Mark the result **pending**, **blocked**, **assisted human completion** or **unassisted human completion** only when the evidence supports it. One pilot does not establish broad organization adoption, long-run reliability or a support SLA.
