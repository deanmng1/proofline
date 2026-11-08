# Proofline source history

## 0.9.0-preview.2 — Source-only confidence update (2026-11-08)

- Adds source-pinned starter/core/upgrade planning with explicit application and verified hash receipts.
- Adds read-only safeguards auditing; actual main rules enforce both required Actions checks, PR/up-to-date/conversation rules, and no bypass/force/delete. Private reporting is enabled; zero required human approvals remains a sole-maintainer limitation.
- Adds immutable supplementary verification history and trusted-default-branch automatic collection. Exact sole legacy `verify` jobs retain original failures with unknown current platforms/gates.
- Records fresh CRM/work-orders/starter verification, unchanged coverage floors and source-bound main release-artifact checks. See [current status](docs/PROJECT_STATUS.md); packaged publication and live staging remain pending.

## 0.9.0-preview.1 — Unpublished source preview (2026-11-05)

- Introduces the Proofline identity for the portable React/Vite regression harness, manifest schema 1, guarded native-outcome verification, preserved invocation evidence, coverage/record governance and verified prebuilt release tooling.
- Repairs external-adoption setup: browser cache discovery, independent target installation, an isolated no-backend CRM demo, one complete CI workflow and consistent runtime/contributor instructions.
- Tracks current project status and scoped preview support without requiring ignored local ledgers or claiming a hosted release/deployment. Current repair verification and independent rating are recorded in [project status](docs/PROJECT_STATUS.md) and the append-only execution record.

## Original dashboard template history

The entries below are retained attribution/history. Their tags and version numbers predate Proofline and must not be used to identify a harness distribution.

## v0.8.0 (2026-08-25)

### Feat

- **login**: rebuild login screen after paceui auth-3 reference
- **auth**: remember last signed-in account and support login methods

## v0.7.0 (2026-08-25)

### Feat

- **ui**: add alert, tabs, and tooltip primitives
- **ui**: redesign ui kit showcase with tabbed sections and token coverage

### Fix

- **navigation**: make breadcrumbs navigable with clear visual affordance
- **sidebar**: collapse sections by default and restyle the scroll area
- **data**: generalize search filter bar and polish gallery toolbar copy
- **apps**: align mail reader and calendar events with the design system
- **pages**: align profile identity card and detail grid with the design system

## v0.6.0 (2026-08-24)

### Feat

- **nav**: three-level information architecture with collapsible sections
- **apps**: mail module with inbox and sent folders
- **apps**: calendar module with month grid
- **pages**: profile page and authentication/not-found demo entries
- **ui**: ui kit showcase page
- **data**: tables and charts gallery pages
- **overview**: kpi sparklines and live bottom-zone data
- **layout**: route-driven breadcrumbs above the page header

### Docs

- **docs**: information architecture, naming contract, and new modules

## v0.5.1 (2026-08-24)

### Fix

- **mocks**: boot msw in production so the zero-backend demo stays interactive

## v0.5.0 (2026-08-24)

### Feat

- **ci**: deploy demo to vercel on release publish
- **github**: add security policy, issue templates, and pull request template

### Docs

- **contributing**: add contributor guide and code of conduct
- **readme**: finalize public-repo badges, live demo link, licensing, and community resources
- **architecture**: document the release demo deployment pipeline

### Chore

- **license**: add MIT license
- **config**: pin packageManager and node engine, ignore local env files
- **ci**: enforce least-privilege permissions and concurrency in the pipeline

## v0.4.0 (2026-08-23)

### Feat

- **a11y**: text alternatives for charts
- **a11y**: announce route changes and move focus to page heading
- **theme**: default to system color scheme when no preference stored
- **users**: profile drawer, resend invite and suspend access with undo
- **data-table**: keyboard-accessible rows, sortable columns and pagination
- **overview**: working period selector and chart-series filters
- **filters**: functional role chips, working exports and empty-state actions
- **users**: invite flow with mock endpoint and csv export utility
- **ui**: checkbox item for dropdown menus
- **layout**: wire search trigger, live notifications dropdown and unread badge; drop dead mail button
- **search**: add cmdk command palette with pages, themes and account actions
- **auth**: pending feedback on mock sign-in button
- **ui**: retryable error states across module pages
- **ui**: add alert dialog and confirm dialog primitives
- **ui**: add skeleton primitives for stable loading layouts

### Fix

- **i18n**: nest nav group labels so translations resolve
- **layout**: grouped scrollable mobile nav with working active states
- **theme**: raise muted-foreground contrast to wcag aa on all palettes
- **ui**: 44px touch targets for icon buttons on mobile
- **ui**: stable keys for static skeleton cells
- **settings**: inline validation, labelled switches and unsaved-changes guard
- **styles**: respect prefers-reduced-motion across animations

### Refactor

- **pages**: swap spinner panels for layout-stable skeletons

## v0.3.0 (2026-08-22)

### Feat

- **observability**: add error tracking and monitoring foundation
- **i18n**: add react-i18next with locale switcher and translated UI
- **auth**: add token refresh, session expiry, and 401 retry
- **tenancy**: add tenant context, switcher, and API scoping

## v0.2.1 (2026-08-22)

### Fix

- **deps**: upgrade dependencies and resolve deprecation warnings

## v0.2.0 (2026-08-22)

### Feat

- add sunset-ember and forest-deep theme presets
- enforce role-based access in nav and routes
- make api base url configurable for real backends
- add global and route-level error boundaries
- expand template with 7 SaaS modules (billing, analytics, team, notifications, transactions, integrations, support)

### Fix

- render card titles as h2 to preserve heading order
- configure pnpm v11 workspace so pnpm dev runs

### Refactor

- remove unused variables and quiet false-positive lint rules
- centralize mutation error toasts
