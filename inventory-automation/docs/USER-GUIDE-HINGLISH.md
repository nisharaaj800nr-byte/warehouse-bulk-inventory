# Bulk Repair — User Guide (Hinglish)

Ye guide batata hai ki Bulk Repair inventory system ko **kaise install**, **kaise configure** aur **roz kaam ke liye kaise use** karna hai.

---

## 1. Ye app kya karta hai

Bulk Repair ek warehouse / repair inventory system hai. Isme aap:

- Devices ka stock maintain kar sakte ho (barcode, model, brand, status, age, location)
- Excel / CSV file se bulk data import kar sakte ho
- Multiple sources ka data merge kar sakte ho (Apps Script mode me)
- Age, status aur location ke rules se auto-classification kar sakte ho
- Dashboard, reports, labels aur alerts nikal sakte ho
- Vendors aur purchase orders manage kar sakte ho
- Har change ka audit trail dekh sakte ho

---

## 2. System requirements

| Cheez | Requirement |
|---|---|
| Node.js | 22 ya usse naya (`node -v`) |
| npm | 10+ |
| OS | macOS, Windows, Linux |
| Browser | Chrome / Edge / Safari (latest) |
| Mobile build ke liye | Android SDK + Java 21 |

---

## 3. App start karna (sabse pehle ye)

### 3.1 Server + web app (development)

```bash
cd inventory-automation/server
npm install
npm run dev
```

- `npm run dev` pehle TypeScript build karta hai, phir server start karta hai
- Default URL: **http://localhost:5050** (port `server/.env` se aata hai)
- Pehli baar chalane pe `server/data/bulkrepair.db` khud ban jaata hai
- Database migrations automatic apply hoti hain

Browser me `http://localhost:5050` kholo — wahi se poora portal chalega (server hi panel serve karta hai).

### 3.2 Production build

```bash
cd inventory-automation/server
npm install
npm run build:panel     # portal build + server/public me copy
npm run build           # server TypeScript build
npm start
```

### 3.3 Docker se

```bash
cd inventory-automation
docker compose up --build
```

- App: **http://localhost:5000**
- Database `/data` volume me rehta hai (container delete karne pe bhi safe)

### 3.4 Desktop app (Mac / Windows)

`dist-builds/` folder me installers milenge:

- macOS: `BulkRepair-1.0.0-macos-arm64.zip` — unzip karke `Bulk Repair.app` chalao
- Windows: `BulkRepair-1.0.0-windows-x64-portable.exe`

Desktop app sirf UI hai. Backend alag se chalana hoga (Step 3.1), phir app ke **Setup → Connection** me URL do:

- Same Mac/PC: `http://localhost:5050`
- Doosre computer se: `http://<server-ip>:5050`

### 3.5 Android APK

`dist-builds/BulkRepair-1.0.0-android-debug.apk`

```bash
adb install -r BulkRepair-1.0.0-android-debug.apk
```

Backend URL options:

- USB se: pehle `adb reverse tcp:5050 tcp:5050`, phir app me `http://localhost:5050`
- Same Wi-Fi: `http://<Mac-ka-LAN-IP>:5050`

> APK debug-signed hai (testing ke liye). Play Store ke liye release keystore chahiye.

---

## 4. First-time setup (one-time)

Pehli baar app kholne pe setup wizard aayega — 3 steps:

### Step 1 — Backend choose karo

| Option | Kab use karein |
|---|---|
| **This computer (offline)** | Data local SQLite me chahiye, internet nahi chahiye |
| **Google Apps Script / Google Sheets** | Data Google Sheet me hai / phone se kahin se access chahiye |

Local choose kiya to kuch aur nahi chahiye. Apps Script choose kiya to deployment ka `/exec` URL daalo aur **Test connection** dabao.

### Step 2 — Google Sheet (optional)

Sirf quick-access link save hota hai. Local mode me iski zarurat nahi.

### Step 3 — Owner account

- Email daalo
- Password: **minimum 10 characters**, usme **letters aur numbers dono** hone chahiye
- Confirm password
- **Finish setup**

Ye account `OWNER` role ke saath banega — isme sab permissions hain.

---

## 5. Login aur roles

Login page pe email + password. Agar 2FA on hai to 6-digit code bhi maangega.

| Role | Kya kar sakta hai |
|---|---|
| **VIEWER** | Sirf dekh sakta hai (read-only) |
| **OPERATOR** | Inventory add/edit, imports, labels, AI commands |
| **MANAGER** | Upar wala sab + reports, scheduled reports, purchasing |
| **ADMIN** | Upar wala sab + users, settings, sessions, vendors |
| **OWNER** | Sab kuch |

Role ke hisaab se sidebar me options apne aap kam/zyada dikhte hain.

---

## 6. Screen-by-screen usage

### 6.1 Dashboard

- **KPI cards:** total items, active sources, active reports, recent errors
- **By status / By status bucket / Top brands:** bar charts
- **By age bucket:** donut chart
- **Ageing trend:** daily line chart (jab daily process chalta hai)
- **Recent runs / Recent errors:** latest import jobs
- **Run daily process:** rules dobara apply karke inventory rebuild karta hai (OPERATOR+)

