# Bulk Repair — Complete User Guide (Hinglish)

**Version 1.0.1** · Portal + Desktop (Windows/macOS) + Android

Ye guide app ke **har tab, har button aur har field** ko explain karta hai — kaam kya hai, kaun use karega, step-by-step kya karna hai, aur kis condition me kya hoga.

> **Legend:** ✅ Local mode + Apps Script mode dono me available · ⚠️ Sirf Apps Script (Google Sheets) mode me · 🖥️ Sirf desktop app me

---

## 1. Ye guide kaise use karein

| Aap kya kar rahe ho | Kahan padho |
|---|---|
| Pehli baar install/setup | Section 3 → 4 → 5 |
| Roz ka kaam (stock, import, labels) | 6.2, 6.3, 6.6, 6.13 |
| Reports/management | 6.8 – 6.12, 6.15 |
| Admin kaam (users, security) | 6.17 – 6.26 |
| Barcode scanner lagana | Section 7 |
| Kuch kaam nahi kar raha | Section 10 aur 11 |
| Naya kya hai 1.0.1 me | Section 15 |

---

## 2. App kya hai — modes aur components

Bulk Repair ek **warehouse / repair inventory system** hai:

- Devices ka master data (barcode, model, brand, status, age, location, priority)
- Excel/CSV/PDF se bulk import + rollback
- Rules engine se auto-classification (age, status, location)
- Dashboard, reports, labels, alerts
- Vendors aur purchase orders (receiving se stock update)
- Users, roles, sessions, audit, 2FA

### 2.1 Do data modes

| | **Local** | **Apps Script** |
|---|---|---|
| Data kahan | `bulkrepair.db` (SQLite) | Google Sheet |
| Internet | Nahi chahiye | Chahiye |
| Speed | Fast | Network pe depend |
| Multisource merge | ✅ file-based | ✅ sheet-based |
| Google Sheet se direct import | ❌ | ✅ |
| Sheet security (lock/unlock) | ❌ | ✅ |
| Baaki sab tabs | ✅ | ✅ |

### 2.2 Components

| Component | Kya hai | Data kahan |
|---|---|---|
| **Portal** (web) | Browser me poora UI | Backend se |
| **Desktop app** | Windows/macOS app; **server khud start karta hai** | App data folder |
| **Android APK** | Mobile UI + camera scan | External backend |
| **Server** | Node.js + Express + SQLite | `data/bulkrepair.db` |
| **GAS backend** | Apps Script + Sheets | Google Sheet |

### 2.3 Desktop data location

| OS | Database | Backups | Logs |
|---|---|---|---|
| macOS | `~/Library/Application Support/Bulk Repair/data/bulkrepair.db` | `.../data/backups/` | `.../logs/server.log` |
| Windows | `%APPDATA%\Bulk Repair\data\bulkrepair.db` | `...\data\backups\` | `...\logs\server.log` |

---

## 3. Install aur first run

### 3.1 Desktop app (sabse easy)

1. `dist-builds/` se apna installer lo:
   - Windows x64: `BulkRepair-1.0.1-windows-x64-portable.exe`
   - Windows ARM: `BulkRepair-1.0.1-windows-arm64-portable.exe`
   - macOS: `BulkRepair-1.0.1-macos-arm64.zip`
2. **Windows:** exe double-click → SmartScreen aaye to **More info → Run anyway**
3. **macOS:** zip unzip → `Bulk Repair.app` ko Applications me drag → pehli baar **right-click → Open**
4. App khulte hi andar server start hota hai (port 5050, busy ho to 5051…)
5. Setup wizard → owner account → Dashboard

> Desktop me alag se Node/npm/server install karne ki zarurat **nahi**.

### 3.2 Server + portal (browser)

```bash
cd inventory-automation/server
npm install
npm run dev
```

- URL: `http://localhost:5050`
- Port `.env` se aata hai
- Pehli baar DB khud banti hai

Production:

```bash
npm run build:panel   # portal build + copy
npm run build
npm start
```

### 3.3 Android APK

```bash
adb install -r BulkRepair-1.0.1-android-debug.apk
```

