@echo off
cd /d "%~dp0"
chcp 65001 > nul
title Smart Ledger Pro - Check license keys
node tools\license\doctor.cjs
echo.
pause
