# PowerShell script to SSH into VM and restart scheduler
# This will prompt for password

$server = "46.101.101.26"
$user = "root"
$remotePath = "/root/osrs-flipper-pro-backend"

Write-Host "🚀 Connecting to VM and restarting scheduler..." -ForegroundColor Green
Write-Host "Server: $user@$server" -ForegroundColor Cyan
Write-Host ""

# Commands to run on remote server
$commands = @"
cd $remotePath

echo "🔄 Quick Restart..."
# Kill all
pm2 stop all 2>/dev/null; pm2 delete all 2>/dev/null
pkill -9 node 2>/dev/null
rm -rf .locks/* 2>/dev/null
sleep 3

# Start scheduler
pm2 start poller/scheduler.js --name flipperpro-scheduler
sleep 2

# Show status
pm2 status

echo ""
echo "✅ Restart complete!"
echo ""
echo "📊 Check logs in 10 minutes:"
echo "   node poller/view-process-logs.js"
"@

# Execute commands via SSH
Write-Host "Connecting to server..." -ForegroundColor Yellow
Write-Host "You will be prompted for password" -ForegroundColor Yellow
Write-Host ""

ssh "$user@$server" $commands

Write-Host ""
Write-Host "✅ Remote restart completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📈 In 10 minutes, run on VM:" -ForegroundColor Yellow
Write-Host "   node poller/view-process-logs.js" -ForegroundColor Cyan
Write-Host ""

