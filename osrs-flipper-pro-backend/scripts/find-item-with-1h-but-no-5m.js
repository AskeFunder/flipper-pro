/**
 * Find items that have 1h data but no 5m data in the last 26 hours
 * These items can be used to test stale status for 24H trend
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function findItemsWith1hButNo5m() {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (26 * 60 * 60); // 26 hours ago
    
    // Find items with 1h data but no 5m data
    const { rows } = await db.query(`
        SELECT DISTINCT
            h.item_id,
            i.name,
            COUNT(DISTINCT h.timestamp) AS hour_count,
            COUNT(DISTINCT f.timestamp) AS five_min_count
        FROM price_1h h
        JOIN items i ON i.id = h.item_id
        LEFT JOIN price_5m f ON f.item_id = h.item_id 
            AND f.timestamp >= $1 
            AND f.timestamp <= $2
        WHERE h.timestamp >= $1 
          AND h.timestamp <= $2
          AND (h.avg_high IS NOT NULL OR h.avg_low IS NOT NULL)
        GROUP BY h.item_id, i.name
        HAVING COUNT(DISTINCT f.timestamp) = 0
        ORDER BY hour_count DESC
        LIMIT 10
    `, [windowStart, now]);
    
    console.log(`\nFound ${rows.length} items with 1h data but no 5m data:\n`);
    for (const row of rows) {
        console.log(`  Item ${row.item_id} (${row.name}): ${row.hour_count} hour candles, ${row.five_min_count} 5m candles`);
    }
    
    await db.end();
}

findItemsWith1hButNo5m().catch(console.error);

