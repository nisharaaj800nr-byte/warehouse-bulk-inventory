# Bulk Repair — Complete User Guide (Hinglish)

Ye guide app ke **har tab aur har screen** ko detail me explain karta hai: kaun use kar sakta hai, kya fields hain, step-by-step kya karna hai, aur kahan galti hoti hai.

> **Legend:** ✅ = Local mode aur Apps Script mode dono me kaam karta hai. ⚠️ = sirf Apps Script / Google Sheets mode me available hai.

---

## 1. Is guide ko kaise use karein

- Pehli baar app chala rahe ho? Section 3 → 4 → 5 padho.
- Roz ka kaam karna hai? Section 7 (Inventory), 8 (Imports), 10 (Reports) kaafi hai.
- Admin ho? Section 17, 18, 19 zaroor padho.
- Kuch kaam nahi kar raha? Section 23 (Troubleshooting) dekho.

---

## 2. App kya karta hai

Bulk Repair ek repair/warehouse inventory system hai:

- Devices ka master data (barcode, model, brand, status, age, location, priority)
- Excel/CSV/PDF se bulk import aur rollback
- Multiple sources ka merge (Apps Script mode)
- Rules engine: age/status/location se auto bucket + priority
- Dashboard, ageing trend, reports (CSV/XLSX/PDF)
- Barcode labels printing
- Threshold alerts (email/WhatsApp)
- Vendors aur purchase orders, receiving se stock update
- Users, roles, sessions, audit log, 2FA

**Do modes:**

| Mode | Data kahan | Kab use karein |
|---|---|---|
| Local (offline) | `server/data/bulkrepair.db` (SQLite) | Single office/warehouse, fast, no internet |
| Apps Script | Google Sheets | Phone se kahin se access, Google ecosystem |

Kuch advanced tabs sirf Apps Script mode me kaam karte hain — unpe ⚠️ mark hai. Local mode me Sources, Mapping, Priority rules, Report templates, Conflicts, Alerts checks, Reports definitions, Source data, Selftest aur file-based Multi-source merge sab supported hain. Sirf Google Sheets-specific cheezein (Sheet se direct import, Sheet security, Telegram test) Apps Script mode me rehti hain.

---

## 3. Install aur start

### 3.1 Zaroorat

- Node.js 22+
- npm 10+
- Browser (Chrome/Edge/Safari)
- Android build ke liye: Android SDK + Java 21

### 3.2 Server + portal (local mode)

```bash
cd inventory-automation/server
npm install
npm run dev
```

- `npm run dev` = TypeScript build + server start
- URL: **http://localhost:5050** (port `server/.env` se)
- Pehli baar `server/data/bulkrepair.db` khud banta hai
- Migrations automatic chalti hain

### 3.3 Production build

```bash
cd inventory-automation/server
npm install
npm run build:panel   # portal build + server/public me copy
npm run build         # server build
npm start
```

### 3.4 Docker

```bash
cd inventory-automation
docker compose up --build
```

- App: `http://localhost:5000`
- Data `/data` volume me

### 3.5 Desktop app

`dist-builds/` me:

- macOS: `BulkRepair-1.0.0-macos-arm64.zip`
- Windows x64: `BulkRepair-1.0.0-windows-x64-portable.exe`

Desktop sirf UI hai. Backend alag chalana hoga, phir **Setup → Connection** me URL:

- Same machine: `http://localhost:5050`
- Dusre system se: `http://<server-ip>:5050`

### 3.6 Android APK

```bash
adb install -r BulkRepair-1.0.0-android-debug.apk
```

- USB: `adb reverse tcp:5050 tcp:5050` → app me `http://localhost:5050`
- Wi-Fi: `http://<Mac-ka-LAN-IP>:5050`

---

## 4. First-time setup (3 steps)

### Step 1 — Backend choose karo

| Option | Kab |
|---|---|
| **This computer (offline)** | Local SQLite, no internet |
| **Google Apps Script / Google Sheets** | Data sheet me, phone se access |

