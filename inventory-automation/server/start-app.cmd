@echo off
REM Starts the Bulk Repair app (API + panel) on http://localhost:5050
cd /d "%~dp0"
set DB_PATH=.\data\bulkrepair.db
set PORT=5050
if not exist "dist\index.js" (
  echo Build not found. Running npm run build...
  call npm run build || goto :error
)
echo Starting Bulk Repair on http://localhost:5050
node dist\index.js
goto :eof

:error
echo Build failed.
pause
