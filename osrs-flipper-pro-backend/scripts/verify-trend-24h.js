/**
 * Verify trend_24h calculation matches manual calculation
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function verifyTrend24h() {
    const itemId = 2351; // Iron bar
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - (24 * 60 * 60);
    
    console.log('Verifying trend_24h calculation for Iron bar (2351):');
    console.log(`Window: ${new Date(oneDayAgo * 1000).toISOString()} to ${new Date(now * 1000).toISOString()}`);
    console.log();
    
    // Get first and last points from price_5m (what the code should use)
    const result = await db.query(`
        SELECT 
            (SELECT (avg_high + avg_low) / 2.0 AS mid
             FROM price_5m
             WHERE item_id = $1
               AND timestamp >= $2
               AND timestamp <= $3
               AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
             ORDER BY timestamp ASC
             LIMIT 1) AS first_mid,
            (SELECT (avg_high + avg_low) / 2.0 AS mid
             FROM price_5m
             WHERE item_id = $1
               AND timestamp >= $2
               AND timestamp <= $3
               AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
             ORDER BY timestamp DESC
             LIMIT 1) AS last_mid
    `, [itemId, oneDayAgo, now]);
    
    if (result.rows.length > 0 && 
        result.rows[0].first_mid != null && 
        result.rows[0].last_mid != null) {
        const firstMid = parseFloat(result.rows[0].first_mid);
        const lastMid = parseFloat(result.rows[0].last_mid);
        const calculatedTrend = parseFloat((100.0 * (lastMid - firstMid) / firstMid).toFixed(2));
        const exactTrend = (100.0 * (lastMid - firstMid) / firstMid);
        
        console.log(`First mid: ${firstMid}`);
        console.log(`Last mid: ${lastMid}`);
        console.log(`Exact trend: ${exactTrend}%`);
        console.log(`Rounded trend (toFixed(2)): ${calculatedTrend}%`);
        console.log(`User's calculation: -4.361370716510903%`);
        console.log(`Difference: ${Math.abs(exactTrend - (-4.361370716510903))}%`);
        console.log();
        
        // Get stored value
        const stored = await db.query(`
            SELECT trend_24h FROM canonical_items WHERE item_id = $1
        `, [itemId]);
        
        if (stored.rows.length > 0) {
            console.log(`Stored trend_24h: ${stored.rows[0].trend_24h}%`);
        }
    }
    
    await db.end();
}

verifyTrend24h().catch(console.error);

