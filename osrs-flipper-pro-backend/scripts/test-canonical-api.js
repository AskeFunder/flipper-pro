const http = require('http');

const itemId = process.argv[2] || 28736;

const options = {
    hostname: 'localhost',
    port: 3001,
    path: `/api/items/canonical/${itemId}`,
    method: 'GET'
};

const req = http.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log(`\n=== Canonical API Response for Item ${itemId} ===\n`);
            console.log('Trend values:');
            console.log('  trend_5m:', json.trend_5m, typeof json.trend_5m);
            console.log('  trend_1h:', json.trend_1h, typeof json.trend_1h);
            console.log('  trend_6h:', json.trend_6h, typeof json.trend_6h);
            console.log('  trend_24h:', json.trend_24h, typeof json.trend_24h);
            console.log('  trend_7d:', json.trend_7d, typeof json.trend_7d);
            console.log('  trend_1m:', json.trend_1m, typeof json.trend_1m);
        } catch (err) {
            console.error('Error parsing JSON:', err);
            console.log('Raw response:', data);
        }
        process.exit(0);
    });
});

req.on('error', (err) => {
    console.error('Request error:', err);
    process.exit(1);
});

req.end();







