#!/bin/bash
# restart-postgresql.sh
# Restart PostgreSQL on DigitalOcean server
# Usage: Run this on the DigitalOcean server via SSH

echo "🔄 Restarting PostgreSQL..."

# Check PostgreSQL version
PG_VERSION=$(ls /etc/postgresql/ | head -n 1 | cut -d'/' -f1)
echo "📊 Detected PostgreSQL version: $PG_VERSION"

# Restart PostgreSQL service
sudo systemctl restart postgresql

# Check status
if sudo systemctl is-active --quiet postgresql; then
    echo "✅ PostgreSQL restarted successfully!"
    echo "📊 Status:"
    sudo systemctl status postgresql --no-pager -l
else
    echo "❌ PostgreSQL failed to restart!"
    sudo systemctl status postgresql --no-pager -l
    exit 1
fi

echo ""
echo "💡 All database connections have been closed."
echo "💡 You can now test poll-latest.js again."






