@echo off
setlocal enabledelayedexpansion

echo Stopping any process on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000"') do (
  echo Killing PID %%a
  taskkill /PID %%a /F >nul 2>&1
)

echo Starting dev server in background (npm run dev)...
start "" /B cmd /c "npm run dev"

echo Done. Visit: http://localhost:3000
endlocal
