const http = require('http');

const itemId = process.argv[2] || 28736;

const options = {
    hostname: 'localhost',
    port: 3001,
    path: `/api/items/trend-details/${itemId}`,
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
            console.log(`\n=== API Response for Item ${itemId} ===\n`);
            console.log(JSON.stringify(json, null, 2));
            
            // Check trend_6h specifically
            if (json.trend_6h) {
                console.log('\n--- trend_6h Details ---');
                console.log('storedTrend:', json.trend_6h.storedTrend);
                console.log('calculatedTrend:', json.trend_6h.calculatedTrend);
                console.log('trend (display):', json.trend_6h.trend);
                console.log('Match:', json.trend_6h.storedTrend === json.trend_6h.trend ? '✓ YES' : '✗ NO');
            }
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




