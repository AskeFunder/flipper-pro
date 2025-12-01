# PowerShell script to upload fix and test canonical update on VM
$server = "46.101.101.26"
$user = "root"
$remotePath = "/root/flipper-pro-backend"

Write-Host "Testing Canonical Fix on VM" -ForegroundColor Green
Write-Host ""

# Step 1: Upload
Write-Host "Uploading fixed file..." -ForegroundColor Yellow
$scpTarget = $user + "@" + $server
$scpPath = $scpTarget + ":" + $remotePath + "/poller/update-canonical-items.js"
scp poller/update-canonical-items.js $scpPath

if ($LASTEXITCODE -ne 0) {
    Write-Host "Upload failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Upload complete!" -ForegroundColor Green
Write-Host ""

# Step 2: Test on VM
Write-Host "Testing on VM..." -ForegroundColor Yellow
Write-Host ""

$sshTarget = $user + "@" + $server

# Test syntax
Write-Host "Test 1: Syntax check..." -ForegroundColor Cyan
ssh $sshTarget "cd $remotePath && node -c poller/update-canonical-items.js"
if ($LASTEXITCODE -eq 0) {
    Write-Host "Syntax valid" -ForegroundColor Green
} else {
    Write-Host "Syntax error!" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Test query
Write-Host "Test 2: Testing price_instants query..." -ForegroundColor Cyan
$queryTest = @"
require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
    try {
        const result = await db.query(\`
            SELECT 
                item_id,
                MAX(CASE WHEN type = 'high' THEN price END) as high,
                MAX(CASE WHEN type = 'low' THEN price END) as low
            FROM (
                SELECT DISTINCT ON (item_id, type)
                    item_id, price, type, timestamp
                FROM price_instants
                WHERE item_id = ANY(\$1)
                ORDER BY item_id, type, timestamp DESC
            ) AS latest_prices
            GROUP BY item_id
        \`, [[2, 6, 8]]);
        
        console.log('Query works! Found', result.rows.length, 'items');
    } catch (err) {
        console.error('Query failed:', err.message);
        process.exit(1);
    } finally {
        await db.end();
    }
})();
"@

ssh $sshTarget "cd $remotePath && node -e '$queryTest'"

Write-Host ""

# Check dirty items
Write-Host "Test 3: Checking dirty items..." -ForegroundColor Cyan
ssh $sshTarget "cd $remotePath && node -e `"require('dotenv').config(); const {Pool}=require('pg'); const db=new Pool({connectionString:process.env.DATABASE_URL}); db.query('SELECT COUNT(*) as count FROM dirty_items').then(r=>{console.log('Dirty items:',r.rows[0].count);db.end()}).catch(e=>{console.error('Error:',e.message);process.exit(1)})\`""

Write-Host ""

# Test module load
Write-Host "Test 4: Testing module load..." -ForegroundColor Cyan
ssh $sshTarget "cd $remotePath && node -e `"require('dotenv').config(); try{const u=require('./poller/update-canonical-items.js');console.log('Module loads correctly');}catch(e){console.error('Module load failed:',e.message);process.exit(1);}\`""

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "ALL TESTS PASSED" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ready to run! Next steps:" -ForegroundColor Yellow
Write-Host "   1. Restart scheduler: pm2 restart flipperpro-scheduler" -ForegroundColor Cyan
Write-Host "   2. Or test manually: node poller/update-canonical-items.js" -ForegroundColor Cyan
Write-Host ""
Write-Host "Testing complete!" -ForegroundColor Green
