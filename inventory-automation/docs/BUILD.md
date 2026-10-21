# Builds — 19 Oct 2026

All commands run from `inventory-automation/`.

## 1. Shared web panel

```bash
cd server && npm run build:panel
```

Builds `app/` and copies the result to `server/public/` (used by the server, the
desktop shell and the mobile shell).

## 2. Android APK

```bash
cd mobile
npm install
npx cap sync android
cd android
export ANDROID_HOME="$HOME/Library/Android/sdk"
./gradlew assembleDebug
```

Output: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`

- Package: `in.bulkrepair.app`
- minSdk 22, targetSdk 34
- Debug build (self-signed). For Play Store use `./gradlew assembleRelease` with
  a keystore.

## 3. macOS desktop (self-contained)

```bash
cd desktop
npm install
npm run prepare:server        # server dist + production node_modules + panel
npm run panel
npx electron-builder --mac zip --arm64
```

Output: `desktop/release/Bulk Repair-1.0.0-arm64-mac.zip` and
`desktop/release/mac-arm64/Bulk Repair.app`.

The app starts its own embedded server on launch. The database lives in
`~/Library/Application Support/Bulk Repair/data/bulkrepair.db`.

## 4. Windows desktop (self-contained)

```bash
cd desktop
npm install
npm run prepare:server
npm run panel
npx electron-builder --win portable --x64
```

Output: `desktop/release/BulkRepair-1.0.0-portable.exe` (x64, unsigned).

On Windows the database lives in `%APPDATA%\Bulk Repair\data\bulkrepair.db`.
No separate server install is needed; the app spawns it automatically.

## Artifacts copied for testing

`inventory-automation/dist-builds/` (ignored by git):

| File | Platform |
|---|---|
| `BulkRepair-1.0.0-android-debug.apk` | Android (debug) |
| `BulkRepair-1.0.0-macos-arm64.zip` | macOS Apple Silicon (self-contained) |
| `BulkRepair-1.0.0-windows-x64-portable.exe` | Windows x64 (self-contained) |
| `BulkRepair-1.0.0-windows-arm64-portable.exe` | Windows on ARM (self-contained) |

The desktop shells ship the UI **and** the server. The mobile APK still needs a
backend — start one with `cd server && npm run dev` (or use the desktop app's
embedded server on your LAN) and point the APK at it from Setup.

## Notes

- Builds are unsigned. macOS Gatekeeper: right-click → Open the first time.
  Windows SmartScreen: More info → Run anyway.
- The APK uses cleartext HTTP so a `http://` backend on the LAN works.
