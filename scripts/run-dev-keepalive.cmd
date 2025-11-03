@echo off
REM run-dev-keepalive.cmd
REM - Loads environment variables from .env.local (or .env) if present (will not overwrite existing system vars)
REM - Ensures dependencies installed (pnpm install) if node_modules missing
REM - Runs `pnpm dev` in a restart loop so the server is restarted automatically on crash

setlocal EnableDelayedExpansion

:: change working directory to repo root (pushd handles drive changes)
pushd "%~dp0\.." >nul 2>&1 || (cd /d "%~dp0\.." 2>nul)
set "REPO_ROOT=%CD%"

:: find env file
if exist "%REPO_ROOT%\.env.local" (
  set "ENVFILE=%REPO_ROOT%\.env.local"
) else if exist "%REPO_ROOT%\.env" (
  set "ENVFILE=%REPO_ROOT%\.env"
) else (
  set "ENVFILE="
)

:: load env file without overwriting existing system env vars
if defined ENVFILE (
  echo Loading environment variables from "%ENVFILE%" (will not overwrite existing variables)
  for /f "usebackq tokens=1* delims==" %%A in ("%ENVFILE%") do (
    set "key=%%A"
    set "val=%%B"
    rem skip comments and blank keys
    if not "!key!"=="" if not "!key:~0,1!"=="#" (
      rem trim possible spaces around key
      for /f "tokens=* delims= " %%K in ("!key!") do set "key=%%K"
      rem check if variable already exists; use CALL to expand dynamic name
      call set "_current=%%%key%%%"
      if "!_current!"=="" (
        rem set for current process only
        set "%key%=%val%"
      ) else (
        echo Skipping existing env var "%key%"
      )
      set "_current="
    )
  )
  echo Environment variables loaded.
) else (
  echo No .env.local or .env found in repo root. Continuing without loading.
)

:ensure_deps
if not exist "node_modules" (
  echo node_modules not found. Installing dependencies with pnpm...
  pnpm install
  if errorlevel 1 (
    echo pnpm install failed. Waiting 10s then retrying...
    timeout /t 10 /nobreak >nul
    goto ensure_deps
  )
)

:run_loop
echo Starting dev server in "%CD%" (press Ctrl+C to stop)...
pnpm dev
set "EXITCODE=%ERRORLEVEL%"
echo Dev server exited with code %EXITCODE%. Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto run_loop

:: restore directory stack and exit
popd >nul 2>&1
endlocal
