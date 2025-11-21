@echo off
REM LexDiff Log Viewer Server Launcher
REM This starts the independent log viewer on port 3002

echo.
echo ================================================
echo  LexDiff Log Viewer Server
echo ================================================
echo.
echo Starting log viewer server on port 3002...
echo Log viewer will be available at:
echo   http://localhost:3002/log-viewer.html
echo.
echo This server will:
echo   - Monitor Next.js dev server (port 3000)
echo   - Collect and stream logs via SSE
echo   - Survive Next.js server restarts
echo.
echo Press Ctrl+C to stop the log viewer server
echo ================================================
echo.

node scripts/log-viewer-server.mjs
