# Webpack app → Remix (`remix-version`)

## Current approach (all screens)

The legacy UI is **hosted inside Remix** via a single catch-all route (`app/routes/$.tsx`) that mounts `src/App.js` once in `app/legacy/LegacyRoot.tsx`:

1. **`assignLegacyGlobals`** sets `globalThis.React`, `ReactDOM`, and `ReactRouterDOM` (React Router **v5**, npm alias `react-router-dom-v5`) so existing `App.js` and `src/**/*.js` behave like the old UMD shell.
2. **Dynamic `import()`** loads `App.js` only in the browser after globals are set (avoids `localStorage` / `window` during SSR module init).
3. **Vite `legacy-src-jsx` plugin** (`vite.config.ts`) transpiles JSX inside `../src/**/*.js` before Vite’s import analysis (same role Babel had in webpack).

Global scripts used by charts/maps (AnyChart, svgMap, svg-pan-zoom, Stripe pricing table) are loaded from **`root.tsx`** `<head>`.

## Run

```bash
cd remix-version
npm install
nvm use   # Node 18+ (see .nvmrc)
npm run dev
```

Open any legacy path (`/login`, `/gdpr/dashboard`, `/gdpr/reports/marketing`, …).

## Next steps (true Remix port)

Gradually replace the bridge with:

- **Loaders/actions** for API calls and cookies/sessions  
- **Route modules** per URL instead of one splat  
- **Remove globals** and React Router v5 from `src/`

## Legacy `src/` tweaks for Vite

- **`punycode`**: `require("punycode")` → `import punycode from "punycode"` where needed.  
- **ESM import order**: `import` statements moved above `const … = React` in files that mixed them.  
- **Path casing**: imports to `Filter/filterDatePresets` use **`../../Components/Filter/...`** so TypeScript matches the same canonical path as `App.js` → `./Components/...`.

## Vercel

Deploy with project **Root Directory** = `remix-version`. Copy or symlink `api/` from the repo root if you need the same serverless routes, or port them to Remix resource routes.
