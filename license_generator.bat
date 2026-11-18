@echo off
cd /d "%~dp0"
chcp 65001 > nul
title Smart Ledger Pro - License generator
:again
echo.
node tools\license\generate.cjs
echo.
set /p more=Generate another key? (y/n): 
if /i "%more%"=="y" goto again
