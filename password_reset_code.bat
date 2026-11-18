@echo off
cd /d "%~dp0"
chcp 65001 > nul
title Smart Ledger Pro - Password reset code
:again
echo.
node tools\license\reset-code.cjs
echo.
set /p more=Another code? (y/n): 
if /i "%more%"=="y" goto again