- USB: `adb reverse tcp:5050 tcp:5050` → app me `http://localhost:5050`
- Wi-Fi: `http://<computer-ka-LAN-IP>:5050`
- Backend kisi aur machine/VPS pe ho to wahi URL do

APK ke saath **camera scan** chalta hai; desktop pe hardware scanner.

### 3.4 Docker

```bash
cd inventory-automation
docker compose up --build
```

- URL: `http://localhost:5000`
- Data `/data` volume me rehta hai

---

## 4. First-time setup — step by step

### Step 1 — Backend choose karo

| Option | Kab chuno |
|---|---|
| **This computer (offline)** | Data local chahiye, internet nahi |
| **Google Apps Script / Google Sheets** | Data Sheet me, phone se kahin se access |

- Local choose kiya: **Server URL blank** chhod do (desktop ka embedded server khud use hoga)
- External backend: `http://192.168.1.10:5050` ya `https://your-domain.com`
- GAS choose kiya: deployment ka `/exec` URL daalo → **Test connection**

**Test connection ke results:**

| Result | Matlab |
|---|---|
| Connected ✅ | URL sahi, backend chal raha hai |
| Not reachable ❌ | URL galat, server band, ya firewall |

### Step 2 — Google Sheet (optional)

Sirf quick-access link save hota hai. Local mode me skip.

### Step 3 — Owner account

| Field | Rule |
|---|---|
| Email | Valid email |
| Password | **10+ characters**, letters + numbers dono |
| Confirm | Same password |

**Finish setup** → pehla account `OWNER` role ke saath banta hai.

**Conditions:**

| Situation | Kya hoga |
|---|---|
| Pehla account | Owner create hoga |
| Pehle se users hain | Bootstrap fail → wahi email/password se **login fallback** |
| Password weak | Inline error, aage nahi badhega |
| Email invalid | Inline error |

---

## 5. Login, roles aur navigation

### 5.1 Login

- Email + password
- 2FA on hai to 6-digit code (ya recovery code)
- **Keep me signed in**
- 5 galat attempts → **15 minute lock**
- Password bhool gaye → admin se reset karwao

### 5.2 Roles

| Role | Kya kar sakta hai |
|---|---|
| **VIEWER** | Sab dekh sakta hai, kuch badal nahi sakta |
| **OPERATOR** | Inventory edit, imports, labels, scanner, AI commands |
| **MANAGER** | + reports, schedules, purchasing, activity/history |
| **ADMIN** | + users, security, settings, email config, system health |
| **OWNER** | Sab kuch |

### 5.3 Sidebar — 28 tabs

| Group | Tabs |
|---|---|
| **Overview** | Dashboard |
| **Operations** | Data Sources, Import Data, Multisource, Field Mapping, Inventory, Rules, Reports, Report Templates, Report Builder, Alerts, Ageing Trends, Labels, Schedules, Exports, Purchasing |
| **Administration** | Users & Roles, Security, Sessions & Audit, Activity Log, Processing, Processing History, Data Quality, System Health, Email Settings, Settings |
| **Tools** | AI Command Center, Help |

Sidebar ke bottom me **language** (English / हिन्दी / ગુજરાતી) aur **Collapse** button hai.

### 5.4 Collapse behaviour

- Collapse karne pe sidebar **76px** ho jaata hai
- Sirf icons dikhte hain, hover pe tooltip
- Language selector hide ho jaata hai
- Expand pe sab wapas

### 5.5 Common login conditions

| Condition | Result |
|---|---|
| Account inactive | Login block; purane sessions bhi revoke |
| Session revoke hua | Agli request pe login page |
| Role change hua | Agli request se naya role |
| Backend band | "Not connected" error |
| 2FA code galat | `Invalid authenticator code` + attempt count |

---

## 6. Har tab ka detailed guide

Har tab ke liye: **kaam**, **kaun**, **page pe kya hai**, **steps**, **conditions**, **galtiyan**.

### 6.1 Dashboard

**Kaam:** ek nazar me poora inventory status.

**Kaun:** sab roles.