Apps Script choose kiya to `/exec` URL daalo → **Test connection**.

### Step 2 — Google Sheet link (optional)

Sirf quick-access ke liye save hota hai. Local mode me skip kar sakte ho.

### Step 3 — Owner account

- Email
- Password: **10+ characters**, letters + numbers dono
- Confirm password
- **Finish setup**

Ye account `OWNER` banega — sab permissions.

---

## 5. Login, roles aur navigation

### 5.1 Login

- Email + password
- 2FA on hai to 6-digit code
- 5 galat attempts → 15 minute lock
- "Keep me signed in" = 30 din wala session

### 5.2 Roles

| Role | Access |
|---|---|
| **VIEWER** | Read-only: dashboard, inventory, reports dekh sakta hai |
| **OPERATOR** | Inventory add/edit, imports, labels, scan, AI commands |
| **MANAGER** | + reports, scheduled reports, purchasing, conflicts clear |
| **ADMIN** | + users, settings, sessions, vendors, 2FA reset |
| **OWNER** | Sab kuch |

Sidebar options role ke hisaab se hide hote hain.

### 5.3 Sidebar groups

| Group | Tabs |
|---|---|
| Overview | Dashboard |
| Operations | Inventory, Imports, Labels, Reports, Scheduled reports, Alerts, Purchasing |
| Configuration | Sources, Field Mapping, Rules |
| Administration | Users & Security, Sessions & Audit, Activity & Audit, Settings |
| Tools | AI Assistant |

Sidebar ke bottom me **language** selector (English / हिन्दी / ગુજરાતી) aur **Collapse** button hai.

---

## 6. Dashboard

**Kaun:** sab roles.

### 6.1 Kya dikhta hai

| Block | Matlab |
|---|---|
| **Inventory items** | Total rows |
| **Active sources** | Kitne sources on hain |
| **Active reports** | Report definitions |
| **Recent errors** | Latest import errors ka count |
| **By status** | Status distribution (bar) |
| **By age bucket** | Age buckets (donut) |
| **By status bucket** | Bucket distribution (bar) |
| **Top brands** | Top 5 brands (bar) |
| **Ageing trend** | Daily snapshots (line) — daily process chalne pe banta hai |
| **Recent runs** | Latest import/process jobs |
| **Recent errors** | Last errors with barcode/field/message |

### 6.2 Actions

- **Refresh** — data reload
- **Run daily process** (OPERATOR+) — rules dobara apply, inventory rebuild

### 6.3 Kab kya karein

- Subah: errors aur ageing trend dekho
- Charts empty hain? Inventory import karo ya daily process chalao
- Recent errors me same barcode baar-baar? Us row ka data check karo

---

## 7. Inventory

**Kaun:** sab dekh sakte hain; OPERATOR+ edit.

### 7.1 Toolbar (left → right)

| Control | Kaam |
|---|---|
| **Search** | Barcode / model / brand me search (debounced) |
| **Bulk edit** | Selected rows ka status/location/bin/priority badlo |
| **Scan** | Camera se barcode scan → search me bhar jaata hai |
| **Status / Age / Brand / Category / Priority / Bin / Source** | Filter dropdowns |
| **Clear** | Search + filters reset |
| **Views** | Saved filter presets |
| **Columns** | Columns hide/show |
| **Export** | CSV export (columns choose karke) |
| **Add row** | Naya item |

### 7.2 Saved views (Views menu)

1. Search/filters set karo
2. **Views → Save current view…**
3. Naam do (e.g. "Apple — above 75 days") → **Save view**
4. Dobara use karna ho to **Views → naam** pe click
5. Delete: usi row me **X**

Search, filters aur page size automatically save rehte hain — reload pe wapas milte hain.

### 7.3 Columns menu

- Checkbox se column on/off
- **BARCODE** column lock hai (hide nahi hota)
- **Show all columns** se sab wapas
- Selection browser me save rehta hai

### 7.4 Row detail drawer

