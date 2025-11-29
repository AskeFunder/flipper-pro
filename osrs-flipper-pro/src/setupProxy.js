const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');

console.log('[setupProxy] setupProxy.js is being loaded...');

// Load .env.local manually since setupProxy.js runs in Node context
// Create React App loads env vars for the React app, but setupProxy needs them too
const envPath = path.resolve(__dirname, '../.env.local');
console.log('[setupProxy] Looking for .env.local at:', envPath);

if (fs.existsSync(envPath)) {
    console.log('[setupProxy] Found .env.local, reading...');
    const envFile = fs.readFileSync(envPath, 'utf8');
    let loadedCount = 0;
    
    // Handle both Windows (\r\n) and Unix (\n) line endings
    envFile.split(/\r?\n/).forEach((line, index) => {
        // Skip comments and empty lines
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        
        // Match KEY=VALUE (with optional quotes)
        const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            // Remove surrounding quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (!process.env[key]) {
                process.env[key] = value;
                loadedCount++;
                console.log(`[setupProxy] Loaded ${key} = ${key.includes('SECRET') ? '***' : value}`);
            }
        }
    });
    console.log(`[setupProxy] ✅ Loaded ${loadedCount} environment variables from .env.local`);
} else {
    console.log('[setupProxy] ❌ .env.local file not found at:', envPath);
}

/**
 * Proxy configuration for local development
 * When REACT_APP_API_BASE is set, proxy /api/* requests to the VM
 * This avoids CORS issues when running locally
 */
module.exports = function(app) {
    // Try multiple sources for env vars
    const apiBase = process.env.REACT_APP_API_BASE;

    console.log('[setupProxy] Environment check:');
    console.log(`[setupProxy] REACT_APP_API_BASE: ${apiBase ? 'SET (' + apiBase + ')' : 'NOT SET'}`);

    // Only set up proxy if API_BASE is configured (local dev with VM)
    // IMPORTANT: This must be set up AFTER static file serving, so React app works
    // Security is handled by CORS and rate limiting on the backend
    if (apiBase) {
        console.log(`[setupProxy] ✅ Configuring proxy: /api/* -> ${apiBase}`);
        
        // Use path string '/api' - this is the correct way and ensures React app is NOT affected
        // The path string ensures it only matches requests starting with /api
        app.use(
            '/api',
            createProxyMiddleware({
                target: apiBase,
                changeOrigin: true,
                secure: false, // Allow HTTP connections
                // Don't rewrite path - keep /api prefix as backend expects it
                onProxyReq: (proxyReq, req, res) => {
                    const requestUrl = req.originalUrl || req.url;
                    console.log(`[setupProxy] ➡️  Proxying ${req.method} ${requestUrl} -> ${apiBase}${requestUrl}`);
                },
                onProxyRes: (proxyRes, req, res) => {
                    const requestUrl = req.originalUrl || req.url;
                    console.log(`[setupProxy] ⬅️  Response ${proxyRes.statusCode} for ${requestUrl}`);
                },
                onError: (err, req, res) => {
                    const requestUrl = req.originalUrl || req.url;
                    console.error('[setupProxy] ❌ Proxy error:', err.message);
                    console.error('[setupProxy] Request was:', req.method, requestUrl);
                },
            })
        );
    } else {
        console.log('[setupProxy] ⚠️  No API_BASE configured, skipping proxy setup');
        console.log('[setupProxy] Make sure .env.local exists with REACT_APP_API_BASE');
    }
};

