# PowerShell script to check canonical performance on VM
$server = "46.101.101.26"
$user = "root"
$remotePath = "/root/osrs-flipper-pro-backend"

Write-Host "⏱️  Checking Canonical Performance on VM" -ForegroundColor Green
Write-Host ""

$commands = @"
cd $remotePath

echo "=========================================="
echo "⏱️  CANONICAL UPDATE PERFORMANCE"
echo "=========================================="
echo ""

# Get dirty items count
DIRTY=\$(psql \$DATABASE_URL -t -c "SELECT COUNT(*) FROM dirty_items" 2>/dev/null | xargs)
TOTAL=\$(psql \$DATABASE_URL -t -c "SELECT COUNT(*) FROM canonical_items" 2>/dev/null | xargs)

echo "📊 Current Status:"
echo "   Total items: \$TOTAL"
echo "   Dirty items: \$DIRTY"
echo ""

# Calculate estimates
node -e "
const dirty = parseInt('$DIRTY');
const total = parseInt('$TOTAL');

const itemsPerSecond = 1500; // Conservative estimate
const estimatedSeconds = dirty / itemsPerSecond;

console.log('⏱️  Performance Estimates:');
console.log('   Items/second: ~' + itemsPerSecond.toLocaleString() + ' (conservative)');
console.log('   Estimated time: ' + estimatedSeconds.toFixed(2) + 's');
console.log('');

console.log('📈 Real-world Scenarios:');
console.log('   Small (50 items): ~' + (50 / itemsPerSecond).toFixed(2) + 's');
console.log('   Medium (300 items): ~' + (300 / itemsPerSecond).toFixed(2) + 's');
console.log('   Large (1000 items): ~' + (1000 / itemsPerSecond).toFixed(2) + 's');
console.log('   Very large (3000 items): ~' + (3000 / itemsPerSecond).toFixed(2) + 's');
console.log('   Full refresh (' + total + ' items): ~' + (total / itemsPerSecond).toFixed(2) + 's');
"

echo ""
echo "🔄 Scheduler Frequency:"
if [ "\$DIRTY" -eq 0 ]; then
    echo "   Every 60 seconds"
elif [ "\$DIRTY" -le 200 ]; then
    echo "   Every 30 seconds"
elif [ "\$DIRTY" -le 1000 ]; then
    echo "   Every 15 seconds"
else
    echo "   Every 30 seconds"
fi

echo ""
echo "💡 Recent performance from logs:"
echo "   (Check: node poller/view-process-logs.js | grep PERF)"
echo ""
"@

ssh "$user@$server" $commands

Write-Host ""
Write-Host "✅ Done!" -ForegroundColor Green