Row pe click karo:

- Saare fields
- **History** timeline:
  - `Added to inventory`
  - `Removed from inventory`
  - `FIELD: old → new` (status, location, bin, priority, age, model, brand)
- Buttons: **Edit**, **Delete**, **Close**

History har write path se banti hai — REST, imports, bulk edit, purchases.

### 7.5 Naya item

**Add row** → form:

| Field | Note |
|---|---|
| BARCODE | Required, unique |
| MODEL / BRAND | Text |
| STATUS | Raw status |
| STOCK_AGE | Days |
| AGE_BUCKET / PRIORITY / STATUS_BUCKET | Rules se auto (manual override bhi ho sakta hai) |
| LOCATION / BIN_BUCKET | Rack/bin |
| SOURCE_TYPE | Manual entries ke liye |

Save pe rules apply hote hain.

### 7.6 Edit / Delete

- **Edit:** drawer → Edit → fields badlo → Save
- Barcode editable nahi hota
- **Delete:** drawer → Delete → confirm. Ye permanent hai (history me `Removed` record rehta hai).

### 7.7 Bulk edit

1. Rows select karo (checkbox)
2. **Bulk edit**
3. Fields choose karo: status, status bucket, location, bin bucket, priority
4. Apply

Sirf selected fields badalte hain; baaki data same rehta hai. Action audit log me jaata hai.

### 7.8 Export CSV

1. **Export**
2. Columns tick karo (All / None shortcuts)
3. **Export CSV** → download

### 7.9 Common mistakes

- Barcode duplicate → save fail (barcode unique hai)
- Empty filter result → **Clear** dabao
- Purana data dikh raha hai → **Refresh**

---

## 8. Imports

**Kaun:** OPERATOR+ (commit/rollback); VIEWER dekh sakta hai.

Imports ke **5 tabs** hain.

### 8.1 Universal import ✅

File se data laane ka main rasta.

**Supported files:** CSV, TSV, TXT, XLS, XLSX, PDF (max 15 MB / 50,000 rows).

**Step-by-step:**

1. **Imports → Universal import**
2. **Choose file** — file select karo
3. App columns auto-detect karta hai
4. Mapping check karo:
   - Har source column ke saamne target field
   - `BARCODE` required hai
   - Galat mapping ho to dropdown se badlo
5. **Validate**:
   - Green = ready
   - Red rows = errors (row number + message)
6. **Import now**
   - Preview me total/valid/imported/failed counts
   - Partial failure ho sakta hai — failed rows list dekho
7. Zarurat ho to **Roll back import**

**Result card:**

| Field | Matlab |
|---|---|
| Status | Committed / Dry run |
| Processed | Total rows |
| Valid | Rules pass |
| Imported | Inventory me gaye |
| Failed | Reject hue |
| Skipped | Empty/duplicate |
| Errors table | Row + message |

**Rollback kya karta hai:**

- Is job ne jo naye barcodes banaye → delete
- Jo pehle se the → unki purani values restore
- Dobara rollback nahi hota
- Sirf committed job ka rollback hota hai, dry run ka nahi

**Tips:**

- Pehle 10-20 rows ki test file se mapping verify karo
- Barcode column me spaces na ho
- Age column numeric ho
- Ek hi file me duplicate barcode na ho

### 8.2 Multi-source ✅

Purpose: QC Stock + TRC + Inventory + Location jaise alag sources ko **barcode pe join** karke ek final record banana.

**Local mode (files):**

1. Har source ke liye ek CSV/Excel file choose karo (QC Stock, TRC, Inventory, Location)
2. **Validate files** — har file stage hoti hai, columns auto-map hote hain
3. **Import all sources** — merge chalta hai
4. Result: devices, inserted, updated, conflicts
5. Galti ho to **Roll back import**

**Apps Script mode (sheets):**

1. Har source ka type + sheet name + sheet ID do
2. **Validate all** → **Import all sources**