**Page pe kya hai:**

| Block | Kya dikhata hai |
|---|---|
| 4 KPI cards | Inventory items, Active sources, Active reports, Recent errors |
| By status | Status distribution (bar) |
| By age bucket | Age buckets (donut) |
| By status bucket | Bucket distribution (bar) |
| Top brands | Top 5 brands (bar) |
| Ageing trend | Daily line chart |
| Recent runs | Latest import/process jobs |
| Recent errors | Last errors (barcode, field, message) |

**Steps:**

1. Page kholo — data khud load hota hai
2. **Refresh** — latest data
3. **Run daily process** (OPERATOR+) — rules dobara apply + trend snapshot

**Conditions:**

| Condition | Result |
|---|---|
| Inventory empty | Charts "No data yet" |
| Daily process nahi chala | Trend empty |
| Errors hain | Recent errors count red |
| Backend down | Error panel + Retry |

**Tips:** Subah sabse pehle errors aur ageing dekho. Charts empty ho to pehle import karo, phir process chalao.

---

### 6.2 Data Sources

**Kaam:** batana ki data kahan se aayega.

**Kaun:** ADMIN (view sab kar sakte hain).

**Page pe kya hai:** sources ka table (name, role, type, sheet, join key, active) + New source.

**Steps:**

1. **New source**
2. Name: `Daily QC`
3. Role: `PRIMARY` (main data) ya `JOIN` (extra data)
4. Type: free text (`Google Sheet`, `QC`, `TRC`, `Inventory`, `Location`)
5. Sheet name: `Sheet1`
6. Sheet ID: external sheet ho to
7. Join key: `barcode`
8. Join fields: `STOCK_AGE,LOCATION`
9. Active ON → **Save**

**Conditions:**

| Condition | Result |
|---|---|
| Name duplicate | Save fail (`already exists`) |
| Active OFF | Pipeline us source ko skip karega |
| Delete | Mapping bhi delete; inventory safe |
| Vendor/PO wala source? | Koi lena-dena nahi |

**Tips:** Type me `QC` likhne se system source type `QC_STOCK` infer karta hai — merge/priority ke liye zaroori.

---

### 6.3 Import Data (Universal import) ✅

**Kaam:** file se bulk data laana.

**Kaun:** OPERATOR+ (view sab).

**Supported files:** CSV, TSV, TXT, XLS, XLSX, PDF · max **15 MB / 50,000 rows**.

**Step-by-step:**

1. **Import Data** tab
2. **Choose file**
3. Columns auto-detect hote hain — mapping check karo
4. `BARCODE` required hai
5. **Validate** — errors preview
6. **Import now**
7. Result card: processed / valid / imported / failed / skipped
8. Galti ho to **Roll back import**

**Conditions:**

| Condition | Result |
|---|---|
| Barcode column missing | Validate fail |
| Duplicate barcode | Existing row **update** hota hai |
| Empty incoming value | Purani value preserve hoti hai |
| File bada | Upload reject |
| Partial errors | Job `PARTIAL_FAILURE`, baaki rows import |
| Rollback | Naye barcodes delete, purane restore |
| Dobara rollback | `already rolled back` error |

**Tips:** Pehle 10–20 rows ki test file se mapping verify karo. Age numeric rakho.

---

### 6.4 Multisource ✅

**Kaam:** QC + TRC + Inventory + Location ko **barcode pe merge** karna.

**Kaun:** OPERATOR+.

**Local mode:**

1. Har source ke liye ek file choose karo
2. **Validate files** — stage + auto mapping
3. **Import all sources**
4. Result: devices, inserted, updated, conflicts
5. **Roll back import** available

**Apps Script mode:** sheet names/IDs do → validate → import.

**Conditions:**

| Condition | Result |
|---|---|
| Same barcode, same field, different value | Conflict record |
| Conflict winner | Priority rules decide |
| Barcode missing | Row reject |
| Merge ke baad | Inventory upsert, movement history banti hai |

---

### 6.5 Field Mapping

**Kaam:** source column ko system field se jodna.

**Kaun:** ADMIN.

