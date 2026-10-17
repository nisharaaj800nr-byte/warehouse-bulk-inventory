# HANDOFF — Bulk Repair local app + multi-platform plan (2026-10-18)

> Ye document us poore kaam ka handoff hai jo 17–18 Oct 2026 ki raat me hua:
> Google Apps Script backend ki jagah ek **local, offline, tested backend** bana,
> purane React panel ko usse jodne ke liye **bridge** bana, aur ab
> **Windows/Android packaging** ka raasta tay hua.
>
> **Latest commit:** `2967c65` · **Branch:** `main` · **Repo:** `nisharaaj800nr-byte/warehouse-bulk-inventory`

---

## 1. TL;DR (aaj ki state)

| Cheez | Status |
|---|---|
| Local server (Node 22 + SQLite) | ✅ Working, 77 tests pass |
| Panel (React) local server se juda | ✅ `/api/gas` bridge, same-origin |
| Ek hi process me UI + API | ✅ `http://localhost:5050` |
| Excel/CSV import | ✅ Real parsing (SheetJS), preview → commit |
| Rules engine / reports / alerts / users | ✅ REST + bridge |
| Windows `.exe` bundle | ⏳ pending |
| Android `.apk` bundle | ⏳ pending |
| macOS / iOS | ⏳ Apple account ke baad |
| **Apps Script backend** | ⚠️ Aapki latest requirement — app ko `/exec` URL pe point karna baaki hai |

**Sabse zaroori baat:** user ne 18-10-2026 03:08 pe kaha ki **Apps Script hi use karna hai**.
Isliye aage ka kaam = *packaging* (Electron + Capacitor) with Apps Script `/exec` URL.
Local server kaam karta hai aur **offline mode** ke roop me rakha ja sakta hai.

---

## 2. Kya bana (3 layers)

### Layer 1 — Local server (`inventory-automation/server`)

- Node 22 + TypeScript (strict, ESM), Express 4, zod validation
- Database: **`node:sqlite`** (built-in, file-based, WAL) — koi external DB nahi
- Auth: **scrypt** (N=16384, r=8, p=1), per-user salt, `timingSafeEqual`
- Sessions: 32-byte token, DB me sirf SHA-256 hash, TTL 168h, revocable
- Lockout: 5 fail → 15 min; login rate limit 10 / 5 min per IP+email
- Audit log: login/logout/lockout/password change/source/rule/import/user changes
- Roles: `VIEWER`, `OPERATOR`, `MANAGER`, `ADMIN`, `OWNER`

**Migrations (idempotent, boot pe chalti hain):**

| # | Kya |
|---|---|
| 001 | users, sessions, inventory, audit_log, schema_version |
| 002 | sources, field_mappings, age/status/location rules, priority_rules, import_jobs/rows/errors, data_conflicts, report_templates, alerts |
| 003 | import_files (staged uploads), settings |

**Endpoints:** 61 route handlers (REST) + `/api/gas` bridge.
Dependencies sirf 3: `express`, `zod`, `xlsx`.

### Layer 2 — Panel bridge (`src/routes/legacy.ts` + `legacyExtended.ts`)

Purana React panel Google Apps Script contract pe likha tha:

```
POST /exec   { action, params }        →  { status: 'ok', data }
                                       →  { status: 'error', code, message }
Auth: params.token
```

Bridge bilkul yahi contract local SQLite pe serve karta hai — **panel ki ek line change nahi ki**.
Isliye ek hi panel **do backend** pe chal sakta hai:

| Backend | URL | Internet |
|---|---|---|
| Local (default) | `/api/gas` (same origin) | ❌ nahi |
| Google Apps Script | `https://script.google.com/macros/s/<ID>/exec` | ✅ chahiye |

> Panel me **Connection Settings** hai — wahan `/exec` URL paste karne se wahi app cloud mode me chalti hai.

### Layer 3 — Panel (React, pehle se tha)

- `inventory-automation/app` — React 19 + Vite + react-query + lucide + recharts
- 11 screens: Dashboard, Inventory, Imports, Reports, Sources, Mapping, Rules, Alerts, Users, Activity, Settings
- Build: `npm run build:panel` (server folder se) → `server/public` me copy
- Server `public/` ko `/` pe serve karta hai, SPA deep links ke liye `index.html` fallback

---

## 3. Architecture (aaj)

```
Browser / (future) Electron / (future) Capacitor
            │
            │  POST /api/gas {action, params}
            ▼
   Node server (dist/index.js)  ──►  data/bulkrepair.db (SQLite, WAL)
            │
            └── public/ (built React panel)  →  GET /
```

Apps Script mode (pending packaging):

```
Windows/Android shell  ──►  https://script.google.com/macros/s/<ID>/exec
                                        │
                                        ▼
                              Google Sheets + Apps Script
```

---

## 4. Chalane ka tareeka

