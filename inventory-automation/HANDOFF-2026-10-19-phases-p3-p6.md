# HANDOFF — P3 → P6 (Android / scanner / exports / bulk / i18n / OAuth)

> 18–19 Oct 2026 · repo `warehouse-bulk-inventory` · branch `main`
> Is document me un phases ka status, config aur verification hai jo goal me diye gaye the.

---

## 1. Status table

| Phase | Item | Status | Evidence |
|---|---|---|---|
| **P3** | Android `.apk` (Capacitor) | ✅ Done | `mobile/android/app/build/outputs/apk/debug/app-debug.apk` (4.2 MB, `in.bulkrepair.app`, minSdk 22 / targetSdk 34) |
| **P3b** | Barcode scanner (camera) | ✅ Code + bundled | `app/src/features/scanner.tsx`, Inventory toolbar **Scan**, bundle me `Scan barcode` present |
| **P3b** | Offline queue | ✅ Code + bundled | `app/src/lib/api.ts` queue + auto-flush; bundle me `queued` present |
| **P4** | Auto backup | ✅ Verified live | Boot pe + har 6h; live run me `bulkrepair-<ts>.db` 216 KB bana |
| **P4** | Excel report | ✅ Verified | bridge `reports.exportExcel` → 19,343 bytes, magic `PK` |
| **P4** | PDF report | ✅ Verified | bridge `reports.exportPdf` → 1,628 bytes, magic `%PDF` |
| **P4** | Label print | ✅ Done | `/labels` page, CODE128 via JsBarcode, print CSS |
| **P5** | Bulk edit | ✅ Done | Inventory → **Bulk edit** modal; bridge `inventory.bulkUpdate` (2/2 rows verified) |
| **P5** | Email alerts | ✅ Backend + settings | `POST /api/alerts/email-test`, SMTP keys; unconfigured → actionable 400 |
| **P5** | WhatsApp | ✅ Backend + settings | `POST /api/alerts/whatsapp-test`, Meta Cloud API; unconfigured → 400 |
| **P5** | Hindi/Gujarati UI | 🟡 Partial | Nav + groups + topbar title + language switcher; body content English |
| **P6** | Google OAuth | 🟡 Backend done | `auth.google` (tokeninfo verify, role mapping, auto-create flag); UI button pending, Client ID required |
| **P6** | Auto-update | ✅ Done (env-gated) | `desktop/main.cjs` `startAutoUpdate()` — `UPDATE_FEED_URL` set hone par hi chalta hai |
| **P6** | Charts | ⏳ Pending | Dashboard abhi stat cards + tables; distribution chart baaki |

---

## 2. Build commands

```powershell
# server + panel
cd inventory-automation\server
npm run build
npm run build:panel          # panel build + copy into server/public
npm test                     # 92 tests

# Android
cd ..\mobile
npx cap sync android
cd android
$env:ANDROID_HOME='C:\Users\MUKESH\AppData\Local\Android\Sdk'
.\gradlew.bat assembleDebug   # -> app\build\outputs\apk\debug\app-debug.apk

# Windows desktop
cd ..\..\desktop
npm run dist                  # -> release\BulkRepair-<version>-portable.exe
```

---

## 3. Configuration keys (Settings screen / settings table)

| Key | Use |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ALERT_EMAIL_TO` | Email test / alerts |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `ALERT_WHATSAPP_TO` | WhatsApp Cloud API |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (Google Cloud Console) |
| `GOOGLE_AUTO_CREATE` | `ON` = naye Google users ko VIEWER bana do |
| `UPDATE_FEED_URL` (env) | Desktop auto-update feed |

---

## 4. Verification evidence (checked in this cycle)

| Check | Result |
|---|---|
| `npm run build` (server) | exit 0 |
| `npm test` | **92 passed / 92**, 9 suites |
| Panel build (`tsc --noEmit` + vite) | exit 0 |
| `cap sync android` + `gradlew assembleDebug` | **BUILD SUCCESSFUL** |
| APK badging | `package=in.bulkrepair.app`, `versionName=1.0`, `minSdk=22`, `targetSdk=34` |
| Excel via bridge | 19,343 bytes, `PK` magic |
| PDF via bridge | 1,628 bytes, `%PDF` magic |
| Bulk edit via bridge | matched=2, updated=2, list me value verify |
| Auto backup (boot) | file 216 KB, `data/backups/` |
| Backup via bridge | 221,184 bytes, file exists |
| WhatsApp unconfigured | HTTP 400 with `WHATSAPP_TOKEN` message |
| Google unconfigured | `VALIDATION_ERROR` with `GOOGLE_CLIENT_ID` message |
| Desktop exe | 74.9 MB, window title **Bulk Repair - Portal** |
| Push | `2a03a22` (remote verified) |

---

## 5. Known gaps / risks

1. **Camera scan runtime** device/emulator pe test nahi hua (koi device attached nahi); code bundled hai.
2. **Offline queue runtime** browser me network-off karke test nahi hua; code compile + bundle verified.
3. **Google OAuth end-to-end** nahi test hua — `GOOGLE_CLIENT_ID` chahiye. Unconfigured path tested.
4. **WhatsApp** end-to-end nahi — Meta Cloud API token chahiye.
5. **i18n** sirf navigation translated; screens English hain.
6. **Charts** pending.
7. **APK debug build** hai (unsigned) — Play Store ke liye release keystore chahiye.
8. **Desktop exe unsigned** — SmartScreen warning aa sakti hai.

---

## 6. Rollback

- Code: `git revert 2a03a22` (ya pichhla `00d0457`)
- Data: `server\data\backups\bulkrepair-*.db` me 7 tak snapshot; restore = file copy
- Desktop/APK: purane artefacts `release\` / `build\outputs\` me rebuild se regenerate ho jate hain

---

## 7. Next concrete steps

1. **OAuth UI**: login/setup me `Sign in with Google` button (GIS script) + `auth.google` call — Client ID milne par test.
2. **Dashboard charts**: `byStatus` / `byAgeBucket` bridge response extend karke chart card.
3. **i18n depth**: page headers + table labels + buttons (hi/gu).
4. **Device QA**: `adb install` + camera scan + offline queue test.
