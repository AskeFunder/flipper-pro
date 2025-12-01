require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        const itemId = 2351;
        const now = Math.floor(Date.now() / 1000);
        
        console.log("=".repeat(80));
        console.log("Debugging Trend Calculations for Item 2351");
        console.log("=".repeat(80));
        
        // Check 5m trend - what the batch function would use
        console.log("\n📊 5M TREND (Batch Function Approach):");
        const latest5m = await db.query(`
            SELECT DISTINCT ON (item_id) 
                item_id, 
                timestamp AS latest_ts,
                CASE 
                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL
                END AS mid
            FROM price_5m
            WHERE item_id = $1 AND timestamp >= $2 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        `, [itemId, now - 600]);
        
        if (latest5m.rows.length > 0) {
            const latest = latest5m.rows[0];
            console.log("  Latest 5m:", new Date(latest.latest_ts * 1000).toISOString(), "mid:", latest.mid);
            
            const prev5m = await db.query(`
                SELECT 
                    timestamp AS prev_ts,
                    CASE 
                        WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                        WHEN avg_high IS NOT NULL THEN avg_high
                        WHEN avg_low IS NOT NULL THEN avg_low
                        ELSE NULL
                    END AS mid
                FROM price_5m
                WHERE item_id = $1 
                  AND timestamp <= $2
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY timestamp DESC
                LIMIT 1
            `, [itemId, latest.latest_ts - 300]);
            
            if (prev5m.rows.length > 0) {
                const prev = prev5m.rows[0];
                console.log("  Previous 5m:", new Date(prev.prev_ts * 1000).toISOString(), "mid:", prev.mid);
                console.log("  Time diff:", latest.latest_ts - prev.prev_ts, "seconds");
                
                if (latest.mid != null && prev.mid != null && prev.mid !== 0) {
                    const batchTrend = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                    console.log("  Batch calculated trend:", batchTrend + "%");
                }
            }
        }
        
        // Check 24h trend - what the batch function would use
        console.log("\n📊 24H TREND (Batch Function Approach):");
        if (latest5m.rows.length > 0) {
            const latest = latest5m.rows[0];
            
            const prev24h = await db.query(`
                SELECT 
                    timestamp AS prev_ts,
                    CASE 
                        WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                        WHEN avg_high IS NOT NULL THEN avg_high
                        WHEN avg_low IS NOT NULL THEN avg_low
                        ELSE NULL
                    END AS mid
                FROM price_5m
                WHERE item_id = $1 
                  AND timestamp <= $2
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY ABS(timestamp - ($3 - 86400)) ASC, timestamp DESC
                LIMIT 1
            `, [itemId, latest.latest_ts, latest.latest_ts]);
            
            if (prev24h.rows.length > 0) {
                const prev = prev24h.rows[0];
                const target24h = latest.latest_ts - 86400;
                console.log("  Latest 5m:", new Date(latest.latest_ts * 1000).toISOString(), "mid:", latest.mid);
                console.log("  Target 24h ago:", new Date(target24h * 1000).toISOString());
                console.log("  Previous 5m:", new Date(prev.prev_ts * 1000).toISOString(), "mid:", prev.mid);
                console.log("  Time diff from target:", Math.abs(prev.prev_ts - target24h), "seconds");
                
                if (latest.mid != null && prev.mid != null && prev.mid !== 0) {
                    const batchTrend = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                    console.log("  Batch calculated trend:", batchTrend + "%");
                }
            }
        }
        
        // Check what the pure function would calculate
        console.log("\n📊 5M TREND (Pure Function Approach):");
        const candles5m = await db.query(`
            SELECT timestamp, avg_high, avg_low
            FROM price_5m
            WHERE item_id = $1
              AND timestamp >= $2
              AND timestamp <= $3
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC
        `, [itemId, now - (5 * 60 + 2 * 60 + 300), now + 300]);
        
        const candles = candles5m.rows.map(r => ({
            timestamp: r.timestamp,
            avg_high: r.avg_high,
            avg_low: r.avg_low
        }));
        
        if (candles.length > 0) {
            const latestCandle = candles[0];
            const targetTimestamp = latestCandle.timestamp - (5 * 60);
            const tolerance = 2 * 60;
            
            console.log("  Latest candle:", new Date(latestCandle.timestamp * 1000).toISOString());
            console.log("  Target (5m ago):", new Date(targetTimestamp * 1000).toISOString());
            
            const matchedCandle = candles.find(c => 
                c.timestamp >= targetTimestamp - tolerance && 
                c.timestamp <= targetTimestamp + tolerance
            );
            
            if (matchedCandle) {
                const latestMid = latestCandle.avg_high != null && latestCandle.avg_low != null
                    ? (latestCandle.avg_high + latestCandle.avg_low) / 2
                    : latestCandle.avg_high || latestCandle.avg_low;
                const matchedMid = matchedCandle.avg_high != null && matchedCandle.avg_low != null
                    ? (matchedCandle.avg_high + matchedCandle.avg_low) / 2
                    : matchedCandle.avg_high || matchedCandle.avg_low;
                
                console.log("  Matched candle:", new Date(matchedCandle.timestamp * 1000).toISOString());
                console.log("  Latest mid:", latestMid);
                console.log("  Matched mid:", matchedMid);
                
                if (matchedMid !== 0) {
                    const pureTrend = parseFloat((100.0 * (latestMid - matchedMid) / matchedMid).toFixed(2));
                    console.log("  Pure function trend:", pureTrend + "%");
                }
            }
        }
        
    } catch (err) {
        console.error("Error:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
})();



