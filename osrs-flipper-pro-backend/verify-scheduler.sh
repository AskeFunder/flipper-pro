#!/bin/bash

# Script to verify scheduler is running correctly
# Run this on your VM: bash verify-scheduler.sh

set -e

echo "🔍 Verifying FlipperPro Scheduler..."

# Navigate to backend directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check PM2 status
echo ""
echo "📊 PM2 Status:"
echo "=============="
pm2 status

# Check if scheduler is running
if pm2 list | grep -q "flipperpro-scheduler.*online"; then
    echo ""
    echo "✅ flipperpro-scheduler is ONLINE"
else
    echo ""
    echo "❌ flipperpro-scheduler is NOT running or not online"
    exit 1
fi

# Get scheduler info
echo ""
echo "📋 Scheduler Details:"
echo "==================="
pm2 describe flipperpro-scheduler

# Check logs for production mode confirmation
echo ""
echo "📝 Checking logs for production mode confirmation..."
echo "=================================================="
LOG_OUTPUT=$(pm2 logs flipperpro-scheduler --lines 100 --nostream)

if echo "$LOG_OUTPUT" | grep -q "PRODUCTION MODE"; then
    echo "✅ Production mode confirmed"
else
    echo "⚠️  Production mode message not found in logs"
fi

if echo "$LOG_OUTPUT" | grep -q "poll-latest"; then
    echo "✅ poll-latest is enabled"
else
    echo "⚠️  poll-latest not found in logs"
fi

if echo "$LOG_OUTPUT" | grep -q "poll-granularities"; then
    echo "✅ poll-granularities is enabled"
else
    echo "⚠️  poll-granularities not found in logs"
fi

if echo "$LOG_OUTPUT" | grep -q "update-canonical-items"; then
    echo "✅ update-canonical-items is enabled"
else
    echo "⚠️  update-canonical-items not found in logs"
fi

if echo "$LOG_OUTPUT" | grep -q "cleanup-timeseries"; then
    echo "✅ cleanup-timeseries is enabled"
else
    echo "⚠️  cleanup-timeseries not found in logs"
fi

if echo "$LOG_OUTPUT" | grep -q "backfill-timeseries.*DISABLED"; then
    echo "✅ backfill-timeseries is DISABLED (correct)"
else
    echo "⚠️  backfill-timeseries status unclear"
fi

# Test PM2 reload
echo ""
echo "🔄 Testing PM2 reload (scheduler should survive)..."
pm2 reload flipperpro-scheduler
sleep 2

if pm2 list | grep -q "flipperpro-scheduler.*online"; then
    echo "✅ Scheduler survived reload"
else
    echo "❌ Scheduler did not survive reload"
    exit 1
fi

echo ""
echo "✅ Verification complete!"
echo ""
echo "Recent logs:"
pm2 logs flipperpro-scheduler --lines 20 --nostream






