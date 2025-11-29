// scripts/diagnose-item-trends.js
// Diagnostic script to check why an item has no trends
// Usage: node diagnose-item-trends.js <item_id>

const db = require('../db/db');

async function diagnoseItemTrends(itemId) {
    console.log(`\n🔍 Diagnosing trends for item_id = ${itemId}\n`);
    
    const now = Math.floor(Date.now() / 1000);
    
    try {
        // 1. Check stored trends
        console.log('='.repeat(80));
        console.log('1. STORED TRENDS IN CANONICAL_ITEMS');
        console.log('='.repeat(80));
        const storedTrends = await db.query(
            `SELECT trend_5m, trend_1h, trend_6h, trend_24h, trend_7d, trend_1m 
             FROM canonical_items 
             WHERE item_id = $1`,
            [itemId]
        );
        
        if (storedTrends.rows.length === 0) {
            console.log('❌ Item not found in canonical_items table');
            return;
        }
        
        const trends = storedTrends.rows[0];
        console.log(`trend_5m:  ${trends.trend_5m ?? 'NULL'}`);
        console.log(`trend_1h:  ${trends.trend_1h ?? 'NULL'}`);
        console.log(`trend_6h:  ${trends.trend_6h ?? 'NULL'}`);
        console.log(`trend_24h: ${trends.trend_24h ?? 'NULL'}`);
        console.log(`trend_7d:  ${trends.trend_7d ?? 'NULL'}`);
        console.log(`trend_1m:  ${trends.trend_1m ?? 'NULL'}`);
        
        // 2. Check data availability
        console.log('\n' + '='.repeat(80));
        console.log('2. DATA AVAILABILITY');
        console.log('='.repeat(80));
        
        const tables = ['price_5m', 'price_1h', 'price_6h', 'price_24h'];
        for (const table of tables) {
            const count = await db.query(
                `SELECT COUNT(*) as count FROM ${table} WHERE item_id = $1`,
                [itemId]
            );
            console.log(`${table}: ${count.rows[0].count} rows`);
        }
        
        // 3. Latest data points
        console.log('\n' + '='.repeat(80));
        console.log('3. LATEST DATA POINTS');
        console.log('='.repeat(80));
        
        for (const table of tables) {
            const latest = await db.query(
                `SELECT timestamp, avg_high, avg_low,
                    CASE 
                        WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                        WHEN avg_high IS NOT NULL THEN avg_high
                        WHEN avg_low IS NOT NULL THEN avg_low
                        ELSE NULL
                    END AS mid_price
                 FROM ${table}
                 WHERE item_id = $1
                 ORDER BY timestamp DESC
                 LIMIT 1`,
                [itemId]
            );
            
            if (latest.rows.length > 0) {
                const row = latest.rows[0];
                console.log(`\n${table}:`);
                console.log(`  Timestamp: ${row.timestamp} (${new Date(row.timestamp * 1000).toISOString()})`);
                console.log(`  avg_high: ${row.avg_high ?? 'NULL'}`);
                console.log(`  avg_low: ${row.avg_low ?? 'NULL'}`);
                console.log(`  mid_price: ${row.mid_price ?? 'NULL'}`);
            } else {
                console.log(`\n${table}: NO DATA`);
            }
        }
        
        // 4. Trend diagnostics
        console.log('\n' + '='.repeat(80));
        console.log('4. TREND DIAGNOSTICS');
        console.log('='.repeat(80));
        
        const trendConfigs = [
            { name: 'trend_5m', table: 'price_5m', period: 300, currStart: now - 300, currEnd: now, prevStart: now - 600, prevEnd: now - 300 },
            { name: 'trend_1h', table: 'price_5m', period: 3600, currStart: now - 3600, currEnd: now, prevStart: now - 7200, prevEnd: now - 3600 },
            { name: 'trend_6h', table: 'price_5m', period: 21600, currStart: now - 21600, currEnd: now, prevStart: now - 43200, prevEnd: now - 21600 },
            { name: 'trend_24h', table: 'price_5m', period: 86400, currStart: now - 86400, currEnd: now, prevStart: now - 172800, prevEnd: now - 86400 },
            { name: 'trend_7d', table: 'price_1h', period: 604800, currStart: now - 604800, currEnd: now, prevStart: now - 1209600, prevEnd: now - 604800 },
            { name: 'trend_1m', table: 'price_6h', period: 2592000, currStart: now - 2592000, currEnd: now, prevStart: now - 5184000, prevEnd: now - 2592000 },
        ];
        
        const midExpr = `CASE 
            WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
            WHEN avg_high IS NOT NULL THEN avg_high
            WHEN avg_low IS NOT NULL THEN avg_low
            ELSE NULL
        END`;
        
        for (const config of trendConfigs) {
            console.log(`\n${config.name} (using ${config.table}):`);
            
            // Get current price
            const curr = await db.query(
                `SELECT ${midExpr} AS mid, avg_high, avg_low, timestamp
                 FROM ${config.table}
                 WHERE item_id = $1
                   AND timestamp > $2 AND timestamp <= $3
                 ORDER BY timestamp DESC
                 LIMIT 1`,
                [itemId, config.currStart, config.currEnd]
            );
            
            // Get previous price
            const prev = await db.query(
                `SELECT ${midExpr} AS mid, timestamp
                 FROM ${config.table}
                 WHERE item_id = $1
                   AND timestamp > $2 AND timestamp <= $3
                 ORDER BY timestamp DESC
                 LIMIT 1`,
                [itemId, config.prevStart, config.prevEnd]
            );
            
            const currMid = curr.rows.length > 0 ? curr.rows[0].mid : null;
            const prevMid = prev.rows.length > 0 ? prev.rows[0].mid : null;
            
            console.log(`  Current window: ${new Date(config.currStart * 1000).toISOString()} to ${new Date(config.currEnd * 1000).toISOString()}`);
            if (curr.rows.length > 0) {
                console.log(`  Current price: ${currMid} (timestamp: ${curr.rows[0].timestamp}, ${new Date(curr.rows[0].timestamp * 1000).toISOString()})`);
                console.log(`    avg_high: ${curr.rows[0].avg_high ?? 'NULL'}, avg_low: ${curr.rows[0].avg_low ?? 'NULL'}`);
            } else {
                console.log(`  Current price: NULL (no data in current window)`);
            }
            
            console.log(`  Previous window: ${new Date(config.prevStart * 1000).toISOString()} to ${new Date(config.prevEnd * 1000).toISOString()}`);
            if (prev.rows.length > 0) {
                console.log(`  Previous price: ${prevMid} (timestamp: ${prev.rows[0].timestamp}, ${new Date(prev.rows[0].timestamp * 1000).toISOString()})`);
            } else {
                console.log(`  Previous price: NULL (no data in previous window)`);
            }
            
            // Calculate trend
            let calculatedTrend = null;
            let issue = null;
            
            if (currMid === null) {
                issue = 'CURRENT price is NULL - no data in current window';
            } else if (prevMid === null) {
                issue = 'PREVIOUS price is NULL - no data in previous window';
            } else if (prevMid === 0) {
                issue = 'PREVIOUS price is ZERO - cannot calculate trend';
            } else {
                calculatedTrend = Math.round(100.0 * (currMid - prevMid) / prevMid * 100) / 100;
                console.log(`  ✅ Calculated trend: ${calculatedTrend}%`);
            }
            
            if (issue) {
                console.log(`  ⚠️  ISSUE: ${issue}`);
            }
            
            const storedTrend = trends[config.name];
            if (storedTrend !== calculatedTrend && (storedTrend !== null || calculatedTrend !== null)) {
                console.log(`  ⚠️  MISMATCH: Stored trend (${storedTrend}) != Calculated trend (${calculatedTrend})`);
            }
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('SUMMARY');
        console.log('='.repeat(80));
        console.log(`Current time: ${new Date(now * 1000).toISOString()} (${now})`);
        console.log('\n✅ Diagnostic complete.');
        
    } catch (err) {
        console.error('❌ Error running diagnostic:', err);
        throw err;
    }
}

// Main execution
const itemId = process.argv[2];

if (!itemId) {
    console.error('Usage: node diagnose-item-trends.js <item_id>');
    console.error('Example: node diagnose-item-trends.js 31961');
    process.exit(1);
}

diagnoseItemTrends(parseInt(itemId))
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Diagnostic failed:', err);
        process.exit(1);
    });