Conflict ka matlab: same barcode, same field, do sources me alag value. Kaun jeetega ye **Priority rules** decide karte hain (local me bhi editable).

### 8.3 Conflicts ✅

Jab multi-source merge me do sources ki value alag hoti hai, wo yahan aati hai.

| Column | Matlab |
|---|---|
| Barcode | Device |
| Field | Kaunsa field |
| Source A / Value A | Jeetne wala |
| Source B / Value B | Doosra |
| Final value | Jo inventory me gaya |
| Rule | Kaunsa rule laga |

Actions:

- **Refresh** — latest conflicts
- **Clear** — saare conflict rows hatao (inventory data nahi badalta)

Conflict dekhkar priority rules adjust karo, phir merge dobara chalao.

### 8.4 Priority rules ✅

Batata hai ki merge ke waqt kaunsa source jeetega. Local mode me bhi ab editable hai.

| Field | Matlab |
|---|---|
| Field | Kaunsa data field (status, location, etc.) |
| Source type | QC_STOCK / TRC / INVENTORY / LOCATION |
| Rank | Chhota number = zyada priority |

Example:

| Field | Source | Rank |
|---|---|---|
| status | QC_STOCK | 1 |
| status | TRC | 2 |
| status | INVENTORY | 3 |

Matlab: status ke liye QC_STOCK sabse bharosemand.

Local mode me ye rules save hote hain (merge workflow khud Apps Script mode me chalta hai).

### 8.5 Source data ✅

Consolidated source rows ka raw view.

- **Consolidated source rows** — search + table (max 500 rows shown)
- **Import history** — last 20 runs (source, rows, status)

Ye tab debug ke liye hai: import ke baad data kaisa aaya, ye verify karo.

---

## 9. Labels

**Kaun:** OPERATOR+.

### 9.1 Settings

| Setting | Options |
|---|---|
| How many labels | 1–200 |
| Label size | 50×25, 38×25, 60×30 mm |
| Columns | 2, 3, 4 |
| Barcode height | 20–80 |
| Fields | Barcode text / Brand + model / Location + bin |

Settings browser me save hoti hain.

### 9.2 Print

1. Settings set karo
2. **Print**
3. Print dialog:
   - Margins: **None**
   - Scale: **100%**
   - Background graphics: **ON**
4. Preview check karo → Print

### 9.3 Common mistakes

- Barcode cut ho raha hai → barcode height kam karo ya label size badlo
- 3 columns me fit nahi → 2 columns karo
- Blank labels → inventory me barcode missing hai

---

## 10. Reports

**Kaun:** MANAGER+ (VIEWER dekh sakta hai).

### 10.1 Report definitions

Table me saved report definitions.

Actions:

- **New report** — naam + group by + filters
- **Edit** (pencil)
- **Delete** (trash)
- **Generate now** — turant run

### 10.2 Generate now

| Field | Matlab |
|---|---|
| Group by | status / brand / age_bucket / status_bucket / location / bin_bucket / model |
| Filters | status, brand, age bucket, status bucket, location |

Result: groups + counts.

### 10.3 Templates ✅

Reusable report formats (advanced; local mode me bhi supported):

- **New template** — naam + config JSON
- **Edit / Delete**
- **Config JSON** structure aapke template engine pe depend karta hai

### 10.4 Exports

| Button | Output |
|---|---|
| **CSV** | Grouped counts |
| **Excel** | XLSX with filters |
| **PDF** | Print-ready report |

**Export all to sheets** ⚠️ — Apps Script mode me sab reports sheets me likhta hai.

---

## 11. Scheduled reports

**Kaun:** MANAGER+ dekh sakta hai, ADMIN bana sakta hai.

### 11.1 New schedule

| Field | Matlab |
|---|---|
| Name | Internal naam |
| Group by | Report dimension |
| Frequency | Daily / Weekly / Monthly |
| Format | PDF / XLSX |
| Recipients | Comma-separated emails |
| Status / Brand / Location filter | Optional exact match |
| Active | ON = automatic send |

