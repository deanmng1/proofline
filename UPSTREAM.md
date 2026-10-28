# Upstream template record

This repository began from [`tomtapia/admin-dashboard-template`](https://github.com/tomtapia/admin-dashboard-template), retained as a local reference baseline for the CRM testing harness.

| Field | Value |
| --- | --- |
| Source URL | `https://github.com/tomtapia/admin-dashboard-template.git` |
| Checked-out commit | `fb6b1d0a23385dfa5353c770ce9f0a17d2d086ad` |
| Upstream subject | `chore(release): 0.7.0 → 0.8.0` |
| Upstream commit date | 2026-08-25 |
| License | MIT, copyright 2026 Tom Tapia |
| Dependency inventory reviewed | 2026-10-27 |

The template's initial dependency inventory includes React 19, Vite 6, TypeScript 5.8, Vitest 3, Playwright 1.62, MSW 2, React Router 7, TanStack Query 5, Tailwind CSS 4, Radix UI, Biome, and Husky. `nx` is added by this workspace to orchestrate application and test targets; the upstream dependencies otherwise remain in place until a later, reviewed change requires an update.

No production provider credentials, customer records, payment data, or third-party API calls are inherited or introduced by this testbed.
