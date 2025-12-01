# PowerShell script to check process logs on VM via SSH
# Usage: .\scripts\check-vm-logs.ps1 [ssh_host] [hours]
# Example: .\scripts\check-vm-logs.ps1 user@vm.example.com 24

param(
    [string]$SshHost = "user@your-vm.com",
    [int]$Hours = 24
)

$VmPath = "~/osrs-flipper-pro-backend"

Write-Host "🔍 Checking process logs on VM: $SshHost" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if log file exists
Write-Host "📁 Checking if log file exists..." -ForegroundColor Yellow
$logExists = ssh "$SshHost" "test -f $VmPath/logs/process-execution.log.json && echo 'EXISTS' || echo 'NOT_EXISTS'"
if ($logExists -eq "EXISTS") {
    Write-Host "✅ Log file exists" -ForegroundColor Green
} else {
    Write-Host "❌ Log file does not exist" -ForegroundColor Red
}

Write-Host ""
Write-Host "📊 Process Execution Report:" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
ssh "$SshHost" "cd $VmPath && node poller/view-process-logs.js $Hours"

Write-Host ""
Write-Host ""
Write-Host "🏥 Health Check:" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
ssh "$SshHost" "cd $VmPath && node poller/check-process-health.js $Hours"





