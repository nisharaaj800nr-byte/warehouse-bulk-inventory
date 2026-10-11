# Bulk Repair — Backend API Reference (v1.1.1)

The Apps Script backend of the inventory system. Files:

| File | Role |
|------|------|
| `code.js` | Data engines: ingestion, mapping, normalization, rules, reports, alerts, import |
| `code-api.gs` | Web-App API router (`apiRoute_`), RBAC, `doPost` (fetch mode), `runApi` (native mode) |
| `code-auth.gs` | App-level session authentication (v1.1) — credentials, sessions, login |
| `code-ui.gs` + `Index.html` | The original single-file Control Center UI (legacy, still works) |

Two transports, one router:

- **Native**: `google.script.run.runApi(action, params)` — used when the UI is served by Apps Script itself.
- **Fetch**: `POST <deployment>/exec` with JSON body `{ "action": "...", "params": { ... } }`.

Successful response envelope:

```json
{ "status": "ok", "data": { ... }, "version": "1.1.1" }
```

Error response:

```json
{ "status": "error", "message": "AUTH_REQUIRED: ...", "code": "AUTH_REQUIRED" }
```

---

## Authentication (v1.1)

**Why:** `Session.getActiveUser().getEmail()` is empty for anonymous web-app callers
and unreliable for consumer Gmail accounts. The React portal (and later the Telegram bot)
authenticate with **email + password → session token** instead.

### Login flow

1. Call `auth.login` with `{ email, password, rememberMe? }`.
2. On success you receive `{ token, email, role, expiresAt }` — the token is a 64-char hex string.
3. Send `params.token = "<token>"` on **every** subsequent call (both transports).
4. `auth.logout` revokes it. Passwords are stored as salted, iterated SHA-256 hashes; session
   rows store only SHA-256 **hashes** of tokens, never raw tokens.

### Session rules

| Rule | Value |
|------|-------|
| Default validity | 12 hours, sliding (refreshed on use, sheet write throttled to 10 min) |
| `rememberMe` | 30 days, sliding |
| Lockout | 5 consecutive failed logins → 15-minute account lock |
| Error privacy | All credential failures return the same `Invalid email or password.` |
| Revocation | logout, password change (other sessions), password reset (all sessions), account disabled |
| Cleanup | expired/revoked sessions purged at most once per hour (at login) |

### Error codes

| Code | Meaning |
|------|---------|
| `AUTH_REQUIRED` | No/invalid/expired session — show the login screen |
| `AUTH_FAILED` | Wrong credentials (generic message) |
| `AUTH_LOCKED` | Account temporarily locked — retry later |
| `FORBIDDEN` | Session valid but role too low, or account disabled |
| `BACKEND_ERROR` | Anything else (message carries details) |
| `BAD_REQUEST` | Malformed JSON body (fetch mode) |

### Legacy fallback

If no token is sent but the caller has a resolvable Google session email
(script owner, Google Workspace users), the old behaviour applies and RBAC
resolves via the `Authorized Users` sheet. **Anonymous callers are no longer
treated as VIEWER** — every data action now requires a token or a resolvable
Google session. This intentionally closes the old "anyone with the link can read"
gap.

Only three actions are callable without a session: `health`, `auth.login`, `auth.logout`.

### Bootstrap / operations (run in the Apps Script editor)

1. Run `setupAutomationSystem()` once (idempotent) if you have not recently.
2. Run once to create your first login:
   `seedUserPassword('you@example.com', 'your-password', 'OWNER')`
3. Admins can manage the rest in-app (`users.save`, `auth.resetPassword`).
4. Emergency "log everyone out": run `revokeAllSessions()`.
5. Verify the deployment: run `selftest.run` (ADMIN) and check the
   Security Audit / Activity Log sheets for `LOGIN_OK` / `LOGIN_FAIL` events.

### Install / update

1. Open the Apps Script project → **+ → Script → name it `code-auth`** → paste `code-auth.gs`.
2. Replace the contents of `code-api.gs` with the new version.
3. Run `setupAutomationSystem()` once (safe; preserves data).
4. Run `seedUserPassword(...)` once (see above).
5. **Deploy → Manage deployments → Edit → Version: New version → Deploy.**
   For fetch mode the deployment must be: *Execute as: Me*, *Who has access: Anyone*
   (the app-level login is what protects the data).

---

## Action catalogue