**Steps:**

1. Source choose karo
2. Har row: source column → target field
3. Required checkbox
4. Output order
5. Active
6. **Save mapping**

**Common target fields:** `BARCODE`, `MODEL`, `BRAND`, `STATUS`, `STOCK_AGE`, `LOCATION`, `PRIORITY`, `BIN_BUCKET`.

**Conditions:**

| Condition | Result |
|---|---|
| `BARCODE` mapped nahi | Import fail |
| Ek column do targets | Last wala jeetega — avoid karo |
| Empty target | Column ignore |
| Mapping save | Agla import naye mapping se chalega |

---

### 6.6 Inventory

**Kaam:** master data dekhna aur edit karna.

**Kaun:** view sab; edit OPERATOR+.

**Toolbar:** Search, Bulk edit, Scan/Scanner ready, filters (Status, Age, Brand, Category, Priority, Bin, Source), Clear, Views, Columns, Export, Add row.

**Saved views:**

1. Filters set karo
2. **Views → Save current view…**
3. Naam do → Save
4. Dobara use: Views → naam
5. Delete: X

Search/filters/page size **automatic save** hote hain.

**Columns:** hide/show; `BARCODE` lock.

**Row drawer:** saare fields + **History** timeline (Added/Removed/field old→new) + Edit/Delete.

**Add/Edit conditions:**

| Field | Rule |
|---|---|
| BARCODE | Required, unique, edit me change nahi |
| STOCK_AGE | Days (number) |
| AGE_BUCKET / PRIORITY / STATUS_BUCKET | Rules se auto; blank chhod do |
| LOCATION / BIN_BUCKET | Rack/shelf |

**Bulk edit:** rows select → status/location/bin/priority → apply. Sirf selected fields badalte hain; audit log entry banti hai.

**Delete:** permanent; history me `Removed` record.

**Desktop scanner:** page pe kahin bhi scan karo → search fill + toast.

---

### 6.7 Rules

**Kaam:** age/status/location se auto buckets aur priority.

**Kaun:** ADMIN.

**Teen tabs:**

| Tab | Fields | Example |
|---|---|---|
| **Age buckets** | Min age, Max age, Bucket, Priority | 0–29 → Below 30 → P3 |
| **Status buckets** | Raw status, Bucket, Marking | `QC Fail` → `QC_FAIL` |
| **Location rules** | Pattern, Bin bucket, Condition | `SW*` → Shelf A |

**Steps:**

1. Tab kholo
2. **Add row**
3. Values bharo
4. **Save**
5. **Processing → Run daily process**

**Conditions:**

| Condition | Result |
|---|---|
| Rule overlap | Pehla match jeetta hai |
| Save ke baad | Agle process run pe apply |
| Match nahi mila | Field khali rehta hai |
| Priority rule (GAS) | Merge winner decide karta hai |

**Tips:** Age ranges continuous rakho (0–29, 30–59, 60–74, 75+).

---

### 6.8 Reports

**Kaam:** grouped counts aur exports.

**Kaun:** MANAGER+ (VIEWER dekh sakta hai).

**Group by:** status, brand, age_bucket, status_bucket, location, bin_bucket, model.

**Filters:** status, brand, age bucket, status bucket, location.

**Steps:**

1. Group by choose karo
2. Filters lagao
3. **Run**
4. Export: **CSV**, **Excel**, **PDF**

**Conditions:**

| Condition | Result |
|---|---|
| Data empty | 0 rows report |
| Filter galat | Empty result |
| Export | File download |
| Export all to sheets ⚠️ | Sirf GAS |

---

### 6.9 Report Templates

**Kaam:** reusable report formats save karna.

**Kaun:** ADMIN (view MANAGER+).

**Page:** **Reports** page ka focused templates mode.

**Fields:**

| Field | Matlab |
|---|---|
| Name | Template ka naam |
| Config JSON | Group by + filters JSON |
| Active | ON/OFF |

**Steps:**

1. **New template**
2. Name + Config JSON
3. Save
4. Edit/Delete row actions