### 6.2 Inventory

| Kaam | Kaise |
|---|---|
| Search | Upar search box (barcode, model, brand) |
| Filter | Status / age bucket / brand / location dropdowns |
| Saved view | **Views → Save current view** — filters + search + page size save ho jaate hain |
| Columns hide/show | **Columns** menu (Barcode column hide nahi hota) |
| Naya item | **Add row** |
| Bulk change | Rows select karke **Bulk edit** (status / location / bin / priority) |
| Barcode scan | **Scan** button (camera) |
| Export | **Export** → columns choose karke CSV |
| Item history | Kisi row pe click → drawer me **History** (kab kya badla) |
| Edit/Delete | Row drawer me Edit / Delete |

### 6.3 Imports (sabse important screen)

1. **Imports → File** tab
2. File choose karo: CSV, TSV, TXT, XLS, XLSX ya PDF (max 50,000 rows)
3. App columns auto-detect karta hai — galat ho to mapping badlo
4. **Validate** dabao — errors preview me dikhenge
5. **Import now** — data inventory me chala jayega
6. Galti ho gayi? **Roll back import** dabao — poora job undo ho jayega

> Rollback usi job ka data wapas karta hai: jo rows is job ne banayi thi wo delete, jo pehle se thi wo purani values pe restore.

**Multi-source merge** (QC + TRC + Inventory + Location) sirf Apps Script mode me available hai.

### 6.4 Sources

- **New source:** naam, type (`QC_STOCK`, `TRC`, `INVENTORY`, `LOCATION`, `OTHER`), sheet name, join key (default `barcode`)
- Source active/inactive kar sakte ho
- Yahan se decide hota hai ki kaunsi file kaunse data layer ko feed karegi

### 6.5 Field Mapping

- Source column → target field map karo
- `BARCODE` required hai
- Output order aur active flag set kar sakte ho
- Saving se pehle mapping validate karo

### 6.6 Rules

| Rule | Kaam |
|---|---|
| **Age rules** | `min–max` din → bucket + priority (e.g. 75+ = Critical) |
| **Status rules** | Raw status → bucket + marking |
| **Location rules** | Location pattern → bin bucket |
| **Priority rules** | Kaunsa source ka field merge me jeetega |

Rules change karne ke baad **Run daily process** chalao taaki inventory update ho.

### 6.7 Labels

- Kitne labels chahiye (1–200)
- Size: 50×25, 38×25, 60×30 mm
- Columns: 2 / 3 / 4
- Barcode height aur kaunse fields print honge
- **Print** dabao — print dialog me margins **None**, scale **100%**

### 6.8 Reports

- **Group by:** status, brand, age bucket, status bucket, location, bin bucket, model
- Filters lagao → **Run**
- Export: **CSV**, **XLSX**, **PDF**
- **Templates** save karke dobara use kar sakte ho

### 6.9 Scheduled reports (MANAGER+)

- **New schedule:** naam, group by, frequency (daily/weekly/monthly), format (PDF/XLSX), recipients
- Server har 30 minute check karta hai aur due report email kar deta hai
- **Run** button se turant bhej sakte ho
- Email ke liye Settings me SMTP configured hona chahiye

### 6.10 Alerts

| Type | Matlab |
|---|---|
| **AGE_OVER** | Itne din se purana stock |
| **STATUS_BUCKET_COUNT** | Kisi bucket me count threshold cross |
| **MISSING_FIELD** | Zaruri field missing |

- Email aur WhatsApp test buttons se configuration check karo
- **Check now** se manually trigger

### 6.11 Purchasing (MANAGER+)

**Vendors:**
- New vendor: naam, contact person, email, phone, address
- Vendor delete tabhi hoga jab uska koi purchase order na ho

**Purchase orders:**
1. **New purchase order**
2. Vendor choose karo, status `DRAFT` ya `ORDERED`
3. Lines add karo: barcode (optional), model, brand, quantity, unit cost
4. Save
5. **Receive** button se received quantity daalo
   - Barcode wali line inventory me `IN_STOCK` ke roop me chali jaati hai
   - Status apne aap `PARTIAL` ya `RECEIVED` ho jaata hai
6. Received order edit ya cancel nahi ho sakta

### 6.12 Users & Security (ADMIN)

- **New user:** email, role, password (10+ chars, letters + numbers)
- Role change, active/inactive
- **Reset password**
- 2FA reset (agar user ne authenticator kho diya)

### 6.13 Sessions & Audit (ADMIN)

- **Active sessions:** user, role, signed in, last seen, expiry
- Per-session **Sign out**
- **All** — us user ke saare devices se sign out
- **Login history:** last 100 auth events (OK / FAILED / LOCKED / BLOCKED) + IP

### 6.14 Settings

| Section | Kya set hota hai |
|---|---|
| Telegram | bot token, chat ID |
| Auto backup | ON/OFF, Drive folder |
| SMTP | host, port, user, password, from, alert recipients |
| WhatsApp | Cloud API token, phone number ID, recipient |
| Google OAuth | Client ID, auto-create users |
| LLM | API URL, API key, model (AI assistant ke liye) |

