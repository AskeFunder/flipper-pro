const db = require('../db/db');
const { getTrendDetails } = require('../routes/trend-details');

async function testItemTrend(itemId) {
    try {
        console.log(`\n=== Testing Item ${itemId} ===\n`);
        
        // Get stored values
        const storedResult = await db.query(`
            SELECT item_id, trend_5m, trend_1h, trend_6h, trend_24h, trend_7d, trend_1m
            FROM canonical_items
            WHERE item_id = $1
        `, [itemId]);
        
        if (storedResult.rows.length === 0) {
            console.log('Item not found in canonical_items');
            return;
        }
        
        const stored = storedResult.rows[0];
        console.log('Stored trend values in database:');
        console.log('  trend_5m:', stored.trend_5m);
        console.log('  trend_1h:', stored.trend_1h);
        console.log('  trend_6h:', stored.trend_6h);
        console.log('  trend_24h:', stored.trend_24h);
        console.log('  trend_7d:', stored.trend_7d);
        console.log('  trend_1m:', stored.trend_1m);
        
        // Get trend details
        console.log('\n--- Trend Details from API ---');
        const details = await getTrendDetails(itemId);
        
        const trendKeys = ['trend_5m', 'trend_1h', 'trend_6h', 'trend_24h', 'trend_7d', 'trend_1m'];
        trendKeys.forEach(key => {
            const d = details[key];
            if (!d) {
                console.log(`\n${key}: No data`);
                return;
            }
            
            console.log(`\n${key}:`);
            console.log('  Stored trend (from DB):', d.storedTrend);
            console.log('  Calculated trend (recalc):', d.calculatedTrend);
            console.log('  Display trend (used in API):', d.trend);
            console.log('  Match:', d.storedTrend === d.trend ? '✓ YES' : '✗ NO');
            
            if (d.current) {
                console.log('  Current:', d.current.table, 'mid=' + d.current.mid, 'at', new Date(d.current.time).toLocaleString());
            }
            if (d.previous) {
                console.log('  Previous:', d.previous.table, 'mid=' + d.previous.mid, 'at', new Date(d.previous.time).toLocaleString());
            }
            if (d.current && d.previous && d.previous.mid !== 0) {
                const manualCalc = ((d.current.mid - d.previous.mid) / d.previous.mid * 100);
                console.log('  Manual calc:', manualCalc.toFixed(2) + '%');
            }
        });
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await db.end();
    }
}

const itemId = process.argv[2] ? parseInt(process.argv[2], 10) : 28736;
testItemTrend(itemId);







