// Test script to update trends for a specific item
const db = require('../db/db');

// Copy the calculateBatchTrends function logic here since it's not exported
const midExpr = `CASE WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0 WHEN avg_high IS NOT NULL THEN avg_high WHEN avg_low IS NOT NULL THEN avg_low ELSE NULL END`;

const buildPriceSelect = (table, itemIdVar, startParam, endParam, recencyParamVar) => {
    return `COALESCE(
        CASE 
            WHEN $${recencyParamVar} > 0 THEN
                (SELECT ${midExpr} FROM ${table} 
                 WHERE item_id = ${itemIdVar} 
                   AND timestamp > $${startParam} AND timestamp <= $${endParam}
                   AND avg_high IS NOT NULL AND avg_low IS NOT NULL
                   AND timestamp > ($${endParam} - $${recencyParamVar})
                 ORDER BY timestamp DESC LIMIT 1)
            ELSE NULL
        END,
        (SELECT ${midExpr} FROM ${table} 
         WHERE item_id = ${itemIdVar} 
           AND timestamp > $${startParam} AND timestamp <= $${endParam}
           AND avg_high IS NOT NULL AND avg_low IS NOT NULL
         ORDER BY timestamp DESC LIMIT 1),
        (SELECT ${midExpr} FROM ${table} 
         WHERE item_id = ${itemIdVar} 
           AND timestamp > $${startParam} AND timestamp <= $${endParam}
           AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
         ORDER BY timestamp DESC LIMIT 1)
    )`;
};

async function calculateItemTrend(itemId, now) {
    const w5m = { currStart: now - 300, currEnd: now, prevStart: now - 600, prevEnd: now - 300, recency: 0 };
    const w1h = { currStart: now - 3600, currEnd: now, prevStart: now - 7200, prevEnd: now - 3600, recency: 600 };
    const w6h = { currStart: now - 21600, currEnd: now, prevStart: now - 43200, prevEnd: now - 21600, recency: 1800 };
    const w24h = { currStart: now - 86400, currEnd: now, prevStart: now - 172800, prevEnd: now - 86400, recency: 7200 };
    const w7d = { currStart: now - 604800, currEnd: now, prevStart: now - 1209600, prevEnd: now - 604800, recency: 21600 };
    const w1m = { currStart: now - 2592000, currEnd: now, prevStart: now - 5184000, prevEnd: now - 2592000, recency: 21600 };
    
    let p = 2;
    const p5m = { currStart: p++, currEnd: p++, prevStart: p++, prevEnd: p++, recency: p++ };
    const p1h = { currStart: p++, currEnd: p++, prevStart: p++, prevEnd: p++, recency: p++ };
    
    // Simplified query for just one item to test
    const query = `
        WITH 
        t5m AS (
            SELECT 
                ${buildPriceSelect('price_5m', '$1', p5m.currStart, p5m.currEnd, p5m.recency)} AS price_current,
                ${buildPriceSelect('price_5m', '$1', p5m.prevStart, p5m.prevEnd, p5m.recency)} AS price_previous
        ),
        trend_5m AS (
            SELECT 
                CASE 
                    WHEN price_previous IS NULL OR price_previous = 0 THEN NULL
                    WHEN price_current IS NULL THEN NULL
                    ELSE ROUND(100.0 * (price_current - price_previous) / price_previous, 2)
                END AS value
            FROM t5m
        )
        SELECT value AS trend_5m FROM trend_5m
    `;
    
    const params = [
        itemId,
        w5m.currStart, w5m.currEnd, w5m.prevStart, w5m.prevEnd, w5m.recency
    ];
    
    const result = await db.query(query, params);
    return { trend_5m: result.rows[0]?.trend_5m ?? null };
}

async function testTrendUpdate(itemId) {
    console.log(`\n🧪 Testing trend calculation for item ${itemId}...\n`);
    
    try {
        const now = Math.floor(Date.now() / 1000);
        
        // Test just trend_5m for now
        const trends = await calculateItemTrend(itemId, now);
        
        console.log('📊 Calculated Trends:');
        console.log(`  trend_5m:  ${trends.trend_5m ?? 'NULL'}`);
        
        // For full update, we'd call the full update function
        // For now, let's just verify the calculation works
        
    } catch (err) {
        console.error('❌ Error:', err);
        throw err;
    }
}

const itemId = parseInt(process.argv[2]) || 31961;
testTrendUpdate(itemId)
    .then(() => {
        console.log('\n✅ Test complete');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Test failed:', err);
        process.exit(1);
    });

