require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        const now = Math.floor(Date.now() / 1000);
        const fiveMinutesAgo = now - 300;
        
        // Replicate the exact query from calculateBatchTrendsWithCaching
        const latest5m = await db.query(`
            SELECT DISTINCT ON (item_id) 
                item_id, timestamp AS latest_ts, 
                (avg_high + avg_low) / 2.0 AS mid
            FROM price_5m
            WHERE item_id = 2351 
              AND timestamp >= $1 
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        `, [fiveMinutesAgo]);
        
        if (latest5m.rows.length === 0) {
            console.log("No latest 5m data found");
            await db.end();
            return;
        }
        
        const latest = latest5m.rows[0];
        console.log("Latest 5m candle:");
        console.log("  Timestamp:", latest.latest_ts, new Date(latest.latest_ts * 1000).toISOString());
        console.log("  Mid Price:", latest.mid);
        
        // Now find previous candle (exactly as the code does)
        const prev5m = await db.query(`
            SELECT avg_high, avg_low, timestamp,
                (avg_high + avg_low) / 2.0 AS mid
            FROM price_5m
            WHERE item_id = 2351 
              AND timestamp <= $1 
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC 
            LIMIT 1
        `, [latest.latest_ts - 300]);
        
        if (prev5m.rows.length > 0) {
            const prev = prev5m.rows[0];
            const calcTrend = prev.mid > 0 ? ((latest.mid - prev.mid) / prev.mid) * 100 : null;
            
            console.log("\nPrevious 5m candle (as code finds it):");
            console.log("  Timestamp:", prev.timestamp, new Date(prev.timestamp * 1000).toISOString());
            console.log("  Mid Price:", prev.mid);
            console.log("  Time difference:", latest.latest_ts - prev.timestamp, "seconds");
            console.log("\nCalculated Trend:", calcTrend?.toFixed(2) + "%");
            
            // Check what's stored
            const stored = await db.query(`
                SELECT trend_5m FROM canonical_items WHERE item_id = 2351
            `);
            console.log("Stored Trend:", stored.rows[0]?.trend_5m);
        } else {
            console.log("\nNo previous 5m candle found");
        }
        
        // Show all candles in the last 10 minutes
        const allCandles = await db.query(`
            SELECT 
                timestamp,
                avg_high,
                avg_low,
                (avg_high + avg_low) / 2.0 AS mid
            FROM price_5m
            WHERE item_id = 2351 
              AND timestamp >= $1
            ORDER BY timestamp DESC
        `, [now - 600]);
        
        console.log("\nAll 5m candles in last 10 minutes:");
        allCandles.rows.forEach((c, i) => {
            console.log(`  ${i + 1}. ${new Date(c.timestamp * 1000).toISOString()}: Mid=${c.mid?.toFixed(0) || 'NULL'}`);
        });
        
    } catch (err) {
        console.error("Error:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
})();