```powershell
cd C:\Users\MUKESH\.openclaw-autoclaw\workspace\inventory-automation\server

# pehli baar
npm install
npm run build
node dist\tools\create-user.js owner@shop.local "<StrongPassword>" OWNER

# roz
.\start-app.cmd          # ya: $env:DB_PATH="./data/bulkrepair.db"; $env:PORT=5050; node dist\index.js
```

- URL: **http://localhost:5050**
- Health: `GET /api/health` → `{"ok":true,"data":{"status":"ok","db":"connected","schemaVersion":3}}`
- Data file: `server\data\bulkrepair.db` (backup = is file ki copy)
- Logs: `server\data\server.out.log`, `server.err.log`
- Panel rebuild: `npm run build:panel` (panel build + copy)

**Port note:** `5000` is machine pe **GHM API** ne le rakha hai (`C:\ghm`, tsx server), isliye local app **5050** pe chalti hai. Conflict ho to `PORT` badal do.

**Credential note:** pehla owner account locally create hua tha. Repo me koi password commit nahi hai — production se pehle password rotate karna.

---

## 5. Verification evidence (jo actually chalaya gaya)

| Check | Result |
|---|---|
| `npm run build` (server) | exit 0 |
| `npm test` | **77 passed / 77**, 8 suites |
| `npm run build` (panel, tsc --noEmit + vite) | exit 0 |
| Live: `GET /` | 200, panel HTML + bundle |
| Live: bridge login | `status=ok`, role=OWNER, token 64 hex |
| Live: `inventory.save` via bridge | `ok`, mode=inserted |
| Live: `inventory.list` via bridge | legacy array shape, 11 headers |
| Live: dashboard | `inventoryCount` correct |
| Live: SPA deep link `/inventory` | 200 |
| Live: CSV/XLSX import | 2 rows → commit → rules applied (bucket 30-60, bin BIN-01) |
| Live: report groups | `30-60=1, Above 60=1` |
| Live: alert check | `1 devices at or above 60 days` |

**Bridge ke tests:** health, auth (login/whoami/wrong-password), dashboard shape, inventory save/list/filter/export, VIEWER forbidden, unsupported action ka explicit error.
**Import tests:** CSV base64, XLSX workbook, corrupt file → 400, explicit mapping, mapping without BARCODE → error.

---

## 6. Commit history (is kaam ka)

| Commit | Kya |
|---|---|
| `fdef3aa` | Phase 1 — server skeleton, SQLite, scrypt auth, inventory, audit, 30 tests |
| `bc4b673` | Phase 2 — sources/mapping/rules engine, imports + multi-source merge, reports, alerts, insights, users, 57 tests |
| `1fa64c5` | Excel/CSV file import endpoint (SheetJS), 60 tests |
| `0d4281b` | Panel bridge `/api/gas`, auth service extraction (shared lockout), 69 tests |
| `db7afb3` | Single-app runtime — panel server se serve, same-origin `/api/gas`, imports/config bridge, 77 tests |
| `2967c65` | `start-app.cmd` one-click launcher |

---

## 7. Decisions (aur kyun)

1. **Local-first banaya, Vercel pe nahi** — Vercel serverless me filesystem read-only + `/tmp` ephemeral hota hai, SQLite file persist nahi karti. Isliye backend local rakha. (Cloud chahiye to VPS/Railway with disk, ya Postgres migration.)
2. **Bridge, panel rewrite nahi** — panel 11 screens ka hai; bridge se zero frontend change me kaam ho gaya.
3. **Auth service extract** — REST aur bridge dono ek hi `authService.authenticate()` use karte hain, warna security rules do jagah drift ho jatin.
4. **`node:sqlite`** — koi native dependency nahi, single file DB, offline. Trade-off: Node experimental warning (functionality par asar nahi).
5. **`xlsx` sirf server pe** — browser me heavy parsing nahi, file base64 jaati hai.

---

## 8. Pending work (priority order)

### P0 — Apps Script packaging (user ki latest requirement)

1. User se **`/exec` deployment URL** lena (Apps Script → Deploy → Manage deployments → Web app).
   - Deployment: **Execute as: Me**, **Who has access: Anyone**.
2. Panel build me URL default karna: `VITE_API_URL=<exec-url>` (ya app ke andar Connection Settings se paste).
3. CORS: panel `text/plain` POST bhejta hai (preflight avoid) — Electron me main-process proxy, Capacitor me native HTTP se guarantee karna.
4. Note: Apps Script deployment **purana feature-set** dega (naye REST endpoints wahan nahi hain).

### P1 — Windows bundle

- Electron shell: `app/dist` load kare, single-instance, auto-update optional
- Installer: `electron-builder` → `.exe` (NSIS)
- Build yahan (Windows) possible hai

### P2 — Android bundle

- Capacitor: `npx cap add android`, `server.url` = panel, `allowNavigation` = Apps Script domain
- Signed `.apk` / `.aab` (keystore banana hoga)
- Build yahan possible (Android SDK installed)

