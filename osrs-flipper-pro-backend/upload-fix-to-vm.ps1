# PowerShell script to upload the fixed update-canonical-items.js to VM
# This will prompt for password

$server = "46.101.101.26"
$user = "root"
$remotePath = "/root/osrs-flipper-pro-backend"
$localFile = "poller/update-canonical-items.js"
$remoteFile = "$remotePath/poller/update-canonical-items.js"

Write-Host "📤 Uploading fixed update-canonical-items.js to VM..." -ForegroundColor Green
Write-Host "Server: $user@$server" -ForegroundColor Cyan
Write-Host "Local: $localFile" -ForegroundColor Cyan
Write-Host "Remote: $remoteFile" -ForegroundColor Cyan
Write-Host ""

# Check if local file exists
if (-not (Test-Path $localFile)) {
    Write-Host "❌ Error: Local file not found: $localFile" -ForegroundColor Red
    exit 1
}

Write-Host "Uploading file..." -ForegroundColor Yellow
Write-Host "You will be prompted for password" -ForegroundColor Yellow
Write-Host ""

# Upload file using SCP
scp $localFile "${user}@${server}:${remoteFile}"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ File uploaded successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Next steps on VM:" -ForegroundColor Yellow
    Write-Host "   1. SSH into VM: ssh $user@$server" -ForegroundColor Cyan
    Write-Host "   2. Restart scheduler: pm2 restart flipperpro-scheduler" -ForegroundColor Cyan
    Write-Host "   OR run manually: node poller/update-canonical-items.js" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Upload failed!" -ForegroundColor Red
    Write-Host "Make sure you have SSH access and SCP installed" -ForegroundColor Yellow
    exit 1
}



