/**
 * Debug script to check exact timestamps used for trend_6h calculation
 * User reports: manual calculation (1:05pm -> 7:00pm) = 5.1%, but system shows 4.7%
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function debugTrend6hTimestamps() {
    const itemId = 2351; // Iron bar
    const now = Math.floor(Date.now() / 1000);
    const sixHoursAgo = now - (6 * 60 * 60); // 6 hours ago
    
    console.log('='.repeat(80));
    console.log(`🔍 DEBUGGING trend_6h TIMESTAMPS FOR IRON BAR (${itemId})`);
    console.log('='.repeat(80));
    console.log(`Current timestamp: ${new Date(now * 1000).toISOString()}`);
    console.log(`Six hours ago: ${new Date(sixHoursAgo * 1000).toISOString()}`);
    console.log();
    
    // Get all price_5m data points in the last 6 hours
    const allPoints = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_5m
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp ASC
    `, [itemId, sixHoursAgo, now]);
    
    console.log(`📊 ALL price_5m DATA POINTS IN LAST 6 HOURS (${allPoints.rows.length} points):`);
    console.log('-'.repeat(80));
    allPoints.rows.forEach((row, idx) => {
        const timeStr = new Date(row.timestamp * 1000).toLocaleString('en-US', { 
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        console.log(`${idx + 1}. ${timeStr} (${new Date(row.timestamp * 1000).toISOString()}) - mid: ${row.mid}`);
    });
    console.log();
    
    // Get first and last points (what the code uses)
    const firstLastResult = await db.query(`
        SELECT 
            (SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
             FROM price_5m
             WHERE item_id = $1
               AND timestamp >= $2
               AND timestamp <= $3
               AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
             ORDER BY timestamp ASC
             LIMIT 1) AS first_point,
            (SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
             FROM price_5m
             WHERE item_id = $1
               AND timestamp >= $2
               AND timestamp <= $3
               AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
             ORDER BY timestamp DESC
             LIMIT 1) AS last_point
    `, [itemId, sixHoursAgo, now]);
    
    // Actually, the above query won't work as expected. Let me do it properly:
    const firstResult = await db.query(`
        SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
        FROM price_5m
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp ASC
        LIMIT 1
    `, [itemId, sixHoursAgo, now]);
    
    const lastResult = await db.query(`
        SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
        FROM price_5m
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp DESC
        LIMIT 1
    `, [itemId, sixHoursAgo, now]);
    
    console.log('📊 FIRST AND LAST POINTS (what code uses):');
    console.log('-'.repeat(80));
    if (firstResult.rows.length > 0) {
        const first = firstResult.rows[0];
        const firstTimeStr = new Date(first.timestamp * 1000).toLocaleString('en-US', { 
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        console.log(`First point: ${firstTimeStr} (${new Date(first.timestamp * 1000).toISOString()})`);
        console.log(`  mid: ${first.mid}`);
    }
    
    if (lastResult.rows.length > 0) {
        const last = lastResult.rows[0];
        const lastTimeStr = new Date(last.timestamp * 1000).toLocaleString('en-US', { 
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        console.log(`Last point: ${lastTimeStr} (${new Date(last.timestamp * 1000).toISOString()})`);
        console.log(`  mid: ${last.mid}`);
        
        if (firstResult.rows.length > 0) {
            const first = firstResult.rows[0];
            const trend = ((last.mid - first.mid) / first.mid) * 100;
            console.log(`Calculated trend: ${trend.toFixed(2)}%`);
            console.log(`User manual (1:05pm -> 7:00pm): 5.1%`);
            console.log(`System shows: 4.7%`);
        }
    }
    console.log();
    
    // Check stored trend_6h
    const storedResult = await db.query(`
        SELECT trend_6h
        FROM canonical_items
        WHERE item_id = $1
    `, [itemId]);
    
    if (storedResult.rows.length > 0) {
        console.log(`Stored trend_6h: ${storedResult.rows[0].trend_6h}%`);
    }
    
    await db.end();
}

debugTrend6hTimestamps().catch(console.error);

