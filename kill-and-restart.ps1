# Kill all node processes and restart dev server
Write-Host "Killing all node processes..."
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host "Starting dev server..."
npm run dev
