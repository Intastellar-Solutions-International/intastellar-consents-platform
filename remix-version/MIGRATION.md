# Webpack app → Remix (`remix-version`)

This folder is a **parallel Remix app** that mirrors the URL map from `src/App.js`. Each route currently renders a **`MigrationShell`** placeholder pointing at the legacy file to port.

## Run (Node ≥ 18, recommended 20)

```bash
cd remix-version
npm install
npm run dev
```

If your default Node is older, use `nvm use` (see `.nvmrc`) or another version manager.

## What is done

- **Vite** + **Remix v2** flat routes, **Tailwind** (optional; legacy `App.css` is imported from `root.tsx` for shared variables).
- **Pathless layout** `routes/_app.tsx` — replace with real `Header` / `Nav` / `Footer` from `src/`.
- **Route modules** for the same paths as the React Router `Switch` (public routes without `_app`, authenticated-style routes under `_app`).
- **`@legacy/*`** path alias in `tsconfig.json` and Vite `resolve.alias` → `../src/*` for gradual imports (components will need refactors: no `window.React`, no `require`, ESM imports).

## Route map (Remix file → URL → legacy)

| Remix route module | URL | Legacy reference |
|--------------------|-----|-------------------|
| `_index.tsx` | `/` | Redirects to `/login` (legacy showed Login on `/`) |
| `login.tsx` | `/login` | `src/Login/Login.js` |
| `signup.tsx` | `/signup` | `src/Login/Signup.js` |
| `auth-login.tsx` | `/auth-login` | `src/Login/AuthLogin.js` |
| `check.tsx` | `/check` | `src/components/Crawler` + `App.js` |
| `_app.dashboard.tsx` | `/dashboard` | `PlatformSelector` in `App.js` |
| `_app.$id.dashboard.tsx` | `/:id/dashboard` | `Dashboard.js` / `ferry/Dashboard.js` |
| `_app.$id.view.$handle.tsx` | `/:id/view/:handle` | Same dashboard shell, domain handle |
| `_app.$id.domains.tsx` | `/:id/domains` | `src/Pages/Domains/index.js` |
| `_app.$id.cookies.tsx` | `/:id/cookies` | `CookiesDashboard.js` |
| `_app.$id.compare.tsx` | `/:id/compare` | `Reports/Compare.js` |
| `_app.$id.reports.tsx` | `/:id/reports` | `Reports/Reports.js` |
| `_app.$id.reports.user-consents.tsx` | `/:id/reports/user-consents` | `UserConsents/UserConsents.js` |
| `_app.$id.reports.audit-report.tsx` | `/:id/reports/audit-report` | `AuditReport/index.js` |
| `_app.$id.reports.marketing.tsx` | `/:id/reports/marketing` | `MarketingReport/index.js` |
| `_app.$id.reports.view.$handle.tsx` | `/:id/reports/view/:handle` | `Reports.js` (scoped) |
| `_app.$id.reports.view.$handle.user-consents.tsx` | `/:id/reports/view/:handle/user-consents` | `UserConsents.js` |
| `_app.$id.reports.view.$handle.audit-report.tsx` | `/:id/reports/view/:handle/audit-report` | `AuditReport` |
| `_app.$id.reports.view.$handle.marketing.tsx` | `/:id/reports/view/:handle/marketing` | `MarketingReport` |
| `_app.settings.tsx` | `/settings` | `Pages/Settings/index.js` |
| `_app.settings.*.tsx` | `/settings/...` | Matching files under `Pages/Settings/` |
| `_app.experiments.tsx` | `/experiments` | `Experiments/Experiments.js` |
| `_app.experiments.$experimentId.tsx` | `/experiments/:experimentId` | Same |

## Porting order (suggested)

1. **Session / auth** — replace `localStorage.getItem("globals")` checks with Remix `sessionStorage` + `root` loader, or cookie sessions.
2. **API module** — move `src/API/api.js` to `app/lib/api.ts` and call from `loader`/`action` (avoid secrets in client bundles).
3. **Contexts** — `OrganisationContext`, `DomainContext` → Remix `Outlet` context or loaders + `useLoaderData`.
4. **One vertical slice** — e.g. `/login` + `/:id/dashboard` end-to-end before `MarketingReport`.

## Vercel

Deploy this app as a **separate Vercel project** rooted at `remix-version`, or use a monorepo “Root Directory” setting. Port `api/*.js` as **resource routes** or keep as Vercel serverless in the parent project until merged.
