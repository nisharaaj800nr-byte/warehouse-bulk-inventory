# Bulk Repair — Local Server (Phase 1)

Production local backend for the warehouse inventory app. Replaces the Google
Apps Script backend with a Node.js service that runs **fully offline** on this
machine: no cloud account, no Docker, no external database server.

## What is implemented (Phase 1)

- Real SQLite persistence via Node's built-in `node:sqlite` (single file, WAL mode).
- Versioned migrations (`schema_version`), idempotent on every boot.
- Password auth with scrypt (N=16384, r=8, p=1), per-user salt, constant-time compare.
- Session tokens: 32 random bytes, only SHA-256 hashes stored, 7 day TTL, revocation.
- Login hardening: generic failure message, 5 attempts → 15 minute lock, per IP+email rate limit.
- Audit log table written by every auth and inventory mutation.
- Inventory CRUD with role gates (`ADMIN`/`OWNER` write, all roles read), pagination, search, sorting.
- CSV export generated from real database rows with RFC4180 escaping.
- Strict request validation (zod) and a single JSON error envelope.
- Test suite (vitest + supertest) against a real temporary database per suite.

## Requirements

- Node.js 22+ (uses the built-in `node:sqlite` module; an `ExperimentalWarning` is expected)
- npm

## Setup

```powershell
cd inventory-automation/server
npm install
npm run build
npm test
```

## Create the first user (no default accounts exist)

```powershell
node dist/tools/create-user.js owner@example.com "YourStrongPassword" OWNER
```

Roles: `VIEWER`, `OPERATOR`, `MANAGER`, `ADMIN`, `OWNER`.

## Run

```powershell
$env:PORT=5000
$env:DB_PATH="./data/bulkrepair.db"
node dist/index.js
```

Then:

```powershell
curl http://localhost:5000/api/health
```

Configuration (all optional, read from environment):
`PORT` (5000), `HOST` (0.0.0.0), `DB_PATH` (./data/bulkrepair.db), `SESSION_TTL_HOURS` (168), `LOG_LEVEL` (info).

## API (Phase 1)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | none | Real DB health probe |
| POST | `/api/auth/login` | none | Returns bearer token |
| POST | `/api/auth/logout` | bearer | Revokes current session |
| GET | `/api/auth/whoami` | bearer | Current user |
| POST | `/api/auth/change-password` | bearer | Revokes other sessions |
| GET | `/api/inventory` | bearer | Paginated list: `page`, `pageSize`, `q`, `status`, `ageBucket`, `statusBucket`, `location`, `sort`, `dir` |
| GET | `/api/inventory/:id` | bearer | Single item |
| POST | `/api/inventory` | ADMIN/OWNER | Create |
| PUT | `/api/inventory/:id` | ADMIN/OWNER | Update |
| DELETE | `/api/inventory/:id` | ADMIN/OWNER | Delete |
| GET | `/api/inventory/export.csv` | bearer | CSV export of filtered rows |

Responses: `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code", "message", "details" } }`.

## Not in Phase 1

Imports, field mapping, rules engine, reports, alerts, multi-source consolidation,
users admin UI and the Flutter client wiring are still served by the Apps Script
version. They are planned for Phase 2 on top of this server.

## Backup

The whole database is one file (`data/bulkrepair.db`). Stop the server and copy it,
or use SQLite's online backup while running. `data/` is gitignored on purpose.