Settings save karne ke baad test buttons se verify karo.

### 6.15 Two-factor authentication (2FA)

1. **Settings → Two-factor authentication → Enable 2FA**
2. Secret key ya setup URI apne authenticator app (Google Authenticator / 1Password / Authy) me daalo
3. App me dikh raha 6-digit code enter karo
4. **8 recovery codes** save karo — har code ek hi baar chalega
5. Disable karna ho to password + current code chahiye

### 6.16 AI Assistant

Natural language me sawal pooch sakte ho (Hindi/English dono):

- "List Apple devices older than 75 days"
- "How many devices are in Bin Storage?"
- "Show today's inventory summary"

Ye by default rules-based parser use karta hai. Agar Settings me LLM API configured hai to LLM se better samajh aata hai; fail hone pe wapas rules pe aa jaata hai.

---

## 7. Roz ka typical workflow

1. **Subah:** Dashboard kholo — errors aur ageing dekho
2. **Naya stock aaya:** Imports → file upload → validate → import
3. **Device move hua:** Inventory me search → row kholo → Edit (location/status)
4. **Bulk update:** rows select → Bulk edit
5. **Labels chahiye:** Labels → size/columns → Print
6. **Management report:** Reports → group by → PDF/XLSX export
7. **Order dena hai:** Purchasing → PO create → receive hone pe stock update
8. **Din ke end me:** Sessions & Audit me suspicious logins check karo (admin)

---

## 8. Backup aur restore

- Server boot pe aur har **6 ghante** automatic backup leta hai
- Backup location: `server/data/backups/`
- Sirf latest **7** backups rakhe jaate hain
- Restore karna ho to:
  1. Server band karo
  2. `data/bulkrepair.db` ko rename/backup karo
  3. Backup file ko `bulkrepair.db` naam se copy karo
  4. Server start karo

---

## 9. Troubleshooting

| Problem | Solution |
|---|---|
| App nahi khul raha | Server chal raha hai? `http://localhost:5050/api/health` check karo |
| "Not connected" / API error | Setup → Connection me backend URL sahi hai? Desktop pe `http://localhost:5050` |
| Android pe connect nahi ho raha | Same Wi-Fi? `adb reverse tcp:5050 tcp:5050` try karo |
| Login nahi ho raha | Caps Lock, password 10+ chars, ya admin se reset karwao |
| Account locked | 5 galat attempts ke baad 15 min lock — wait karo |
| 2FA code galat | Phone ka time automatic pe rakho; recovery code try karo |
| Email nahi ja raha | Settings me SMTP host/from/password check karo → email test dabao |
| WhatsApp nahi ja raha | Token, phone ID aur recipient country code check karo |
| Import fail ho raha | CSV me barcode column hai? File 50k rows se kam? Errors preview dekho |
| Rollback button nahi dikh raha | Sirf committed import ka rollback hota hai; dry run ka nahi |
| Charts khali hain | Inventory empty hai ya daily process nahi chala |
| Camera scan nahi chal raha | Permission allow karo; HTTPS ya localhost use karo |
| Print layout bigad raha | Print dialog: margins None, scale 100%, background graphics ON |

---

## 10. Security checklist (pehli baar ke baad)

- [ ] Owner password strong rakho (10+ chars, letters + numbers)
- [ ] 2FA enable karo (Settings → Two-factor authentication)
- [ ] Purane/extra users deactivate karo
- [ ] Sessions & Audit me regular login history check karo
- [ ] Backups ka location safe rakho
- [ ] Server ko public internet pe expose kar raha ho to HTTPS reverse proxy lagao

---

## 11. Useful commands

```bash
# server start (build + run)
cd server && npm run dev

# sirf build
cd server && npm run build

# tests
cd server && npm test

# panel rebuild (app + copy to server/public)
cd server && npm run build:panel

# naya admin user (CLI)
cd server && npm run create-user -- owner@example.com 'StrongPass123' ADMIN

# Docker
docker compose up --build

# Android debug APK
cd mobile/android && ./gradlew assembleDebug
```

---

## 12. FAQ

**Q: Data kahan save hota hai?**  
Local mode me `server/data/bulkrepair.db` (SQLite). Apps Script mode me Google Sheet me.

**Q: Internet chahiye?**  
Local mode me nahi (same network pe mobile/desktop se access ho sakta hai). Apps Script mode me haan.

**Q: Ek se zyada warehouse?**  
Abhi single global inventory hai. Multi-warehouse abhi implement nahi hua.

**Q: Hindi/Gujarati UI?**  
Sidebar ke bottom me language selector hai — English, हिन्दी, ગુજરાતી. Default English hai.

**Q: Data delete ho gaya, wapas milega?**  
Automatic backups se restore kar sakte ho (Section 8). Import galti ho to us job ka rollback karo.

**Q: Mobile app me backend URL kaise badle?**  
App ke Setup/Connection screen me. Baad me Settings → Connection se bhi.
