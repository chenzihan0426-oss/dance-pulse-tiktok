@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-mobile.ps1" -SecureTunnel -NoBrowser
if errorlevel 1 pause
