/**
 * Debug script to check trend_5m calculation for Iron Bar
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function debugTrend5m() {
    const itemId = 2351; // Iron bar
    const now = Math.floor(Date.now() / 1000);
    const fiveMinutesAgo = now - 300; // 5 minutes ago
    
    console.log('='.repeat(80));
    console.log(`🔍 DEBUGGING trend_5m FOR IRON BAR (${itemId})`);
    console.log('='.repeat(80));
    console.log(`Current timestamp: ${new Date(now * 1000).toISOString()}`);
    console.log(`Five minutes ago: ${new Date(fiveMinutesAgo * 1000).toISOString()}`);
    console.log();
    
    // 1. Check stored trend_5m
    console.log('📊 1. STORED trend_5m IN canonical_items:');
    console.log('-'.repeat(80));
    const storedResult = await db.query(`
        SELECT trend_5m
        FROM canonical_items
        WHERE item_id = $1
    `, [itemId]);
    
    if (storedResult.rows.length > 0) {
        console.log(`Stored trend_5m: ${storedResult.rows[0].trend_5m}`);
    } else {
        console.log('No canonical_items record found');
    }
    console.log();
    
    // 2. Get price_5m data for last 5 minutes
    console.log('📊 2. price_5m DATA FOR LAST 5 MINUTES:');
    console.log('-'.repeat(80));
    const price5mResult = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_5m
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp ASC
    `, [itemId, fiveMinutesAgo, now]);
    
    console.log(`Found ${price5mResult.rows.length} data points in price_5m for last 5m`);
    if (price5mResult.rows.length > 0) {
        price5mResult.rows.forEach((row, idx) => {
            const timeStr = new Date(row.timestamp * 1000).toLocaleString('en-US', { 
                timeZone: 'America/New_York',
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
            console.log(`${idx + 1}. ${timeStr} (${new Date(row.timestamp * 1000).toISOString()}) - mid: ${row.mid}`);
        });
        
        const first = price5mResult.rows[0];
        const last = price5mResult.rows[price5mResult.rows.length - 1];
        console.log();
        console.log(`First point: ${new Date(first.timestamp * 1000).toISOString()}, mid: ${first.mid}`);
        console.log(`Last point: ${new Date(last.timestamp * 1000).toISOString()}, mid: ${last.mid}`);
        
        if (first.mid !== 0 && last.mid !== null && first.mid !== null) {
            const manualTrend = ((last.mid - first.mid) / first.mid) * 100;
            console.log(`Manual calculation: ${manualTrend.toFixed(4)}%`);
            console.log(`User expects: -1.29% or 1.29%`);
        } else {
            console.log('⚠️ Cannot calculate: first.mid is 0 or null');
        }
    } else {
        console.log('❌ No data points found in price_5m for last 5m');
    }
    console.log();
    
    // 3. Test the exact query used in update-canonical-items.js (NEW LOGIC)
    console.log('📊 3. EXACT QUERY FROM update-canonical-items.js (NEW LOGIC):');
    console.log('-'.repeat(80));
    
    // Get latest price
    const latestResult = await db.query(`
        SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
        FROM price_5m
        WHERE item_id = $1
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp DESC
        LIMIT 1
    `, [itemId]);
    
    if (latestResult.rows.length > 0) {
        const latest = latestResult.rows[0];
        const latestTimestamp = latest.timestamp;
        const fiveMinutesBeforeLatest = latestTimestamp - 300;
        
        console.log(`Latest datapoint: ${new Date(latestTimestamp * 1000).toISOString()}, mid: ${latest.mid}`);
        console.log(`Looking for price at or before: ${new Date(fiveMinutesBeforeLatest * 1000).toISOString()}`);
        
        // Get price from 5 minutes before latest
        const previousResult = await db.query(`
            SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
            FROM price_5m
            WHERE item_id = $1
              AND timestamp <= $2
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC
            LIMIT 1
        `, [itemId, fiveMinutesBeforeLatest]);
        
        if (previousResult.rows.length > 0) {
            const prev = previousResult.rows[0];
            console.log(`Previous datapoint: ${new Date(prev.timestamp * 1000).toISOString()}, mid: ${prev.mid}`);
            
            if (prev.mid !== 0) {
                const trend = (100.0 * (latest.mid - prev.mid) / prev.mid);
                console.log(`Calculated trend: ${trend.toFixed(8)}%`);
                console.log(`Rounded to 2 decimals: ${parseFloat(trend.toFixed(2))}%`);
                console.log(`User expects: 0.326797385620915%`);
            } else {
                console.log('⚠️ Previous mid is 0');
            }
        } else {
            console.log('❌ No previous datapoint found');
        }
    } else {
        console.log('❌ No latest datapoint found');
    }
    
    await db.end();
}

debugTrend5m().catch(console.error);

