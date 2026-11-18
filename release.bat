@echo off
cd /d "%~dp0"
chcp 65001 > nul
title Smart Ledger Pro - Publish release to GitHub
color 0B

net session >nul 2>&1
if %errorlevel% equ 0 goto is_admin
echo Requesting administrator permission, please click Yes...
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b

:is_admin
cls
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
set CSC_IDENTITY_AUTO_DISCOVERY=false

echo ===================================================================
echo   Smart Ledger Pro - build and upload a new release to GitHub
echo ===================================================================
echo.
node -v >nul 2>&1
if %errorlevel% equ 0 goto node_ok
color 0C
echo [ERROR] Node.js was not found. Install it from https://nodejs.org then run again.
pause
exit /b

:node_ok
for /f %%v in ('node -p "require('./package.json').version"') do set VER=%%v
echo Version in package.json: %VER%
echo This number must be HIGHER than the version installed on the device,
echo otherwise the update will not appear. Edit "version" in package.json if needed.
echo.

if defined GH_TOKEN goto have_token
echo Paste your GitHub token then press Enter.
echo The token is used only inside this window and is NOT saved on disk.
echo Fine-grained token: Contents = Read and write on smart-ledger-pro-releases
echo [the repository that installed copies read their updates from]
echo.
set /p GH_TOKEN=Token: 
if not defined GH_TOKEN (
  echo No token entered.
  pause
  exit /b
)

:have_token
echo.
echo [1/3] Cleaning old files...
taskkill /F /IM "Smart Ledger Pro.exe" >nul 2>&1
if exist dist rmdir /s /q dist
if exist release rmdir /s /q release
if exist "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"

echo [2/3] Installing dependencies...
call npm install
if %errorlevel% neq 0 call npm install --registry=https://registry.npmmirror.com

echo [3/3] Building and uploading to GitHub...
:: License: the public key must be inside the app. First time only: creates your private key in %USERPROFILE%\SmartLedgerLicense
if not exist "electron\license-public.pem" (
  echo [License] Creating license signing keys for the first time...
  node tools\license\keygen.cjs
  echo [License] IMPORTANT: back up the folder %USERPROFILE%\SmartLedgerLicense
)
if not exist "electron\license-public.pem" (
  echo [ERROR] License public key is missing. Run make_license_keys.bat
  pause
  exit /b
)
call npm run release
if %errorlevel% equ 0 goto success

echo.
echo [WARNING] Failed, retrying without download mirrors...
set ELECTRON_MIRROR=
set ELECTRON_BUILDER_BINARIES_MIRROR=
call npm run release
if %errorlevel% equ 0 goto success

color 0C
echo.
echo ===================================================================
echo [ERROR] Release failed. Common reasons:
echo ===================================================================
echo 1. Token wrong, expired, or without "Contents: Read and write" on
echo    smart-ledger-pro-releases [401 or 403].
echo 2. Repository name or owner in package.json does not match GitHub.
echo 3. A release with the same version already exists on GitHub: raise the
echo    version number in package.json and run again.
echo 4. Slow internet or antivirus blocking the builder.
echo.
pause
exit /b

:success
cls
color 0A
echo ===================================================================
echo [SUCCESS] Release %VER% was uploaded and PUBLISHED on GitHub.
echo ===================================================================
echo.
echo Installed copies will find this update automatically within a few hours
echo [or via the menu: Help - Check for updates].
echo.
echo Press any key to open the releases page...
pause > nul
start https://github.com/sa222ab86-code/smart-ledger-pro-releases/releases
exit /b
