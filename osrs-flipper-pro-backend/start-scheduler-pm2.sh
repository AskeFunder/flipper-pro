#!/bin/bash

# Script to start scheduler via PM2 on production VM
# Run this on your VM: bash start-scheduler-pm2.sh

set -e

echo "🚀 Starting FlipperPro Scheduler via PM2..."

# Navigate to backend directory (adjust path if needed)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed. Installing PM2 globally..."
    npm install -g pm2
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found. Make sure environment variables are set."
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

# Wait a moment for startup
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
echo "✅ Scheduler started!"
echo ""
echo "Useful commands:"
echo "  - View logs: pm2 logs flipperpro-scheduler"
echo "  - View status: pm2 status"
echo "  - Restart: pm2 restart flipperpro-scheduler"
echo "  - Stop: pm2 stop flipperpro-scheduler"
echo ""