### 11.2 Kaise chalta hai

- Server boot pe + har **30 minute** check karta hai
- Due schedule (last run + period) → report generate → email
- `last_run_at` save hota hai — restart pe duplicate nahi jaata
- Email fail ho to schedule active rehta hai, next cycle me retry

### 11.3 Actions

- **Run** — abhi bhejo
- **Edit** — settings badlo
- **Delete** — band karo

### 11.4 Common mistakes

- Email nahi ja raha → Settings me SMTP configure karo, **email test** dabao
- Recipients comma se separate hone chahiye
- "Never" last run = pehli baar abhi tak due nahi hua

---

## 12. Alerts

**Kaun:** ADMIN bana sakta hai; sab dekh sakte hain.

### 12.1 Alert types

| Type | Matlab | Example |
|---|---|---|
| **AGE_OVER** | Kitne din se purana stock | 90+ days ka stock |
| **STATUS_BUCKET_COUNT** | Bucket me count threshold | QC_FAIL > 50 |
| **MISSING_FIELD** | Field missing | location khali |

### 12.2 New alert

| Field | Note |
|---|---|
| Name | Unique |
| Type | Upar wale 3 |
| Threshold | Number |
| Filter field / value | Optional (brand = Apple) |
| Email to | Recipients |
| Active | ON/OFF |

### 12.3 Testing

Card **Notification tests** me:

- **Send test email**
- **Send WhatsApp test**

Dono Settings ki config use karte hain. Fail ho to exact error message dikhta hai.

### 12.4 Check now

**Check now** — abhi rules evaluate karo, triggered alerts dikhenge. Daily process ke saath bhi automatic chalta hai.

---

## 13. Purchasing

**Kaun:** MANAGER+.

Do tabs: **Purchase orders** aur **Vendors**.

### 13.1 Vendors tab

| Field | Note |
|---|---|
| Name | Required, unique |
| Contact person | Text |
| Email | Text |
| Phone | Text |
| Address | Text |
| Notes | Text |
| Active | ON/OFF |

Actions: **Edit**, **Delete**. Vendor delete tabhi hoga jab uska koi PO na ho.

### 13.2 Purchase orders tab

Table columns: PO number, vendor, status, lines, ordered, received, expected.

Status flow:

```
DRAFT → ORDERED → PARTIAL → RECEIVED
              ↘ CANCELLED
```

### 13.3 Naya PO

1. **New purchase order**
2. Vendor choose karo
3. Status: **Draft** ya **Ordered**
4. Expected date + notes
5. **Add line** — har line me:
   - Barcode (optional)
   - Model
   - Brand
   - Quantity
   - Unit cost
6. **Save order**

PO number auto-generate hota hai (`PO-YYYYMMDD-001`).

### 13.4 Receive

1. PO row me **Receive**
2. Har line ka remaining quantity dikhta hai
3. **Receive now** me quantity daalo (0 = skip)
4. **Receive stock**

Result:

- Received quantity update
- Barcode wali line inventory me `IN_STOCK` ban jaati hai
- Status auto: sab aa gaya → `RECEIVED`, partial → `PARTIAL`
- Over-receive reject hota hai

### 13.5 Cancel

- Sirf un orders ke liye jisme kuch receive nahi hua
- `CANCELLED` ke baad edit nahi

### 13.6 Common mistakes

- "Cannot receive N; only M remain" → quantity remaining se zyada hai
- Received order edit nahi hota — naya PO banao
- Vendor delete nahi ho raha → pehle uske POs cancel/delete karo

---

## 14. Sources

**Kaun:** ADMIN.

Source = data ka origin (QC sheet, TRC sheet, inventory sheet, location sheet).

### 14.1 New source

| Field | Note |
|---|---|
| Name | Unique |
| Role | PRIMARY (main data) ya JOIN (extra data) |
| Type | Free text, e.g. Google Sheet; system QC/TRC/Inventory/Location se source type infer karta hai |
| Sheet name | Google Sheet tab ka naam |
| Sheet ID | External spreadsheet ho to |
| Join key | Default `barcode` |
| Join fields | Comma-separated fields is source se lene hain |
| Active | ON/OFF |