**Conditions:** Invalid JSON → save reject. Local mode supported.

---

### 6.10 Report Builder

**Kaam:** naya report definition banana (saved reports list ke saath).

**Kaun:** MANAGER+.

**Steps:**

1. **New report**
2. Naam
3. Filter field (`BRAND`) + value (`Apple`)
4. Report columns (`STATUS,AGE_BUCKET`)
5. Save
6. Row pe **Generate** / Edit / Delete

**Conditions:** naam duplicate → update ho jaata hai. Empty columns → default.

---

### 6.11 Alerts

**Kaam:** threshold alerts banana aur test karna.

**Kaun:** ADMIN (view sab).

**Alert types:**

| Type | Matlab |
|---|---|
| `AGE_OVER` | Itne din se purana stock |
| `STATUS_BUCKET_COUNT` | Bucket count threshold |
| `MISSING_FIELD` | Field missing |

**Fields:** Name, Filter field, Filter value, Operator, Threshold, Email to, Telegram, Active.

**Steps:**

1. **New alert**
2. Values bharo (`e.g. 50`)
3. Save
4. **Check now** — triggered list
5. Email/WhatsApp test buttons

**Conditions:**

| Condition | Result |
|---|---|
| SMTP missing | Test fail with clear message |
| Threshold cross | Alert triggered + `last_fired_at` update |
| Active OFF | Skip |

---

### 6.12 Ageing Trends

**Kaam:** daily ageing trend aur current buckets.

**Kaun:** sab.

**Page pe:** line chart (date + buckets) + current age bucket table.

**Conditions:** Daily process nahi chala → "No trend data yet". Inventory empty → table empty.

---

### 6.13 Labels

**Kaam:** barcode labels print karna.

**Kaun:** OPERATOR+.

**Settings:** count (1–200), size (50×25 / 38×25 / 60×30 mm), columns (2/3/4), barcode height, fields (barcode text, brand+model, location+bin).

**Steps:**

1. Settings set karo
2. **Print**
3. Print dialog: margins **None**, scale **100%**, background ON

**Conditions:** Barcode missing → blank label. Cut ho raha hai → height kam / size bada.

---

### 6.14 Schedules

**Kaam:** recurring PDF/XLSX reports email karna.

**Kaun:** MANAGER+ view; ADMIN create.

**Fields:** Name, Group by, Frequency (Daily/Weekly/Monthly), Format (PDF/XLSX), Recipients, filters, Active.

**Steps:**

1. **New schedule**
2. Values bharo
3. Save
4. **Run** — turant send
5. Edit/Delete

**Conditions:**

| Condition | Result |
|---|---|
| SMTP missing | Run fail (clear error) |
| Due schedule | Server har 30 min check karta hai |
| Restart | `last_run_at` se duplicate nahi |
| Multiple recipients | Comma-separated |

---

### 6.15 Exports

**Kaam:** grouped reports ya poora inventory download karna.

**Kaun:** sab.

**Page pe:** group-by select + **CSV / Excel / PDF** buttons + **Inventory CSV**.

**Conditions:** Empty group → empty file. Backend auth fail → error toast.

---

### 6.16 Purchasing

**Kaun:** MANAGER+.

**Vendors tab:** name, contact, email, phone, address, notes, active. Delete tabhi jab PO na ho.

**Purchase orders tab:** PO number, vendor, status, lines, ordered, received, expected.

**Steps (PO):**

1. **New purchase order**
2. Vendor + status (Draft/Ordered) + expected date + notes
3. Lines: barcode (optional), model, brand, qty, unit cost
4. Save → PO number auto `PO-YYYYMMDD-001`
5. **Receive** → quantities → **Receive stock**

**Conditions:**

| Condition | Result |
|---|---|
| Over-receive | Reject with remaining qty |
| Barcode wali line | Inventory me `IN_STOCK` |
| Sab receive | Status `RECEIVED` |
| Partial | `PARTIAL` |
| Received order edit/cancel | Block |
| Vendor delete with PO | Block |

---

### 6.17 Users & Roles

**Kaun:** ADMIN.

