# stop-all-node.ps1
# Stops all node processes to free up database connections

Write-Host "Stopping all node processes..." -ForegroundColor Yellow

$processes = Get-Process -Name "node" -ErrorAction SilentlyContinue

if ($processes) {
    $count = $processes.Count
    Write-Host "Found $count node process(es)" -ForegroundColor Cyan
    
    $processes | Stop-Process -Force
    Write-Host "✅ Stopped all node processes" -ForegroundColor Green
    Write-Host "⏳ Wait 10-20 seconds for database connections to close..." -ForegroundColor Yellow
} else {
    Write-Host "No node processes found" -ForegroundColor Green
}






