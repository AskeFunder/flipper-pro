#!/bin/bash

# Script to completely restart scheduler with fresh state
# Kills all processes, cleans up, and restarts scheduler with PM2
# Run this on your VM: bash restart-scheduler-fresh.sh

set -e

echo "🔄 Fresh Restart of FlipperPro Scheduler"
echo "=========================================="
echo ""

# Navigate to backend directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Step 1: Stop all PM2 processes
echo "📊 Step 1: Stopping all PM2 processes..."
if command -v pm2 &> /dev/null; then
    pm2 stop all 2>/dev/null || true
    pm2 delete all 2>/dev/null || true
    echo "✅ PM2 processes stopped"
else
    echo "⚠️  PM2 not found, skipping..."
fi

# Step 2: Kill all node processes (including hængende ones)
echo ""
echo "🔪 Step 2: Killing all node processes..."
NODE_PIDS=$(pgrep -f node 2>/dev/null || true)
if [ -n "$NODE_PIDS" ]; then
    echo "   Found node processes: $NODE_PIDS"
    kill -9 $NODE_PIDS 2>/dev/null || true
    sleep 2
    echo "✅ All node processes killed"
else
    echo "   No node processes found"
fi

# Step 3: Clean up lock files
echo ""
echo "🧹 Step 3: Cleaning up lock files..."
if [ -d ".locks" ]; then
    rm -rf .locks/* 2>/dev/null || true
    echo "✅ Lock files cleaned"
else
    echo "   No .locks directory found"
fi

# Step 4: Wait for database connections to close
echo ""
echo "⏳ Step 4: Waiting 5 seconds for database connections to close..."
sleep 5

# Step 5: Check system resources
echo ""
echo "💻 Step 5: System resources:"
echo "   Memory:"
free -h | grep -E "Mem|Swap" || true
echo "   CPU:"
top -bn1 | grep "Cpu(s)" | awk '{print $2 $3 $4 $5 $6 $7 $8}' || true

# Step 6: Start scheduler with PM2
echo ""
echo "🚀 Step 6: Starting scheduler with PM2..."

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed. Installing PM2 globally..."
    npm install -g pm2
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found. Make sure environment variables are set."
fi

# Start scheduler
pm2 start poller/scheduler.js --name flipperpro-scheduler

# Wait for startup
sleep 3

# Show status
echo ""
echo "📊 PM2 Status:"
pm2 status

# Show recent logs
echo ""
echo "📋 Recent scheduler logs (last 20 lines):"
pm2 logs flipperpro-scheduler --lines 20 --nostream

echo ""
echo "✅ Fresh restart complete!"
echo ""
echo "📈 View process logs:"
echo "   node poller/view-process-logs.js"
echo ""
echo "📊 Useful PM2 commands:"
echo "   pm2 logs flipperpro-scheduler    # View logs"
echo "   pm2 status                       # View status"
echo "   pm2 restart flipperpro-scheduler # Restart"
echo "   pm2 stop flipperpro-scheduler    # Stop"
echo ""





