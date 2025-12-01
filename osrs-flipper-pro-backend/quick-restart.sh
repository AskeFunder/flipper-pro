#!/bin/bash
# Quick restart script - kills everything and restarts scheduler

echo "🔄 Quick Restart..."
cd /root/osrs-flipper-pro-backend || exit 1

# Kill all
pm2 stop all 2>/dev/null; pm2 delete all 2>/dev/null
pkill -9 node 2>/dev/null
rm -rf .locks/* 2>/dev/null
sleep 3

# Start
pm2 start poller/scheduler.js --name flipperpro-scheduler
sleep 2

# Status
pm2 status
echo ""
echo "✅ Restart complete! Check logs in 10 minutes:"
echo "   node poller/view-process-logs.js"