**Table:** email, role, active, password set?, locked until, last login.

**New user:** email + role + password (10+ letters/numbers).

**Edit:** role change; active OFF → login block + sessions revoke; apna role change nahi.

**Reset password:** naya password; us user ke sab sessions revoke.

**Conditions:**

| Condition | Result |
|---|---|
| Weak password | Reject |
| Email duplicate | Update existing |
| Active OFF | Login block |
| Locked account | 15 min wait / admin unlock |

---

### 6.18 Security

**Kaam:** 2FA status, password policy, active sessions.

**Kaun:** ADMIN.

**Page pe:**

| Card | Kya |
|---|---|
| Two-factor authentication | Enabled/off + recovery codes left + Settings link |
| Password policy | 10+ chars, letters+numbers, lockout rule |
| Active sessions | user, role, signed in, last seen, **Sign out** |

**Conditions:** 2FA reset admin se; session revoke → token dead.

---

### 6.19 Sessions & Audit

**Kaun:** ADMIN.

**Active sessions:** per-session sign out, per-user **All**.

**Login history:** last 100 events (OK / FAILED / LOCKED / BLOCKED / LOGOUT) + IP.

**Kab dekhna:** roz shaam, employee exit, suspicious logins.

---

### 6.20 Activity Log

**Kaam:** har action ka audit trail.

**Kaun:** MANAGER+.

**Page:** activity table (time, actor, action, entity, details).

**Conditions:** Actions: login, inventory changes, imports, PO, settings, user changes.

---

### 6.21 Processing

**Kaam:** daily rules pipeline trigger karna.

**Kaun:** OPERATOR+.

**Steps:** **Run daily process** → confirm → rules apply + trend snapshot + alerts check.

**Conditions:** Data empty → process chalega par counts 0. Error → toast.

---

### 6.22 Processing History

**Kaam:** import/process jobs ka record.

**Kaun:** MANAGER+.

**Page:** runs table (file, kind, status, rows, created).

**Conditions:** Status: COMPLETE / PARTIAL_FAILURE / UPLOADED / DISCARDED.

---

### 6.23 Data Quality

**Kaam:** missing fields / errors ka overview.

**Kaun:** MANAGER+.

**Page:** quality summary + errors by source.

**Conditions:** Score missing fields ke ratio se. Naya import → refresh.

---

### 6.24 System Health

**Kaam:** backend status + self-test.

**Kaun:** ADMIN.

**Page:** health JSON + checks table:

| Check | Kya |
|---|---|
| Database connection | SQLite online |
| User accounts | count |
| Inventory table | count |
| Email configuration | SMTP host set? |
| Automatic backups | every 6h, 7 kept |

**Conditions:** FAIL check → detail me reason.

---

### 6.25 Email Settings

**Kaam:** SMTP configure karna (alerts + scheduled reports).

**Kaun:** ADMIN.

**Fields:** SMTP host, port, user, password, from, alert recipients.

**Steps:**

1. Values bharo (`smtp.gmail.com`, `587`, app password)
2. **Save**
3. **Send test**

**Conditions:**

| Condition | Result |
|---|---|
| Host/user galat | Test fail with error |
| Gmail | App password chahiye |
| Save | Turant apply |

---

### 6.26 Settings

**Kaun:** ADMIN.

**Sections:**

| Section | Keys |
|---|---|
| System settings | Telegram, backup, SMTP, WhatsApp, Google, LLM |
| Notification tests | Email / WhatsApp |
| Connection | API URL, Sheet URL |
| Two-factor authentication | Enable/disable + recovery codes |
| Barcode scanner | Mode, min length, terminator, test, serial connect |
| Change password | Current + new (10+ letters/numbers) |

**Conditions:** Secret fields masked; save ke baad test karo.

---

### 6.27 AI Command Center

**Kaun:** OPERATOR+.

**Commands (English/Hindi):**

- `List Apple devices older than 75 days`
- `How many devices are in Bin Storage?`
- `Show today's inventory summary`

**Kaise chalta hai:** command → filters parse → inventory query → result.

**Conditions:**