### P3 — macOS / iOS

- **Mac chahiye** (Apple ka rule) + **Apple Developer account** (iOS install/App Store ke liye)
- Electron macOS build + Capacitor iOS build wahin se

### P4 — Bridge coverage gaps (agar local mode use karna ho)

Bridge me abhi `UNSUPPORTED` return karte hain (fake data nahi):
`telegram.test`, `email.test`, `backup.run`, `selftest.run`, `security.list/lock/unlock`,
`reports.save/delete`, `reports.templates.save/delete`, `alerts.check` (bridge),
`ai.command`, `import.sheets`, `import.tabs`, `import.fileToSource`, `multiSource.*`,
`sourceData.*`, `conflicts.*` (bridge), `settings` ke kuch keys.

> REST API me inme se kai maujood hain (`/api/conflicts`, `/api/imports/merge`, `/api/alerts/check`, templates, etc.) — bridge me wire karna baaki hai.

### P5 — QA

- Browser me screen-by-screen click test (HTTP level verified hai, UI clicks nahi)
- Data-heavy test: 5,000 rows import, pagination, CSV export

---

## 9. Known issues / gotchas

| Issue | Detail |
|---|---|
| Port 5000 busy | GHM API wahan chal rahi hai → local app 5050 |
| `node:sqlite` warning | "ExperimentalWarning" — normal, ignore |
| Mixed content | HTTPS page se `http://localhost` block hota hai; local mode ko tunnel/VPS chahiye |
| 5000-row cap | `import_files` staging limit (badhaya ja sakta hai) |
| Panel bundle ~780 KB | Recharts+React; gzip ~235 KB. Chhota chahiye to recharts hatao |
| Git me `public/` committed | Build output repo me hai taaki clone + start = working app; `npm run build:panel` se refresh |

---

## 10. Risks / cautions (jo ho chuka)

- **17 Oct:** `inventory-automation` folder cleanup script se delete ho gaya tha (uncommitted 14 files lost). Folder `2d74ccb` se restore kiya gaya. **Lesson:** kaam commit karke rakho, cleanup se pehle `git status` dekho.
- **Push ke bina delete mat karo** — `git status` me 136 deleted files dikh rahi thi, uncommit hone se remote safe raha.
- **Password repo me nahi** — CLI se local create, rotate before production.

---

## 11. Quick reference

### REST endpoints (selected)

```
GET    /api/health
POST   /api/auth/login | /api/auth/logout | /api/auth/change-password
GET    /api/auth/whoami
GET    /api/inventory            (page, pageSize, q, status, ageBucket, statusBucket, location, sort, dir)
POST   /api/inventory            (ADMIN/OWNER)
PUT    /api/inventory/:id        (ADMIN/OWNER)
DELETE /api/inventory/:id        (ADMIN/OWNER)
GET    /api/inventory/export.csv
POST   /api/imports/upload       (JSON rows)
POST   /api/imports/upload-file  (base64 xlsx/csv)
POST   /api/imports/:id/commit | /discard
POST   /api/imports/merge        (multi-source consolidation)
GET    /api/conflicts | POST /api/conflicts/clear
GET/POST/PUT/DELETE /api/sources, /api/sources/:id/mapping
GET/POST/PUT/DELETE /api/rules/age|status|location, /api/rules/priority
POST   /api/reports/run | GET /api/reports/export.csv | /api/reports/templates
GET/POST/PUT/DELETE /api/alerts | POST /api/alerts/check
GET    /api/dashboard | /api/quality | /api/trends
GET/POST/PUT /api/users
POST   /api/gas                  (panel bridge)
```

### Bridge actions (supported)

`health`, `auth.login/logout/whoami/changePassword/resetPassword`,
`dashboard`, `inventory.list/save/delete/export`, `trends.list`,
`sources.list/types/save`, `mapping.list/save/headers`,
`rules.age/status/location.list/save`, `alerts.list/save/delete`,
`reports.list/generate`, `users.save`, `auth.users`,
`activity.list`, `history.list`, `errors.list`, `quality.summary`,
`settings.get/save`, `import.fileB64`, `import.previewPage`, `import.commit`, `import.discard`

---

## 12. Agla kadam (jahan se shuru karna hai)

1. User se **Apps Script `/exec` URL** lo.
2. `VITE_API_URL` set karke panel build karo → `server/public` (ya Electron/Capacitor assets).
3. Electron shell + `electron-builder` → Windows `.exe`.
4. Capacitor shell → Android `.apk`.
5. Dono me error states: internet nahi hai to "Backend unreachable" (silent fail nahi).
6. macOS/iOS: Mac + Apple account ke baad.

**Koi bhi confusion ho to:** `inventory-automation/server/README.md` (API/run), aur ye document — dono mila ke poora context cover ho jata hai.
