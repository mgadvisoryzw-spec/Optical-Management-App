@echo off
title OptiVault server
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist ".env" (
  echo First run: creating the .env configuration file...
  copy ".env.example" ".env" >nul || goto :failed
  for /f %%A in ('powershell -NoProfile -Command "[Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')"') do set "GENSECRET=%%A"
  powershell -NoProfile -Command "(Get-Content '.env') -replace '^AUTH_SECRET=.*', ('AUTH_SECRET=\"' + $env:GENSECRET + '\"') | Set-Content '.env'" || goto :failed
)

if not exist "node_modules" (
  echo First run: installing dependencies. This can take a few minutes...
  call npm install || goto :failed
)

if not exist "prisma\dev.db" (
  echo Creating the database and loading the demo practice...
  call npm run db:push || goto :failed
  call npm run db:seed || goto :failed
)

if not exist ".next\BUILD_ID" (
  echo Building the app. This takes about a minute...
  call npm run build || goto :failed
)

echo.
echo OptiVault is starting at http://localhost:3000
echo Demo login: owner@demo-optical.co.zw / demo1234
echo Close this window to stop the server.
echo.
echo NOTE: this launcher runs OptiVault against a database file on THIS computer,
echo so logins created here do not work on other machines. To share one database
echo across every computer, see DEPLOYMENT.md.
echo.
start "" http://localhost:3000
call npm start
goto :eof

:failed
echo.
echo Something went wrong. Read the messages above, or send them to Claude.
pause
exit /b 1