`Min role` — lowest role allowed. `VIEWER+` means "any logged-in user".
All roles: `VIEWER < OPERATOR < MANAGER < ADMIN < OWNER`.

### Health & auth

| Action | Key params | Min role | Returns |
|--------|-----------|----------|---------|
| `health` | — | public | `{app, version, role, mode, time}` |
| `auth.login` | `email, password, rememberMe?` | public | `{token, email, role, expiresAt}` |
| `auth.logout` | `token` | public* | `{revoked}` |
| `auth.whoami` | `token` | session | `{email, role, expiresAt, legacy}` |
| `auth.changePassword` | `token, oldPassword, newPassword` | session | `{changed}` (revokes other sessions) |
| `auth.resetPassword` | `email, newPassword` | ADMIN+ | `{reset}` (revokes target's sessions) |
| `auth.users` | — | ADMIN+ | `{users:[{email, role, active, hasPassword, lockedUntil, lastLogin}]}` — never hashes |
| `selftest.run` | — | ADMIN+ | `{ok, checks:[{name, ok, detail}]}` |

\* `auth.logout` is reachable without a session so a stale token client can always clear.

### Dashboard & sources

| Action | Key params | Min role | Returns |
|--------|-----------|----------|---------|
| `dashboard` | — | VIEWER+ | `{inventoryCount, headers, recentRuns, recentErrors, sourcesActive, reportsActive}` |
| `sources.list` | `all?` | VIEWER+ | data-source config rows (all=true includes inactive) |
| `sources.save` | `id?, name, type, role, sheet, sheetId, joinKey, joinFields, active` | MANAGER+ | `{id}` |
| `sources.types` | — | VIEWER+ | `["QC_STOCK", "TRC", "INVENTORY", "LOCATION", "OTHER", ...]` |

### Field mapping & rules

| Action | Key params | Min role | Returns |
|--------|-----------|----------|---------|
| `mapping.list` | `all?` | VIEWER+ | mapping rows (all=true includes inactive) |
| `mapping.headers` | — | VIEWER+ | `{headers}` from RAW_DATA |
| `mapping.save` | `mappings[]` | ADMIN+ | `{saved}` |
| `rules.age.list` / `rules.age.save` | `min, max, bucket, priority, active` | VIEWER+ / ADMIN+ | rows / `{saved}` |
| `rules.status.list` / `rules.status.save` | `raw, bucket, marking, active` | VIEWER+ / ADMIN+ | rows / `{saved}` |
| `rules.location.list` / `rules.location.save` | `pattern, bucket, condition, active` | VIEWER+ / ADMIN+ | rows / `{saved}` |

### Inventory & processing

| Action | Key params | Min role | Returns |
|--------|-----------|----------|---------|
| `inventory.list` | `q, filters{}, page, perPage` | VIEWER+ | `{rows, total, headers, page, perPage}` |
| `inventory.export` | `columns` (csv list) | MANAGER+ | `{csv, rows}` |
| `inventory.add` / `inventory.save` | `item{...}` | OPERATOR+ | `{ok, barcode, mode:'added'|'updated'}` |
| `inventory.delete` | `barcode` | OPERATOR+ | `{ok, barcode}` |
| `process.run` | — | OPERATOR+ | pipeline run summary |
| `history.list` / `errors.list` | — | VIEWER+ | `{headers, data}` |
| `quality.summary` | — | VIEWER+ | `{totalErrors, bySource}` |

### Reports, alerts, settings

| Action | Key params | Min role | Returns |
|--------|-----------|----------|---------|
| `reports.list` | — | VIEWER+ | report config rows |
| `reports.save` | report config | ADMIN+ | `{saved}` |
| `reports.delete` | `name` | ADMIN+ | `{deleted}` |
| `reports.bulkCreate` | — | ADMIN+ | create result |
| `reports.exportToSheet` | — | MANAGER+ | export result |
| `reports.templates.list` | — | VIEWER+ | template rows |
| `reports.templates.save` / `.delete` | template fields | ADMIN+ | result |
| `reports.generate` | `name, columns, filterField?, filterValue?` | MANAGER+ | `{report, rows}` |
| `email.test` | — | ADMIN+ | `{sentTo}` |
| `alerts.list` | `all?` | VIEWER+ | alert rule rows (all=true includes inactive) |
| `alerts.check` | — | OPERATOR+ | `{triggered, total}` |
| `alerts.save` / `alerts.delete` | rule fields | ADMIN+ | result |
| `trends.list` | — | VIEWER+ | `{headers, data}` |
| `activity.list` | — | VIEWER+ | `{headers, data}` |
| `settings.get` | — | VIEWER+ | `{KEY: value}` (incl. TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) |
| `settings.save` | `settings{}` | ADMIN+ | result |
| `telegram.test` | — | ADMIN+ | `{ok}` (sends a test message) |
| `backup.run` | — | ADMIN+ | `{backupId, name}` or `{skipped}` |

### Import — single source

| Action | Key params | Min role | Returns |
|--------|-----------|----------|---------|
| `import.upload` | `headers[], rows[][]` | OPERATOR+ | `{imported, sheet}` |
| `import.preview` | `sourceId` or `sheetId` | VIEWER+ | `{headers, sample, rowCount, source}` |

### Import — universal (v2, file/sheet → staging → commit)

| Action | Key params | Min role | Returns |
|--------|-----------|----------|---------|
| `import.fileB64` | `b64, fileName` | OPERATOR+ | staged result `{ok, fileName, format, headers, totalRows, preview, warnings}` |
| `import.sheets` | `sheetId, tab?` | OPERATOR+ | staged result |
| `import.tabs` | `sheetId` | OPERATOR+ | `[{name, rows, cols}]` |
| `import.previewPage` | `offset, limit` | VIEWER+ | `{headers, rows, offset, totalRows}` |
| `import.commit` | `mapping[], sourceType?, dedupe?, dryRun?` | OPERATOR+ | `{ok, processed, valid, imported, failed, skipped, warnings, errorSample}` |
| `import.discard` | — | OPERATOR+ | `{ok}` |

### Import — multi-source (architecture v2)

| Action | Key params | Min role | Returns |
|--------|-----------|----------|---------|
| `import.multiSource.validate` | `sources[]` | VIEWER+ | per-source validation results |
| `import.multiSource.create` | `sources[]` | OPERATOR+ | `{jobId, sourceCount, status:'READY', sources}` |
| `import.multiSource.run` | `jobId` | OPERATOR+ | `{jobId, status, totalRows, devices, conflicts, failedSources?}` |
| `import.multiSource.status` | `jobId` | VIEWER+ | import job object |
| `import.fileToSource` | `b64, fileName, sheetName` | OPERATOR+ | `{sheetName, headers, totalRows, format}` |
| `sourceData.list` | `q, filters` | VIEWER+ | `{headers, rows, total}` |
| `sourceData.history` | — | VIEWER+ | `{headers, data}` |
| `conflicts.list` | `limit` | VIEWER+ | `{headers, rows, total}` |
| `conflicts.clear` | — | MANAGER+ | `{cleared}` |
| `priorityRules.list` | — | VIEWER+ | rule rows |
| `priorityRules.save` | `rules[]` | ADMIN+ | `{saved}` |

### Security, users, AI

| Action | Key params | Min role | Returns |
|--------|-----------|----------|---------|
| `security.list` | — | VIEWER+ | Sheet Security config rows |
| `security.unlock` | `sheet` | ADMIN+ | unlock result |
| `security.lock` | `sheet` | ADMIN+ | relock result |
| `users.list` | — | VIEWER+ | active user rows (Email/Role/Active) |
| `users.save` | `email, role?, active?, password?` | ADMIN+ | `{saved, updated, passwordSet}` (idempotent per email) |
| `ai.command` | `text` | OPERATOR+ | `{success, message, ...}` — Hindi/English natural-language command |

---

## Notes for the React portal (next round)

- Persist `token` client-side (e.g. `localStorage`), attach as `params.token`, and on
  `code === 'AUTH_REQUIRED'` redirect to the login screen.
- `selftest.run` after deployment gives an instant backend health report.
- Treat `FORBIDDEN` as a permissions message, not a session problem.
- The old single-file UI keeps working via the legacy Google-session path (owner /
  Workspace); it has no login screen, so anonymous use now requires the new portal.

## Dev testing

`tests/auth.smoke.node.js` runs the auth module under Node with a stubbed Apps Script
runtime (no npm install needed):

```
node tests/auth.smoke.node.js
```

It covers: hash/verify, login, token validation, expiry, revocation, lockout/unlock,
session purging, hash-only storage, seeding, caller gating and logout.
