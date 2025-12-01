# PowerShell script to deploy scheduler via PM2 on production VM
# Run this script and enter password when prompted

$server = "46.101.101.26"
$user = "root"
$remotePath = "/root/osrs-flipper-pro-backend"

Write-Host "🚀 Deploying FlipperPro Scheduler to production VM..." -ForegroundColor Green
Write-Host "Server: $user@$server" -ForegroundColor Cyan
Write-Host ""

# Commands to run on remote server
$commands = @"
cd $remotePath

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

# Check current PM2 status
echo ""
echo "📊 Current PM2 status:"
pm2 status

# Stop scheduler if already running
if pm2 list | grep -q "flipperpro-scheduler"; then
    echo ""
    echo "🛑 Stopping existing flipperpro-scheduler..."
    pm2 stop flipperpro-scheduler
    pm2 delete flipperpro-scheduler
fi

# Start scheduler with PM2
echo ""
echo "✅ Starting flipperpro-scheduler..."
pm2 start poller/scheduler.js --name flipperpro-scheduler

# Wait a moment
sleep 2

# Show status
echo ""
echo "📊 PM2 Status after startup:"
pm2 status

# Show recent logs
echo ""
echo "📋 Recent scheduler logs (last 30 lines):"
pm2 logs flipperpro-scheduler --lines 30 --nostream

echo ""
echo "✅ Scheduler deployment complete!"
"@

# Execute commands via SSH
Write-Host "Connecting to server and executing commands..." -ForegroundColor Yellow
Write-Host "You will be prompted for password: STRONG_PASSWORD" -ForegroundColor Yellow
Write-Host ""

ssh "$user@$server" $commands

Write-Host ""
Write-Host "✅ Deployment script completed!" -ForegroundColor Green






