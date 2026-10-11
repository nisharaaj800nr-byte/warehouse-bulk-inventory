@echo off
title Bulk Repair Portal (local preview)
cd /d "%~dp0app"
echo.
echo   Bulk Repair Portal:  http://localhost:4173
echo   Login page par "Explore demo (sample data)" click karein.
echo   Server band karne ke liye ye window band karein.
echo.
start "" http://localhost:4173/
node node_modules\vite\bin\vite.js preview --port 4173 --strictPort
pause