### 14.2 Source types ka matlab

| Type | Use |
|---|---|
| QC_STOCK | QC pass/fail data |
| TRC | Repair/TRC data |
| INVENTORY | Main inventory sheet |
| LOCATION | Location/bin mapping |
| OTHER | Manual/import source |

### 14.3 Kab kya karein

- Naya sheet aaya → source add karo → mapping karo
- Source band karna hai → Edit → Active OFF
- Delete local mode me nahi (Apps Script me available)

---

## 15. Field Mapping

**Kaun:** ADMIN.

Source columns ko standard fields se jodta hai.

### 15.1 Kaise map karein

1. Source choose karo
2. Har row me:
   - **Source column** (sheet ka header)
   - **Target field** (`BARCODE`, `MODEL`, `BRAND`, `STATUS`, `STOCK_AGE`, `LOCATION`, ...)
   - **Required** checkbox
   - **Output order**
   - **Active**
3. **Save mapping**

### 15.2 Rules

- `BARCODE` required hai
- Ek source column ek hi target pe
- Empty target = ignore
- Mapping save karne ke baad import karo

### 15.3 Common mistakes

- Barcode mapping missing → import fail
- Age column text me hai → numeric karo
- Status ka naam galat → rules match nahi karenge

---

## 16. Rules

**Kaun:** ADMIN.

Rules ka result: age bucket, status bucket, bin bucket, priority. Changes **next process run** pe apply hote hain.

### 16.1 Age buckets tab

| Field | Matlab |
|---|---|
| Min age | Days (inclusive) |
| Max age | Days (inclusive) |
| Bucket name | e.g. `Below 30`, `30-60`, `Above 75` |
| Priority | `P1`, `P2`, `P3` |

Example:

| Min | Max | Bucket | Priority |
|---|---|---|---|
| 0 | 29 | Below 30 | P3 |
| 30 | 59 | 30-60 | P2 |
| 60 | 74 | 60-75 | P2 |
| 75 | 9999 | Above 75 | P1 |

Rule overlap na ho — pehla match jeetta hai.

### 16.2 Status buckets tab

| Field | Matlab |
|---|---|
| Raw status | Sheet me jo status aata hai (`L4`, `QC Fail`) |
| Bucket | Standard bucket (`READY`, `QC_FAIL`) |
| Marking | Optional note/flag |

### 16.3 Location rules tab

| Field | Matlab |
|---|---|
| Pattern | Location ka pattern (`SW*`, `A1`) |
| Bucket | Bin bucket (`Shelf A`, `Cage 1`) |
| Condition | Optional extra condition |

### 16.4 Priority rules

⚠️ Apps Script mode (Imports → Priority rules tab).

Merge ke waqt field-level winner decide karta hai. Rank chhota = zyada priority.

### 16.5 Apply karna

Rules save karne ke baad:

1. **Dashboard → Run daily process** (ya Imports ke baad process)
2. Inventory me buckets update ho jaate hain

---

## 17. Users & Security

**Kaun:** ADMIN.

Do tabs.

### 17.1 Users tab

| Column | Matlab |
|---|---|
| Email | Login |
| Role | VIEWER → OWNER |
| Active | YES/NO |
| Password | Set hai ya nahi |
| Locked until | Lockout time |
| Last login | Last successful login |

**New user:**

1. **New user**
2. Email, role, password (10+ chars, letters + numbers)
3. Save

**Edit user:**

- Role badlo
- Active OFF = login block + existing sessions revoke
- Apna role khud change nahi kar sakte

**Reset password:**

- User row → reset
- Naya password set karo
- Us user ke saare sessions revoke ho jaate hain

**2FA reset:** agar user ne authenticator kho diya, ADMIN `auth.totpReset` se 2FA off kar sakta hai (Settings ke through).

