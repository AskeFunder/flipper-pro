# PowerShell script to completely restart scheduler with fresh state
# Kills all processes, cleans up, and restarts scheduler
# Run this locally or on Windows

Write-Host "🔄 Fresh Restart of FlipperPro Scheduler" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""

# Step 1: Stop all node processes
Write-Host "🔪 Step 1: Stopping all node processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    $count = $nodeProcesses.Count
    Write-Host "   Found $count node process(es)" -ForegroundColor Cyan
    $nodeProcesses | Stop-Process -Force
    Start-Sleep -Seconds 2
    Write-Host "✅ All node processes stopped" -ForegroundColor Green
} else {
    Write-Host "   No node processes found" -ForegroundColor Gray
}

# Step 2: Clean up lock files
Write-Host ""
Write-Host "🧹 Step 2: Cleaning up lock files..." -ForegroundColor Yellow
$locksDir = Join-Path $PSScriptRoot ".locks"
if (Test-Path $locksDir) {
    Get-ChildItem $locksDir -File | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Host "✅ Lock files cleaned" -ForegroundColor Green
} else {
    Write-Host "   No .locks directory found" -ForegroundColor Gray
}

# Step 3: Wait for database connections to close
Write-Host ""
Write-Host "⏳ Step 3: Waiting 5 seconds for database connections to close..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Step 4: Check system resources
Write-Host ""
Write-Host "💻 Step 4: System resources:" -ForegroundColor Yellow
$mem = Get-CimInstance Win32_OperatingSystem
$totalMem = [math]::Round($mem.TotalVisibleMemorySize / 1MB, 2)
$freeMem = [math]::Round($mem.FreePhysicalMemory / 1MB, 2)
$usedMem = $totalMem - $freeMem
$memPercent = [math]::Round(($usedMem / $totalMem) * 100, 1)
Write-Host "   Memory: $usedMem GB / $totalMem GB used ($memPercent%)" -ForegroundColor Cyan

# Step 5: Instructions for starting scheduler
Write-Host ""
Write-Host "🚀 Step 5: To start scheduler, run one of:" -ForegroundColor Yellow
Write-Host "   npm run scheduler" -ForegroundColor Cyan
Write-Host "   node poller/scheduler.js" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Or on Linux VM:" -ForegroundColor Yellow
Write-Host "   bash restart-scheduler-fresh.sh" -ForegroundColor Cyan
Write-Host ""

Write-Host "✅ Fresh restart preparation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📈 View process logs (after scheduler starts):" -ForegroundColor Yellow
Write-Host "   node poller/view-process-logs.js" -ForegroundColor Cyan
Write-Host ""





