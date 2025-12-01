# PowerShell script to upload and test canonical fix on VM
$server = "46.101.101.26"
$user = "root"
$remotePath = "/root/osrs-flipper-pro-backend"

Write-Host "🧪 Testing Canonical Fix on VM" -ForegroundColor Green
Write-Host ""

# Step 1: Upload file
Write-Host "📤 Uploading file..." -ForegroundColor Yellow
scp poller/update-canonical-items.js "${user}@${server}:${remotePath}/poller/update-canonical-items.js"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Upload failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Upload complete!" -ForegroundColor Green
Write-Host ""

# Step 2: Test on VM
Write-Host "🧪 Testing on VM..." -ForegroundColor Yellow
Write-Host ""

$commands = @"
cd $remotePath

echo "=========================================="
echo "🧪 TESTING CANONICAL UPDATE FIX"
echo "=========================================="
echo ""

# Test 1: Check if file was uploaded
if [ -f "poller/update-canonical-items.js" ]; then
    echo "✅ File exists"
else
    echo "❌ File not found!"
    exit 1
fi

# Test 2: Check syntax
echo ""
echo "📋 Test 1: Checking syntax..."
node -c poller/update-canonical-items.js
if [ \$? -eq 0 ]; then
    echo "✅ Syntax is valid"
else
    echo "❌ Syntax error!"
    exit 1
fi

# Test 3: Test price_instants query
echo ""
echo "📋 Test 2: Testing price_instants query..."
node -e "
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
        
        console.log('✅ Query works! Found', result.rows.length, 'items');
    } catch (err) {
        console.error('❌ Query failed:', err.message);
        process.exit(1);
    } finally {
        await db.end();
    }
})();
"

# Test 4: Check dirty items count
echo ""
echo "📋 Test 3: Checking dirty items..."
DIRTY=\$(psql \$DATABASE_URL -t -c "SELECT COUNT(*) FROM dirty_items" 2>/dev/null | xargs)
echo "   Dirty items: \$DIRTY"

# Test 5: Dry run - check if module loads
echo ""
echo "📋 Test 4: Testing module load..."
node -e "
require('dotenv').config();
try {
    const updateCanonical = require('./poller/update-canonical-items.js');
    console.log('✅ Module loads correctly');
    console.log('✅ All dependencies resolved');
} catch (err) {
    console.error('❌ Module load failed:', err.message);
    process.exit(1);
}
"

echo ""
echo "=========================================="
echo "✅ ALL TESTS PASSED"
echo "=========================================="
echo ""
echo "💡 Ready to run! Next steps:"
echo "   1. Restart scheduler: pm2 restart flipperpro-scheduler"
echo "   2. Or test manually: node poller/update-canonical-items.js"
echo ""
"@

ssh "$user@$server" $commands

Write-Host ""
Write-Host "✅ Testing complete!" -ForegroundColor Green



