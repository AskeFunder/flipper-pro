# PowerShell script to check canonical performance on VM
$server = "46.101.101.26"
$user = "root"
$remotePath = "/root/flipper-pro-backend"

Write-Host "Checking Canonical Performance on VM" -ForegroundColor Green
Write-Host ""

$sshTarget = $user + "@" + $server

# Check recent performance from logs
Write-Host "Recent Performance Data:" -ForegroundColor Yellow
ssh $sshTarget "cd $remotePath && tail -5000 /root/.pm2/logs/flipperpro-scheduler-out.log | grep -E '\[PERF\].*canonical|\[CANONICAL\].*Updated.*items' | tail -10"

Write-Host ""
Write-Host "Recent Canonical Updates:" -ForegroundColor Yellow
ssh $sshTarget "cd $remotePath && node poller/view-process-logs.js 30 | grep -i canonical | tail -15"

Write-Host ""
Write-Host "Current Status:" -ForegroundColor Yellow
ssh $sshTarget "cd $remotePath && node -e `"require('dotenv').config();const db=require('./db/db');Promise.all([db.query('SELECT COUNT(*) as c FROM dirty_items'),db.query('SELECT MAX(timestamp_updated) as ts FROM canonical_items')]).then(([dirty,updated])=>{console.log('Dirty items:',dirty.rows[0].c);const ts=updated.rows[0].ts;if(ts){const age=Math.floor(Date.now()/1000)-ts;console.log('Last update:',new Date(ts*1000).toISOString(),'('+age+'s ago)');}else{console.log('No updates yet');}db.end()}).catch(e=>{console.error(e.message);process.exit(1)})\`""

Write-Host ""
Write-Host "Done!" -ForegroundColor Green



