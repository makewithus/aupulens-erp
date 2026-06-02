@echo off
setlocal enabledelayedexpansion

echo.
echo ========================================
echo  Electron Setup Verification
echo ========================================
echo.

set "ALL_OK=1"

echo Checking dependencies...
echo.

REM Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Node.js - NOT FOUND
    set "ALL_OK=0"
) else (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
    echo [OK] Node.js - !NODE_VER!
)

REM Check npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] npm - NOT FOUND
    set "ALL_OK=0"
) else (
    for /f "tokens=*" %%i in ('npm --version') do set NPM_VER=%%i
    echo [OK] npm - v!NPM_VER!
)

REM Check if node_modules exists
if exist "node_modules\" (
    echo [OK] node_modules - Installed
) else (
    echo [X] node_modules - NOT FOUND
    echo     Run: npm install
    set "ALL_OK=0"
)

REM Check Electron files
if exist "electron\main.js" (
    echo [OK] electron/main.js - Present
) else (
    echo [X] electron/main.js - MISSING
    set "ALL_OK=0"
)

if exist "electron\preload.js" (
    echo [OK] electron/preload.js - Present
) else (
    echo [X] electron/preload.js - MISSING
    set "ALL_OK=0"
)

REM Check package.json scripts
findstr /c:"electron:dev" package.json >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] package.json - Scripts configured
) else (
    echo [X] package.json - Scripts missing
    set "ALL_OK=0"
)

echo.
echo ========================================

if "%ALL_OK%"=="1" (
    echo.
    echo ^[SUCCESS^] All checks passed!
    echo.
    echo You can now run:
    echo   npm run electron:dev
    echo.
) else (
    echo.
    echo ^[ERROR^] Some checks failed!
    echo.
    echo Please fix the issues above before running.
    echo.
)

echo ========================================
echo.

pause
