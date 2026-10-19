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

## 3. macOS desktop

```bash
cd desktop
npm install
npm run panel
npx electron-builder --mac zip --arm64
```

Output: `desktop/release/Bulk Repair-1.0.0-arm64-mac.zip` and
`desktop/release/mac-arm64/Bulk Repair.app`.

## 4. Windows desktop

```bash
cd desktop
npx electron-builder --win portable --x64
```

Output: `desktop/release/BulkRepair-1.0.0-portable.exe` (x64, unsigned).

## Artifacts copied for testing

`inventory-automation/dist-builds/` (ignored by git):

| File | Platform |
|---|---|
| `BulkRepair-1.0.0-android-debug.apk` | Android (debug) |
| `BulkRepair-1.0.0-macos-arm64.zip` | macOS Apple Silicon |
| `BulkRepair-1.0.0-windows-x64-portable.exe` | Windows x64 |
| `BulkRepair-1.0.0-windows-arm64-portable.exe` | Windows on ARM |

The desktop and mobile shells only ship the UI. Start the backend separately
(`cd server && npm run dev`, default `http://localhost:5000`) and point the app
at it from the Setup/Connection screen.

## Notes

- Builds are unsigned. macOS Gatekeeper: right-click → Open the first time.
  Windows SmartScreen: More info → Run anyway.
- The APK uses cleartext HTTP so a `http://` backend on the LAN works.