### 17.2 Sheet security tab ⚠️

Sirf Apps Script mode. Google Sheet ke tabs lock/unlock karta hai taaki accidental edit na ho.

- **Lock** — sheet protect
- **Unlock** — protection hatao

Local mode me ye tab data nahi dikhayega.

---

## 18. Sessions & Audit

**Kaun:** ADMIN.

### 18.1 Active sessions

| Column | Matlab |
|---|---|
| User | Email |
| Role | Current role |
| Signed in | Session start |
| Last seen | Last activity |
| Expires | Session expiry |

Actions:

- **Sign out** — sirf ye session revoke
- **All** — us user ke saare devices se sign out

Revoke hone ke baad us token se koi API call nahi chalegi.

### 18.2 Login history

Last 100 events:

| Event | Matlab |
|---|---|
| Login OK | Successful login |
| Login Failed | Wrong password |
| Login Locked | 5 failures ke baad lock |
| Login Blocked Locked | Locked account se try |
| Logout | Manual logout |

IP column se suspicious logins pakdo.

### 18.3 Kab dekhna chahiye

- Roz shaam ko failed logins
- Kisi user ke multiple devices
- Employee exit ke baad uske sessions revoke karo

---

## 19. Settings

**Kaun:** ADMIN (VIEWER ke liye read-only).

### 19.1 System settings

Groups:

| Group | Keys |
|---|---|
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| Auto backup | `AUTO_BACKUP`, `BACKUP_FOLDER_ID` |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ALERT_EMAIL_TO` |
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `ALERT_WHATSAPP_TO` |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_AUTO_CREATE` |
| LLM | `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL` |

Save karo → test buttons se verify.

### 19.2 Notification tests

- **Send test email** — SMTP check
- **Send WhatsApp test** — Cloud API check

### 19.3 Connection

- API URL (desktop/mobile ke liye)
- Sheet URL (Apps Script)
- Save

### 19.4 Two-factor authentication

1. **Enable 2FA**
2. Secret key ya `otpauth://` URI authenticator app me daalo
   - Google Authenticator → "+" → Enter setup key
3. App ka 6-digit code daalo
4. **Verify and enable**
5. **8 recovery codes** copy karke safe rakho
6. Disable: password + current code

Recovery code ek hi baar chalta hai.

### 19.5 Backup

- Boot pe + har 6 ghante
- `server/data/backups/`
- Latest 7 rakhe jaate hain

---

## 20. AI Assistant

**Kaun:** OPERATOR+.

Natural language command likho:

- `List Apple devices older than 75 days`
- `How many devices are in Bin Storage?`
- `Show today's inventory summary`
- Hindi bhi: `75 din se purane Apple devices dikhao`

Kaise kaam karta hai:

1. Command parse hoti hai (filters: brand, location, status, age)
2. Inventory query chalti hai
3. Result JSON me dikhta hai

**LLM mode (optional):** Settings me `LLM_API_URL` + `LLM_API_KEY` + `LLM_MODEL` set karo. Model sirf filters suggest karta hai; SQL khud server banata hai. LLM fail ho to rules parser chal jaata hai.

---

## 21. Roz ka workflow

### Subah

1. Dashboard — errors, ageing, counts
2. Sessions & Audit — failed logins (admin)

### Naya stock

1. Imports → Universal import → file
2. Validate → Import now
3. Errors check karo
4. Labels print karo

### Movement

1. Inventory → search barcode
2. Row → Edit → location/status
3. History me change confirm karo

### Bulk

1. Rows select → Bulk edit
2. Status/location/priority apply

### Orders

1. Purchasing → New PO
2. Receive hone pe **Receive**
3. Inventory auto update

### Shaam

1. Reports → PDF/XLSX
2. Scheduled report agar weekly chahiye

---

## 22. Backup aur restore

### Backup

- Automatic: boot + har 6 ghante
- Location: `server/data/backups/`
- Retention: 7

### Manual backup

