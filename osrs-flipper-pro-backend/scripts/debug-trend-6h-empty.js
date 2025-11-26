/**
 * Debug script to investigate why trend_6h is empty
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function debugTrend6hEmpty() {
    const itemId = 2351; // Iron bar
    const now = Math.floor(Date.now() / 1000);
    const sixHoursAgo = now - (6 * 60 * 60); // 6 hours ago
    
    console.log('='.repeat(80));
    console.log(`🔍 DEBUGGING EMPTY trend_6h FOR IRON BAR (${itemId})`);
    console.log('='.repeat(80));
    console.log(`Current timestamp: ${new Date(now * 1000).toISOString()}`);
    console.log(`Six hours ago: ${new Date(sixHoursAgo * 1000).toISOString()}`);
    console.log();
    
    // 1. Check stored trend_6h
    console.log('📊 1. STORED trend_6h IN canonical_items:');
    console.log('-'.repeat(80));
    const storedResult = await db.query(`
        SELECT trend_6h
        FROM canonical_items
        WHERE item_id = $1
    `, [itemId]);
    
    if (storedResult.rows.length > 0) {
        console.log(`Stored trend_6h: ${storedResult.rows[0].trend_6h}`);
    } else {
        console.log('No canonical_items record found');
    }
    console.log();
    
    // 2. Check price_5m data for last 6 hours (what the code uses now)
    console.log('📊 2. price_5m DATA FOR LAST 6 HOURS:');
    console.log('-'.repeat(80));
    const price5mResult = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_5m
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp ASC
    `, [itemId, sixHoursAgo, now]);
    
    console.log(`Found ${price5mResult.rows.length} data points in price_5m for last 6h`);
    if (price5mResult.rows.length > 0) {
        const first = price5mResult.rows[0];
        const last = price5mResult.rows[price5mResult.rows.length - 1];
        console.log(`First point: ${new Date(first.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${first.avg_high}, avg_low: ${first.avg_low}, mid: ${first.mid}`);
        console.log(`Last point: ${new Date(last.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${last.avg_high}, avg_low: ${last.avg_low}, mid: ${last.mid}`);
        
        if (first.mid !== 0 && last.mid !== null && first.mid !== null) {
            const manualTrend = ((last.mid - first.mid) / first.mid) * 100;
            console.log(`Manual calculation: ${manualTrend.toFixed(2)}%`);
        } else {
            console.log('⚠️ Cannot calculate: first.mid is 0 or null');
        }
    } else {
        console.log('❌ No data points found in price_5m for last 6h');
    }
    console.log();
    
    // 3. Test the exact query used in update-canonical-items.js
    console.log('📊 3. EXACT QUERY FROM update-canonical-items.js:');
    console.log('-'.repeat(80));
    const exactQueryResult = await db.query(`
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
    `, [itemId, sixHoursAgo, now]);
    
    if (exactQueryResult.rows.length > 0) {
        const row = exactQueryResult.rows[0];
        console.log(`first_mid: ${row.first_mid}`);
        console.log(`last_mid: ${row.last_mid}`);
        
        if (row.first_mid != null && row.last_mid != null && row.first_mid !== 0) {
            const trend = (100.0 * (row.last_mid - row.first_mid) / row.first_mid).toFixed(2);
            console.log(`Calculated trend: ${trend}%`);
        } else {
            console.log('⚠️ Query returned null or first_mid is 0');
            console.log(`  first_mid is null: ${row.first_mid == null}`);
            console.log(`  last_mid is null: ${row.last_mid == null}`);
            console.log(`  first_mid is 0: ${row.first_mid === 0}`);
        }
    }
    console.log();
    
    // 4. Check if there's any price_5m data at all for this item
    console.log('📊 4. RECENT price_5m DATA (last 24h):');
    console.log('-'.repeat(80));
    const recent5m = await db.query(`
        SELECT COUNT(*) AS count, MIN(timestamp) AS min_ts, MAX(timestamp) AS max_ts
        FROM price_5m
        WHERE item_id = $1
          AND timestamp >= $2
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
    `, [itemId, now - (24 * 60 * 60)]);
    
    if (recent5m.rows.length > 0) {
        console.log(`Total data points in last 24h: ${recent5m.rows[0].count}`);
        if (recent5m.rows[0].min_ts) {
            console.log(`Earliest: ${new Date(recent5m.rows[0].min_ts * 1000).toISOString()}`);
        }
        if (recent5m.rows[0].max_ts) {
            console.log(`Latest: ${new Date(recent5m.rows[0].max_ts * 1000).toISOString()}`);
        }
    }
    
    await db.end();
}

debugTrend6hEmpty().catch(console.error);

