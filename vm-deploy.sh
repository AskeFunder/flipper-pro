#!/bin/bash
# VM Deployment Script - TRIN 2-5
# Kør denne på VM'en: bash vm-deploy.sh

set -e  # Stop ved fejl

echo "🚀 Starting VM Deployment..."
echo ""

# TRIN 2 - PULL PÅ VM
echo "✅ TRIN 2 — Pulling latest from production..."
cd /root/flipper-pro
git pull origin production

echo ""
echo "📋 Checking updated files..."
if [ -f "osrs-flipper-pro/src/pages/BrowseItemsPage.jsx" ]; then
    echo "  ✅ BrowseItemsPage.jsx exists"
else
    echo "  ❌ BrowseItemsPage.jsx NOT FOUND"
    exit 1
fi

if [ -f "osrs-flipper-pro/src/components/BrowseTable.jsx" ]; then
    echo "  ✅ BrowseTable.jsx exists"
else
    echo "  ❌ BrowseTable.jsx NOT FOUND"
    exit 1
fi

if [ -f "osrs-flipper-pro/src/App.js" ]; then
    echo "  ✅ App.js exists"
else
    echo "  ❌ App.js NOT FOUND"
    exit 1
fi

echo ""
echo "✅ TRIN 2 — COMPLETE"
echo ""

# TRIN 3 - PRODUCTION BUILD
echo "✅ TRIN 3 — Building production bundle..."
cd /root/flipper-pro/osrs-flipper-pro

echo "📦 Installing dependencies (if needed)..."
npm ci --production=false 2>&1 | tail -5

echo ""
echo "🔨 Running build..."
npm run build

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ BUILD FAILED!"
    exit 1
fi

echo ""
echo "✅ TRIN 3 — COMPLETE"
echo ""

# TRIN 4 - DEPLOY TO NGINX
echo "✅ TRIN 4 — Deploying to nginx webroot..."
sudo rm -rf /var/www/flipper-pro/*
sudo cp -r /root/flipper-pro/osrs-flipper-pro/build/* /var/www/flipper-pro/
sudo chown -R www-data:www-data /var/www/flipper-pro

echo ""
echo "🔄 Reloading nginx..."
sudo systemctl reload nginx

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ NGINX RELOAD FAILED!"
    exit 1
fi

echo ""
echo "✅ TRIN 4 — COMPLETE"
echo ""
echo "🎉 DEPLOYMENT COMPLETE!"
echo ""
echo "🌐 Site should now be live at: https://flipper-pro.com"
echo ""
echo "📋 Next: Run acceptance tests on the live site"