| Condition | Result |
|---|---|
| LLM configured | Smarter parsing |
| LLM fail | Rules parser fallback |
| Kuch samajh nahi aaya | `success: false` message |

---

### 6.28 Help

**Kaun:** sab.

**Page pe:** getting started, barcode scanners, backups, troubleshooting, documentation link.

---

## 7. Hardware barcode scanners (desktop)

Desktop (Windows/macOS) pe camera scan nahi — **hardware scanner** support hai.

### 7.1 USB HID scanner (99% scanners)

- Scanner **keyboard ki tarah** kaam karta hai — **driver install nahi karna**
- App fast keystrokes detect karta hai (average ≤45ms per character)
- Enter/Tab terminator pe search fill hota hai
- Inventory page pe **kahin bhi** scan karo
- Toolbar me **Scanner ready** badge dikhta hai

### 7.2 Serial / COM scanner

1. Scanner ko serial mode me set karo (vendor manual)
2. **Settings → Barcode scanner → Connect serial scanner**
3. Port select karo (default 9600 baud)
4. Scan karke test karo

### 7.3 Scanner settings

| Setting | Matlab | Default |
|---|---|---|
| Mode | Hardware / Camera | Hardware |
| Minimum code length | Chhoti typing ignore | 6 |
| Terminator | Enter / Tab / None | Enter |
| Test scanner | Live test field | — |

### 7.4 Conditions

| Condition | Result |
|---|---|
| Normal typing | Ignore (speed check) |
| Modal/drawer open | Scan ignore |
| Code < min length | Ignore |
| Scanner sends no terminator | Detect nahi hoga — Terminator setting badlo |
| Mobile app | Camera scan available |

---

## 8. Daily / weekly workflow

### Subah

1. **Dashboard** — errors, ageing, counts
2. **Sessions & Audit** — failed logins (admin)

### Naya stock

1. **Import Data** → file → Validate → Import
2. Errors check karo
3. **Labels** print
4. **Processing → Run daily process** (buckets refresh)

### Device movement

1. **Inventory** → scan/search
2. Row → Edit → location/status
3. History me change confirm

### Bulk update

1. Rows select → **Bulk edit**
2. Fields choose → apply

### Order

1. **Purchasing** → New PO → Save
2. Receive hone pe **Receive** → inventory update

### Shaam / weekly

1. **Reports** → PDF/XLSX
2. **Schedules** me weekly report
3. **Data Quality** + **Processing History** review
4. **Sessions & Audit** check
5. Backup verify

---

## 9. Backup, restore aur rollback

### 9.1 Automatic backup

- Server boot pe + har **6 ghante**
- Latest **7** copies
- Location: DB folder ke andar `data/backups/`

### 9.2 Manual backup

- Desktop: `data` folder copy karo
- Server: `server/data/bulkrepair.db` copy karo

### 9.3 Restore

1. Server/app band karo
2. `bulkrepair.db` rename karo
3. Backup file ko `bulkrepair.db` naam se copy karo
4. Start karo

### 9.4 Import rollback

- Sirf **committed** job ka
- Naye barcodes delete, purane restore
- Dobara rollback nahi
- Dry run ka rollback nahi

---

## 10. Condition cookbook — "agar aisa ho to kya hoga"

| Condition | Result |
|---|---|
| Duplicate barcode import | Existing row update |
| Barcode missing | Row reject |
| Age text me | Rule match nahi, bucket khali |
| 50k+ rows | Upload reject |
| Import ke baad galti | Rollback (ek baar) |
| Rollback dobara | `already rolled back` |
| Vendor ke paas PO | Delete block |
| PO se zyada receive | Reject + remaining |
| Received PO cancel | Block |
| SMTP missing | Email test/schedule fail |
| WhatsApp token missing | Test fail |
| Camera permission denied | Scanner error (mobile) |
| 2FA phone kho gaya | Recovery code / admin reset |
| Password bhool gaya | Admin reset |
| User inactive | Login + sessions block |
| Role change | Agli request se naya role |
| Backend band | Error panel |
| Port busy (desktop) | Agla free port (5051…) |
| DB delete | Backup se restore |
| Multi-source local | File-based merge |
| Sheet security local | Hidden (GAS only) |

