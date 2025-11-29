require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        const itemId = 2351;
        const now = Math.floor(Date.now() / 1000);
        
        // Check what the SQL query returns for latest and prev 24h
        const latestQuery = await db.query(`
            SELECT 
                item_id,
                timestamp as latest_ts,
                CASE 
                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL
                END as mid,
                avg_high,
                avg_low
            FROM price_5m
            WHERE item_id = $1
              AND timestamp <= $2
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC
            LIMIT 1
        `, [itemId, now]);
        
        console.log("Latest 5m candle:");
        if (latestQuery.rows.length > 0) {
            const row = latestQuery.rows[0];
            console.log("  Timestamp:", new Date(row.latest_ts * 1000).toISOString());
            console.log("  avg_high:", row.avg_high);
            console.log("  avg_low:", row.avg_low);
            console.log("  Calculated mid:", row.mid);
            console.log("  mid type:", typeof row.mid);
            console.log("  mid is null?", row.mid === null);
            console.log("  mid is NaN?", isNaN(row.mid));
        }
        
        // Check prev 24h
        const prev24hQuery = await db.query(`
            SELECT 
                item_id,
                timestamp as prev_ts,
                CASE 
                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL
                END as mid,
                avg_high,
                avg_low
            FROM price_5m
            WHERE item_id = $1
              AND timestamp <= $2
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC
            LIMIT 1
        `, [itemId, now - 86400]);
        
        console.log("\nPrevious 24h candle:");
        if (prev24hQuery.rows.length > 0) {
            const row = prev24hQuery.rows[0];
            console.log("  Timestamp:", new Date(row.prev_ts * 1000).toISOString());
            console.log("  avg_high:", row.avg_high);
            console.log("  avg_low:", row.avg_low);
            console.log("  Calculated mid:", row.mid);
            console.log("  mid type:", typeof row.mid);
            console.log("  mid is null?", row.mid === null);
            console.log("  mid is NaN?", isNaN(row.mid));
        }
        
        // Test the calculation
        if (latestQuery.rows.length > 0 && prev24hQuery.rows.length > 0) {
            const latest = latestQuery.rows[0];
            const prev = prev24hQuery.rows[0];
            
            console.log("\nTrend calculation test:");
            console.log("  latest.mid:", latest.mid, "type:", typeof latest.mid);
            console.log("  prev.mid:", prev.mid, "type:", typeof prev.mid);
            
            if (latest.mid != null && prev.mid != null && prev.mid !== 0) {
                const trendValue = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                console.log("  Calculated trend:", trendValue);
                console.log("  isFinite?", isFinite(trendValue));
                console.log("  isNaN?", isNaN(trendValue));
            } else {
                console.log("  Cannot calculate - missing data");
                console.log("  latest.mid != null?", latest.mid != null);
                console.log("  prev.mid != null?", prev.mid != null);
                console.log("  prev.mid !== 0?", prev.mid !== 0);
            }
        }
        
    } catch (err) {
        console.error("Error:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
})();

