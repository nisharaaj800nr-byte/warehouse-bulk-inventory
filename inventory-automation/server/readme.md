# Bulk Repair — Local Server

Production local backend for the warehouse inventory app. Replaces the Google
Apps Script backend with a Node.js service that runs **fully offline** on this
machine: no cloud account, no Docker, no external database server.

## Stack

- Node.js 22 + TypeScript (strict, ESM)
- `node:sqlite` (built-in) — one database file, WAL mode, foreign keys
- Express 4 + zod validation
- vitest + supertest (real HTTP, real temporary database per suite)
- scrypt password hashing, hashed session tokens, audit log

## Run

```powershell
cd inventory-automation/server
npm install
npm run build
npm test
node dist\tools\create-user.js owner@example.com "YourStrongPassword" OWNER
$env:DB_PATH="./data/bulkrepair.db"; node dist\index.js
# http://localhost:5000/api/health
```

Configuration (environment, all optional): `PORT` (5000), `HOST` (0.0.0.0),
`DB_PATH` (./data/bulkrepair.db), `SESSION_TTL_HOURS` (168), `LOG_LEVEL` (info).

Roles: `VIEWER`, `OPERATOR`, `MANAGER`, `ADMIN`, `OWNER`. There are no default
accounts — the first user is created only through the CLI or the users API.

## Database schema (migrations 001 + 002)

`users`, `sessions`, `inventory`, `audit_log`, `schema_version` +
`sources`, `field_mappings`, `age_rules`, `status_rules`, `location_rules`,
`priority_rules`, `import_jobs`, `import_rows`, `import_errors`,
`data_conflicts`, `report_templates`, `alerts`.

Migrations run on every boot and are idempotent (`schema_version`).

## API

Responses are always `{ "ok": true, "data": ... }` or
`{ "ok": false, "error": { "code", "message", "details" } }`.
Errors: 400 `VALIDATION_ERROR`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`,
404 `NOT_FOUND`, 409 `DUPLICATE`, 423 `ACCOUNT_LOCKED`, 429 `RATE_LIMITED`.

### Health & auth

| Method | Path | Auth |
|---|---|---|
| GET | `/api/health` | none |
| POST | `/api/auth/login` | none |
| POST | `/api/auth/logout` | bearer |
| GET | `/api/auth/whoami` | bearer |
| POST | `/api/auth/change-password` | bearer |

Login hardening: generic failure message, 5 failures → 15 minute lock,
rate limit 10 attempts / 5 minutes per IP+email.

### Inventory

| Method | Path | Auth |
|---|---|---|
| GET | `/api/inventory` | any role — `page`, `pageSize`, `q`, `status`, `ageBucket`, `statusBucket`, `location`, `sort`, `dir` |
| GET | `/api/inventory/:id` | any role |
| POST | `/api/inventory` | ADMIN/OWNER |
| PUT | `/api/inventory/:id` | ADMIN/OWNER |
| DELETE | `/api/inventory/:id` | ADMIN/OWNER |
| GET | `/api/inventory/export.csv` | any role |

### Configuration

| Method | Path | Auth |
|---|---|---|
| GET | `/api/sources`, `/api/sources/types` | any role |
| POST/PUT/DELETE | `/api/sources`, `/api/sources/:id` | ADMIN/OWNER |
| GET | `/api/sources/:id/mapping` | any role |
| PUT | `/api/sources/:id/mapping` | ADMIN/OWNER (replaces all rows in one transaction) |
| GET/POST/PUT/DELETE | `/api/rules/age`, `/api/rules/status`, `/api/rules/location` (+ `/:id`) | read any role, write ADMIN/OWNER |
| GET | `/api/rules/priority` | any role |
| PUT | `/api/rules/priority` | ADMIN/OWNER (replaces all rows) |

### Imports

| Method | Path | Auth |
|---|---|---|
| POST | `/api/imports/upload` | OPERATOR+ — stages rows, validates required mapped columns |
| GET | `/api/imports`, `/api/imports/:id`, `/api/imports/:id/preview` | any role |
| POST | `/api/imports/:id/commit` | OPERATOR+ — applies rules, upserts inventory in one transaction |
| POST | `/api/imports/:id/discard` | OPERATOR+ |
| POST | `/api/imports/merge` | OPERATOR+ — multi-source consolidation with priority rules |
| GET | `/api/conflicts` | any role |
| POST | `/api/conflicts/clear` | ADMIN/OWNER |

Imports never wipe existing data: an empty incoming value is ignored on update.
Multi-source merges record every field disagreement in `data_conflicts` together
with the winning value and the rule that decided it.

### Reports, alerts, insights, users

| Method | Path | Auth |
|---|---|---|
| GET | `/api/reports/groups` | any role |
| POST | `/api/reports/run` | any role — `groupBy` + optional filters |
| GET | `/api/reports/export.csv` | any role |
| GET/POST/PUT/DELETE | `/api/reports/templates` (+ `/:id`) | read any role, write ADMIN/OWNER |
| GET/POST/PUT/DELETE | `/api/alerts` (+ `/:id`) | read any role, write ADMIN/OWNER |
| POST | `/api/alerts/check` | any role — evaluates `AGE_OVER`, `STATUS_BUCKET_COUNT`, `MISSING_FIELD` |
| GET | `/api/dashboard`, `/api/quality`, `/api/trends` | any role |
| GET/POST/PUT | `/api/users` (+ `/:id`) | ADMIN/OWNER — passwords go through the same scrypt hashing |

An admin cannot deactivate or demote their own account; deactivating a user
revokes all of that user's sessions immediately.

## Tests

```powershell
npm test
```

Six suites cover password hashing, auth/session lifecycle, lockout, rate
limiting, inventory CRUD and pagination, sources/mapping/rules, single and
multi-source imports, conflicts, reports, alerts, insights and user
administration — all against a real SQLite database, no mocks.

## Deliberately not implemented

Google Apps Script deployment, email delivery (MailApp) and Telegram alerts
require network services and are out of scope for an offline server. The portal
and Flutter client still talk to the old Apps Script endpoint; switching them
over is the remaining client-side step.
