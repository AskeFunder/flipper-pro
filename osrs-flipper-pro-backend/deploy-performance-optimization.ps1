# PowerShell script to deploy performance optimizations to VM
$server = "46.101.101.26"
$user = "root"
$remotePath = "/root/flipper-pro-backend"

Write-Host "Deploying Performance Optimizations to VM" -ForegroundColor Green
Write-Host ""

# Files to upload
$files = @(
    "poller/update-canonical-items.js",
    "db/db.js"
)

$sshTarget = $user + "@" + $server

foreach ($file in $files) {
    Write-Host "Uploading $file..." -ForegroundColor Yellow
    $scpPath = $sshTarget + ":" + $remotePath + "/" + $file
    scp $file $scpPath
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Upload failed for $file!" -ForegroundColor Red
        exit 1
    }
    Write-Host "Uploaded $file" -ForegroundColor Green
}

Write-Host ""
Write-Host "Verifying files on VM..." -ForegroundColor Yellow

# Verify files
ssh $sshTarget "cd $remotePath && echo 'Checking files...' && ls -lh poller/update-canonical-items.js db/db.js && echo '' && echo 'Testing syntax...' && node -c poller/update-canonical-items.js && node -c db/db.js && echo 'Syntax OK'"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Files verified successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Restart scheduler: pm2 restart flipperpro-scheduler" -ForegroundColor Cyan
    Write-Host "  2. Monitor performance: pm2 logs flipperpro-scheduler | grep PERF" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Expected improvements:" -ForegroundColor Yellow
    Write-Host "  - Batch size: 600 -> 1000" -ForegroundColor Gray
    Write-Host "  - Concurrency: 6 -> 12" -ForegroundColor Gray
    Write-Host "  - DB Pool: 15 -> 30" -ForegroundColor Gray
    Write-Host "  - Expected: 3-5x performance improvement" -ForegroundColor Gray
} else {
    Write-Host "Verification failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Deployment complete!" -ForegroundColor Green



