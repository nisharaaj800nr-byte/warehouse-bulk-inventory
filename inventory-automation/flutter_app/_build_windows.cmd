@echo off
cd /d "%~dp0"
call "C:\flutter\bin\flutter.bat" build windows --debug > build-windows.log 2>&1
echo BUILD_DONE_EXIT_%ERRORLEVEL% >> build-windows.log
