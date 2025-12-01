#!/bin/bash

# Script to check process logs on VM via SSH
# Usage: ./scripts/check-vm-logs.sh [ssh_host] [hours]
# Example: ./scripts/check-vm-logs.sh user@vm.example.com 24

SSH_HOST="${1:-user@your-vm.com}"
HOURS="${2:-24}"
VM_PATH="~/osrs-flipper-pro-backend"

echo "🔍 Checking process logs on VM: $SSH_HOST"
echo "=========================================="
echo ""

# Check if log file exists
echo "📁 Checking if log file exists..."
ssh "$SSH_HOST" "test -f $VM_PATH/logs/process-execution.log.json && echo '✅ Log file exists' || echo '❌ Log file does not exist'"

echo ""
echo "📊 Process Execution Report:"
echo "=========================================="
ssh "$SSH_HOST" "cd $VM_PATH && node poller/view-process-logs.js $HOURS"

echo ""
echo ""
echo "🏥 Health Check:"
echo "=========================================="
ssh "$SSH_HOST" "cd $VM_PATH && node poller/check-process-health.js $HOURS"





