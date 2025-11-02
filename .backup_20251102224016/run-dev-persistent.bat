@echo off
setlocal enabledelayedexpansion

echo ===============================================
echo   LexDiff Dev Server - Persistent Console Mode
echo ===============================================
echo.

REM Ensure .env.local exists (create from example or scaffold if needed)
if not exist ".env.local" (
  if exist ".env.local.example" (
    echo [.env] No .env.local found. Creating from .env.local.example
    copy /Y ".env.local.example" ".env.local" >nul
  ) else (
    echo [.env] No .env.local or example found. Creating minimal placeholder.
    > ".env.local" echo LAW_OC=your_api_key_here
    >> ".env.local" echo GEMINI_API_KEY=your_gemini_api_key_here
  )
  echo.
)

REM Load environment variables from .env.local (skip comments / blanks)
if exist ".env.local" (
  for /f "usebackq tokens=1,* delims== " %%A in (".env.local") do (
    set "_key=%%A"
    set "_val=%%B"
    if not "!_key!"=="" if not "!_key:~0,1!"=="#" (
      set "!_key!=!_val!"
    )
  )
)

if "%LAW_OC%"=="" (
  echo [warn] LAW_OC is not set. API routes that call law.go.kr will fail.
)
if "%GEMINI_API_KEY%"=="" (
  echo [warn] GEMINI_API_KEY is not set. AI summary features will be disabled.
)
echo.

echo [dev] Starting Next.js dev server (npm run dev)...
echo.

REM Proactively stop any previous dev server on port 3000 (to avoid Next lock)
echo [dev] Ensuring no previous dev server is running on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000"') do (
  echo   - Killing PID %%a
  taskkill /PID %%a /F >nul 2>&1
)

REM Clean stale lock if present
if exist ".next\dev\lock" (
  echo [dev] Removing stale lock file: .next\dev\lock
  del /F /Q ".next\dev\lock" >nul 2>&1
)

call npm run dev
set "_exitCode=%ERRORLEVEL%"

echo.
if "%_exitCode%"=="0" (
  echo [info] Dev server exited normally.
) else (
  echo [error] Dev server terminated with exit code %_exitCode%.
)

echo.
echo Press any key to close this window. Logs remain above for review.
pause >nul

endlocal & exit /b %_exitCode%