- Settings → Auto backup ON
- Ya server band karke `data/bulkrepair.db` copy karo

### Restore

1. Server band karo
2. `data/bulkrepair.db` rename karo
3. Backup file ko `bulkrepair.db` naam se copy karo
4. Server start karo

### Import rollback

- Committed import ka **Roll back import**
- Dry run ka rollback nahi

---

## 23. Troubleshooting

| Problem | Solution |
|---|---|
| Page nahi khul raha | `http://localhost:5050/api/health` check karo |
| API error | Setup → Connection me URL; desktop pe `http://localhost:5050` |
| Android connect nahi | Wi-Fi same? `adb reverse tcp:5050 tcp:5050` |
| Login fail | Caps Lock, password 10+ chars, admin reset |
| Account locked | 15 min wait; admin lock clear kar sakta hai |
| 2FA code galat | Phone time auto karo; recovery code use karo |
| 2FA reset chahiye | Admin se `TOTP reset` karwao |
| Email nahi ja raha | SMTP host/from/pass; test email |
| WhatsApp nahi ja raha | Token, phone ID, country code |
| Import fail | Barcode column, 50k limit, errors preview |
| Rollback nahi dikh raha | Sirf committed job; dry run nahi |
| Charts khali | Inventory empty / daily process nahi chala |
| Camera nahi chal raha | Permission; HTTPS/localhost |
| Print bigad raha | Margins None, scale 100%, background ON |
| Sessions tab khali | Koi active session nahi ya admin nahi ho |
| Multi-source error | Har source ke liye file select karo; barcode column hona chahiye |
| Priority rules error | Field khali na ho; source type QC_STOCK/TRC/INVENTORY/LOCATION/OTHER me se ho |
| Sheet security error | Apps Script only |
| Report templates error | Ab local me supported hai — Config JSON valid hona chahiye |

---

## 24. Security checklist

- [ ] Owner password strong (10+ chars, letters + numbers)
- [ ] 2FA enable karo
- [ ] Extra users deactivate karo
- [ ] Har hafte Sessions & Audit check karo
- [ ] Backups safe location pe
- [ ] Public internet pe expose kar rahe ho to HTTPS reverse proxy
- [ ] SMTP password/LLM key rotate karte raho
- [ ] Employee exit pe uske sessions revoke karo

---

## 25. Useful commands

```bash
# server start
cd server && npm run dev

# build only
cd server && npm run build

# tests
cd server && npm test

# panel rebuild
cd server && npm run build:panel

# admin user (CLI)
cd server && npm run create-user -- owner@example.com 'StrongPass123' ADMIN

# Docker
docker compose up --build

# Android APK
cd mobile/android && ./gradlew assembleDebug
```

---

## 26. FAQ aur glossary

### FAQ

**Data kahan save hota hai?**
Local: `server/data/bulkrepair.db`. Apps Script: Google Sheet.

**Internet chahiye?**
Local mode me nahi. Apps Script me haan.

**Multi-warehouse?**
Abhi single global inventory. Multi-warehouse implement nahi hua.

**Hindi/Gujarati UI?**
Sidebar bottom me selector. Default English.

**Data delete ho gaya?**
Backup restore ya import rollback.

**Ek user kitne devices se login kar sakta hai?**
Koi limit nahi; Sessions page se revoke kar sakte ho.

### Glossary

| Term | Matlab |
|---|---|
| **Barcode** | Device ka unique ID |
| **Bucket** | Standard category (age/status/location) |
| **Priority** | P1/P2/P3 — urgency |
| **Source** | Data ka origin (sheet/file) |
| **Mapping** | Source column → system field |
| **Staging** | Import ka temporary area (commit se pehle) |
| **Job** | Ek import run ka record |
| **Conflict** | Do sources me same field ki alag value |
| **Rollback** | Committed import undo |
| **Bin bucket** | Physical bin/shelf group |
| **Session** | Login token |
| **2FA** | Password ke upar authenticator code |
