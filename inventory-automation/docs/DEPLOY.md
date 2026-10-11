# Deploying the Bulk Repair system (v1.1 — Oct 2026)

This is the current step-by-step deployment for the **login system** and the
**React portal**. Where it differs from `setup_guide.md`, this document wins.

## Files to paste into your Apps Script project

One Apps Script project (bound to your spreadsheet) contains all of these.
Names matter.

| File | Kind | What it is |
|------|------|------------|
| `code.js` | Script | Data engines (pipeline, rules, reports, alerts) |
| `code-api.gs` | Script | API router v1.1 — every action is auth-gated |
| `code-auth.gs` | Script | Login system (passwords, sessions, lockout, selftest) |
| `code-ui.gs` | Script | Serves the UI — React portal by default; `?ui=classic` for the old UI |
| `Index.html` | HTML | Legacy single-file UI (keep it — it is also the auto-fallback) |
| `App.html` | HTML | React portal (single-file build). In the editor create an HTML file named **`App`** and paste this | 
| `appsscript.json` | Manifest | Scopes + timezone |

The `Apps-Script-Files.zip` bundle in this folder mirrors exactly these files.

## Step by step

1. Spreadsheet → **Extensions → Apps Script**.
2. Ensure the files above exist with the exact names (Scripts: `code`, `code-api`,
   `code-auth`, `code-ui`; HTML: `Index`, `App`).
3. Paste the latest contents of each file from this folder.
4. Run `setupAutomationSystem()` once from the editor. Safe to re-run (idempotent).
5. Open `code-auth.gs`, edit the two values inside `seedMyPassword()`
   (your email + a password of 6+ characters), then press **Run** once.
   This creates your first login (OWNER role). *(You can also call
   `seedUserPassword('you@example.com', 'password', 'OWNER')` from any wrapper.)*
6. **Deploy → Manage deployments → Edit → Version: New version → Deploy.**
   - Execute as: **Me**
   - Who has access: **Anyone** (the app-level login protects the data)
7. Open the deployment URL:
   - Default → **React portal** → sign in with the email/password from step 5.
   - Legacy UI → append `?ui=classic` to the URL.
8. Verify: sign in, open the Dashboard, then check the **Security Audit** sheet —
   you should see a `LOGIN_OK` row with your email.

## Demo preview (no deployment needed)

Open `App.html` in a browser (or run `npm run preview` inside the `app/` folder)
and click **“Explore demo (sample data)”** on the login screen. Demo mode is
local-only — no backend calls.

## Notes

- **Rebuilding the portal after changes:** `cd app && npm install && npm run build:gas`
  → fresh single-file at `app/dist-gas/App.html` → paste into the `App` HTML file.
- **Roles:** VIEWER < OPERATOR < MANAGER < ADMIN < OWNER. Reads need a login;
  writes need OPERATOR+; configuration needs ADMIN+. Manage users from the portal
  (Users & Security screen) or the `Authorized Users` sheet.
- **Troubleshooting:**
  - *Login fails* → check the `Authorized Users` row (exact email, `Active` = ON)
    and re-run `seedMyPassword()`.
  - *Old UI still shows* → the `App` HTML file is missing or failed to paste;
    re-add it, then redeploy a new version.
  - *Portal shows a blank page* → tell AutoCoder; a build-format switch fixes it
    (rare browser sandbox case).
