@echo off
title TekhCommerce
cd /d "%~dp0"

if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install from https://nodejs.org
  pause
  exit /b 1
)

echo ========================================
echo   TekhCommerce  (React + Express)
echo   Store:  http://localhost:5200
echo   API:    http://127.0.0.1:5010
echo ========================================
echo.
echo Flask app.py is frozen legacy. Do not start it.
echo Local data: server\data\demo  (live JSON is unused)
echo Keep this window open while using the app.
echo.

set NODE_ENV=development
set TEKH_DATA=demo

if not exist "node_modules\" call npm install
if not exist "server\node_modules\" call npm install --prefix server
if not exist "client\node_modules\" call npm install --prefix client

start "" cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:5200"

npm run dev
goto :eof
