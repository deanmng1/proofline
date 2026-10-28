# Insurance CRM regression testbed

A production-shaped **React 19 + Vite 6 + TypeScript** insurance CRM reference application and regression-testing harness. It models Risk Secure and Risk Secure Plus quoting, binding, finance events, and commission timing without requiring a live backend or provider account.

**Purpose:** build product rules once, exercise them at the domain/API/UI/browser
layers, and keep future changes from consuming agent time on rediscovering old
regressions.

[![License: MIT](https://img.shields.io/badge/license-MIT-2563eb)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.8.0-2563eb)](CHANGELOG.md)
[![React](https://img.shields.io/badge/React-19-087ea4?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8_strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06b6d4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

![Admin Dashboard Template — Overview page with KPI cards, revenue chart, and category breakdown](docs/images/dashboard-overview.png)

## About

Standing up an insurance CRM usually means weeks of plumbing before the first real feature: session handling, tenant scoping, data tables, finance transitions, commissions, audit history, accessibility, and a test pipeline. This reference app makes those decisions concrete — and proves the business rules with unit, contract, UI, and end-to-end tests.

The CRM journeys use a fresh in-memory Test API per browser test. That makes quoting and finance flows deterministic, blocks unplanned `/api/*` calls, and avoids consuming provider credentials while regressions are diagnosed.

## Regression harness

The test strategy is intentionally layered: pure insurance rules first,
contract and UI behavior next, and browser journeys only where a real workflow
crosses screens. The conservative selector explains why each test ran and
falls back to the entire suite when it cannot safely narrow scope.

```bash
pnpm test:impacted -- --dry-run  # inspect the conservative selection and reasons
pnpm test:impacted               # run selected project tests and browser journeys
pnpm test                        # every Vitest project
pnpm e2e                         # complete Chromium regression suite
```

See [the testing guide](docs/TESTING.md) for the required rule-to-regression
workflow, artifact locations, and CI behavior.

## Key Features

- **20 routed pages** across a strict 3-level information architecture — Overview, Analytics, Mail (Inbox/Sent), Calendar, Notifications, Support, Integrations, Users, Team, Billing, Transactions, Profile, UI Kit, Tables & Charts galleries, Settings, User Settings, Login and 404 — all lazy-loaded behind a protected shell.
- **Three-level sidebar** (Group › Section › Subsection) with collapsible sections, RBAC-aware subtrees, and route-driven **breadcrumbs** above every page.
- **Multi-tenancy built in** — every request is scoped with an `X-Tenant-Id` header; a branded workspace switcher lives at the top of the sidebar and mobile nav.
- **Production-shaped auth** — access/refresh tokens, automatic `401 → refresh → retry`, silent refresh on load, and redirect-to-login on failure. The login screen mirrors modern SaaS re-auth flows: a continue-as card for the remembered account, an email/password form, and mock Google/Apple providers.
- **Role-based access control** — nav visibility and route guards gated by Owner / Admin / Manager through a single `canAccess()` source of truth.
- **Four theme presets** (Core Light, Midnight Ops, Sunset Ember, Forest Deep) driven by CSS variables, honoring `prefers-color-scheme` by default.
- **Internationalized** — English, Spanish, and French bundles via `react-i18next`, switchable per user.
- **Resilient UX contract** — skeleton-first loading (no spinner page-swaps), retryable error panels, confirm dialogs with **Undo** toasts, and zero decorative buttons.
- **Dashboard hierarchy done right** — KPI cards with sparklines on top, interactive charts in the middle, operational tables at the bottom (inverted pyramid).
- **Accessible to WCAG 2.2 AA** — skip link, focus management on navigation, keyboard-operable tables, sr-only chart data tables, AA-contrast tokens, `prefers-reduced-motion`; enforced by jest-axe in CI.
- **Observability-ready** — Sentry error reporting activates lazily when `VITE_SENTRY_DSN` is set; console fallback otherwise.
- **Quality pipeline** — domain, contract, UI, and Playwright regression suites; conservative impact selection; Biome lint/format; and a GitHub Actions safety gate.
- **⌘K command palette** — fuzzy navigation across every routable page (auto-flattened from the nav tree), theme switching, and account actions.

## Getting Started

### Prerequisites

| Tool   | Version |
| ------ | ------- |
| Node.js | ≥ 22 |
| pnpm    | ≥ 11 |

### Installation

```bash
# 1. Get the code (or click "Use this template" on GitHub)
git clone <your-repo-url> admin-dashboard
cd admin-dashboard

# 2. Install dependencies
pnpm install
```

### Quickstart — running in under 2 minutes

```bash
pnpm dev
```

Then:

1. Open **http://localhost:5173** — unauthenticated visits redirect to `/login`.
2. Click **Continue as Avery Stone** — or switch to the password form or a mock Google/Apple button — every sign-in path issues a real-shaped access/refresh token session (no real credentials needed).
3. You land on the Overview. Press **⌘K / Ctrl+K** to explore the command palette, or switch workspaces from the top of the sidebar.

The MSW worker starts automatically unless a real backend is configured via `VITE_API_BASE_URL`, so all data, invites, and mutations work immediately against seeded fixtures.

## Usage & Examples

### Everyday commands

```bash
pnpm dev          # Vite dev server + MSW worker
pnpm build        # tsc -b typecheck + vite build -> dist/
pnpm preview      # serve the production build
pnpm test         # every Vitest project (domain, contract, UI, selector)
pnpm e2e          # isolated Chromium CRM/browser suite
pnpm test:impacted -- --dry-run  # explain the conservative test selection
pnpm typecheck    # typecheck all projects that own a typecheck target
pnpm lint         # Biome check
pnpm format       # Biome format --write .
```

### Point it at a real backend

```bash
cp .env.example .env.local
```

```dotenv
VITE_API_BASE_URL=https://api.example.com
VITE_SENTRY_DSN=            # optional: enables Sentry error reporting
VITE_APP_ENV=production     # optional: tags Sentry events
```

Build and deploy `dist/` to any static host (Vercel, Netlify, S3 + CloudFront…). As soon as `VITE_API_BASE_URL` is set at build time, the MSW mock layer stays off and all requests go straight to your backend — just implement the same `/api/*` paths defined in [`src/mocks/handlers.ts`](src/mocks/handlers.ts). Without it (as on the live demo), the app runs fully interactive against the seeded mocks.

### Restrict a feature by role

RBAC is wired in two places, both backed by [`src/lib/rbac.ts`](src/lib/rbac.ts):

```ts
// src/components/layout/nav-items.ts — hide the nav entry
{ title: "Audit Log", href: "/app/audit", icon: "scroll-text", roles: ["Owner", "Admin"] }
```

```tsx
// src/app/router.tsx — guard the route itself
<RoleRoute roles={["Owner", "Admin"]}>
  <Suspense>{/* <AuditPage /> */}</Suspense>
</RoleRoute>
```

Unauthorized roles are redirected to `/app/overview`. Note this is client-side gating only — enforce authorization on your backend.

## Project Structure

```text
apps/
├── crm-web/        # Vite React application and CRM UI/component tests
└── crm-e2e/        # Playwright journeys and isolated Test API fixture
packages/
├── domain/         # Deterministic policy, finance, commission, and audit rules
├── api-contracts/  # HTTP contract and in-memory Test API
└── test-kit/       # Shared deterministic fixtures and rendering helpers
test-impact/        # Reviewed feature map and business-rule catalog
tools/impact/       # Changed-file manifest and conservative test selector
docs/TESTING.md     # Rule-to-regression and CI workflow guide
```

Imports always use the `@/` path alias (mapped to `src/`).

## Roadmap / Status

**Status:** actively developed, pre-1.0. Releases are cut locally with [Commitizen](https://commitizen-tools.github.io/commitizen/) (`czg bump`) and documented in the [changelog](CHANGELOG.md); publishing a release also deploys the live demo to Vercel.

Recently shipped (v0.3–v0.4): tenancy scoping, token refresh lifecycle, i18n, Sentry foundation, and a full UX/a11y overhaul (skeletons, undo flows, command palette, keyboard-accessible tables).

Candidate milestones toward **v1.0**:

- Hardened production auth story (server-issued sessions instead of `localStorage` tokens)
- Documented server-side authorization contract alongside the client RBAC
- Coverage reporting wired into CI
- Additional themes and locale bundles

## Community & Ecosystem

| Resource | Description |
| -------- | ----------- |
| [Architecture guide](ARCHITECTURE.md) | Full architectural reference — components, data flow, security notes, and the recipe for adding new modules |
| [Contributing guide](CONTRIBUTING.md) | Setup, branch/commit conventions, testing expectations, PR checklist |
| [Security policy](.github/SECURITY.md) | How to report vulnerabilities privately |
| [Code of conduct](.github/CODE_OF_CONDUCT.md) | Contributor Covenant 2.1 |
| [Changelog](CHANGELOG.md) | Release history, generated from Conventional Commits |
| [Environment variables](.env.example) | Backend URL, Sentry DSN, environment label |

**Contributing** — see the [contributing guide](CONTRIBUTING.md) for setup and conventions. In short: commits follow [Conventional Commits](https://www.conventionalcommits.org/), a Husky pre-commit hook runs Biome on staged files, and PRs must pass conservative impact selection plus the complete lint, typecheck, Vitest, and Chromium safety gates.

**Support** — please open a GitHub issue for bugs and feature requests.

**License** — released under the [MIT License](LICENSE).