---

## 11. Troubleshooting

| Problem | Solution |
|---|---|
| Page nahi khul raha | `http://localhost:5050/api/health` check |
| API error | Setup/Connection me URL; desktop pe default |
| Android connect nahi | Wi-Fi same, `adb reverse tcp:5050 tcp:5050` |
| Login fail | Caps Lock, 10+ policy, admin reset |
| Account locked | 15 min wait |
| 2FA code galat | Phone time auto; recovery code |
| 2FA reset | Admin reset |
| Email nahi ja raha | SMTP host/from/pass → test |
| WhatsApp nahi | Token, phone ID, country code |
| Import fail | Barcode column, size, errors preview |
| Rollback nahi dikh raha | Committed job hi rollback hota hai |
| Charts khali | Inventory empty / process nahi chala |
| Scanner kaam nahi | Terminator setting, min length, focus |
| Serial scanner nahi | Port/baud check, desktop app use karo |
| Print bigad raha | Margins None, scale 100% |
| Nav double highlight | 1.0.1 update karo (fix included) |
| Windows SmartScreen | More info → Run anyway |
| macOS "unverified" | Right-click → Open |

---

## 12. Security checklist

- [ ] Owner password strong (10+, letters+numbers)
- [ ] 2FA enable
- [ ] Extra users deactivate
- [ ] Har hafte sessions/audit check
- [ ] Backups safe location
- [ ] Public internet ho to HTTPS reverse proxy
- [ ] SMTP/LLM keys rotate
- [ ] Employee exit pe sessions revoke

---

## 13. Useful commands

```bash
# server dev
cd server && npm run dev

# build
cd server && npm run build

# tests
cd server && npm test

# panel rebuild
cd server && npm run build:panel

# admin user
cd server && npm run create-user -- owner@example.com 'StrongPass123' ADMIN

# Docker
docker compose up --build

# Android APK
cd mobile/android && ./gradlew assembleDebug

# Desktop packages
cd desktop && npm run dist:mac
cd desktop && npm run dist:win:x64
cd desktop && npm run dist:win:arm64
```

---

## 14. FAQ aur glossary

### FAQ

**Data kahan?** Local: `bulkrepair.db`. GAS: Google Sheet.

**Internet?** Local me nahi; GAS me haan.

**Multi-warehouse?** Abhi single global inventory.

**Hindi/Gujarati?** Sidebar bottom selector; default English.

**Data delete?** Backup restore / import rollback.

**Kitne devices?** Unlimited; sessions page se revoke.

**Scanner driver?** USB HID ko nahi chahiye; serial ke liye OS driver.

### Glossary

| Term | Matlab |
|---|---|
| Barcode | Device ka unique ID |
| Bucket | Category (age/status/location) |
| Priority | P1/P2/P3 urgency |
| Source | Data ka origin |
| Mapping | Column → field |
| Staging | Import ka temporary area |
| Job | Ek import/process run |
| Conflict | Do sources ki alag value |
| Rollback | Committed import undo |
| Bin bucket | Shelf/cage group |
| Session | Login token |
| 2FA | Authenticator code |

---

## 15. 1.0.1 me kya naya hai

| Area | Change |
|---|---|
| Sidebar | Legacy ke saare **28 tabs** |
| Naye pages | Ageing Trends, Processing, Exports, Email Settings, Security, System Health, Help |
| Focused pages | Report Templates, Report Builder, Multisource, Activity Log, Processing History, Data Quality |
| Nav fix | Parent/child route double highlight fix |
| Build | Har platform ke liye panel copy guaranteed |
| Scanners | Hardware HID + serial support (desktop) |
| UI | Full light theme, #0078FF, 4px gutters, 6px cards, thin typography |
| Forms | Har field me example/placeholder |
| Docs | Ye guide + PDF |

---

**End of guide.** Koi cheez samajh nahi aayi ho ya screen match na kare to app ka screenshot bhejo — main us hisse ko update kar dunga.
