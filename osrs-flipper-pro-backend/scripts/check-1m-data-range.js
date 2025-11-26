/**
 * Check what data exists for Iron bar in 1m window
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkDataRange() {
    const itemId = 2351; // Iron bar
    const now = Math.floor(Date.now() / 1000);
    const oneMonthAgo = now - (30 * 24 * 60 * 60);
    
    console.log('Checking data range for Iron bar (2351) in 1m window:');
    console.log(`Now: ${new Date(now * 1000).toISOString()}`);
    console.log(`1 month ago: ${new Date(oneMonthAgo * 1000).toISOString()}`);
    console.log();
    
    // Check price_1h
    const result1h = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_1h
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp ASC
    `, [itemId, oneMonthAgo, now]);
    
    console.log(`price_1h: ${result1h.rows.length} data points`);
    if (result1h.rows.length > 0) {
        const first = result1h.rows[0];
        const last = result1h.rows[result1h.rows.length - 1];
        console.log(`  First: ${new Date(first.timestamp * 1000).toISOString()}, mid=${first.mid}`);
        console.log(`  Last: ${new Date(last.timestamp * 1000).toISOString()}, mid=${last.mid}`);
        const trend = ((last.mid - first.mid) / first.mid) * 100;
        console.log(`  Trend: ${trend.toFixed(2)}%`);
    }
    console.log();
    
    // Check price_6h
    const result6h = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_6h
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp ASC
    `, [itemId, oneMonthAgo, now]);
    
    console.log(`price_6h: ${result6h.rows.length} data points`);
    if (result6h.rows.length > 0) {
        const first = result6h.rows[0];
        const last = result6h.rows[result6h.rows.length - 1];
        console.log(`  First: ${new Date(first.timestamp * 1000).toISOString()}, mid=${first.mid}`);
        console.log(`  Last: ${new Date(last.timestamp * 1000).toISOString()}, mid=${last.mid}`);
        const trend = ((last.mid - first.mid) / first.mid) * 100;
        console.log(`  Trend: ${trend.toFixed(2)}%`);
    }
    console.log();
    
    // Check price_24h
    const result24h = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_24h
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp ASC
    `, [itemId, oneMonthAgo, now]);
    
    console.log(`price_24h: ${result24h.rows.length} data points`);
    if (result24h.rows.length > 0) {
        const first = result24h.rows[0];
        const last = result24h.rows[result24h.rows.length - 1];
        console.log(`  First: ${new Date(first.timestamp * 1000).toISOString()}, mid=${first.mid}`);
        console.log(`  Last: ${new Date(last.timestamp * 1000).toISOString()}, mid=${last.mid}`);
        const trend = ((last.mid - first.mid) / first.mid) * 100;
        console.log(`  Trend: ${trend.toFixed(2)}%`);
    }
    
    await db.end();
}

checkDataRange().catch(console.error);

