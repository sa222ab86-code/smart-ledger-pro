@echo off
cd /d "%~dp0"
chcp 65001 > nul
title Smart Ledger Pro - Create license keys (one time)
echo Creates your private signing key (kept in %USERPROFILE%\SmartLedgerLicense) and the public key inside the app.
echo Run this ONCE, back up the private key, then build the app.
echo.
node tools\license\keygen.cjs
echo.
pause
