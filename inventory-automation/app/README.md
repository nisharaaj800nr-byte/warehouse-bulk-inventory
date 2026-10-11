# Bulk Repair — Portal (React)

Production web portal for the Bulk Repair inventory system. React 19 + TypeScript + Vite.
Talks to the Google Apps Script backend (`code-api.gs` v1.1) through two transports:

- **gas** (default when served by Apps Script): `google.script.run` → `runApi()`.
- **http**: POST JSON to a deployed web-app URL (`/exec`) — used for static hosting.

## Quick start (dev)

```
npm install
npm run dev
```

In dev (http mode), set the deployment URL on the login screen — it is stored in
`localStorage` as `ors.apiUrl`. You can also pre-configure it with `VITE_API_URL`.

## Builds

| Command | Output | Use |
|---------|--------|-----|
| `npm run build` | `dist/` | Static hosting (fetch mode) |
| `npm run build:gas` | `dist-gas/App.html` | Single self-contained file for Apps Script |
| `npm run typecheck` | — | Strict TypeScript check |

## Deploy to Apps Script (primary)

1. `npm run build:gas`
2. Open the Apps Script project → **+ → HTML** → file name `App` → paste the full
   contents of `dist-gas/App.html`.
3. `doGet()` serves `App` (the deployment URL opens the React portal).
   `?ui=classic` still opens the old single-file UI; if `App` is missing, the old UI
   is served automatically as a fallback.
4. **Deploy → Manage deployments → Edit → New version → Deploy.**

## Static hosting (optional)

Serve `dist/` from any static host and set the backend `/exec` URL on the login
screen (stored in `localStorage` as `ors.apiUrl`), or provide `VITE_API_URL` at build time.

## Demo mode

On the login screen choose **Explore demo** to preview the UI with sample data — no
backend needed. Demo mode is local-only and never talks to the API.

## Layout

```
src/
  app/        route registry + guards + error boundary
  layout/     app shell (sidebar, topbar, nav config)
  features/   all screens: auth, dashboard, inventory, imports, reports, rules,
              mapping, sources, alerts, users, activity, settings, assistant
  lib/        api client + actions, query client, utils, demo fixtures
  ui/         design system (buttons, dialogs, tables, toasts …)
  styles.css  design tokens (light/dark) + component styles
```

## Auth

The backend uses app-level session tokens (see `docs/API.md` in the project root).
The portal stores the token in `localStorage['ors.token']`, sends it as `params.token`
on every call, and redirects to the login screen when a session expires (`AUTH_REQUIRED`).
