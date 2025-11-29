require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        const itemId = 2351;
        const now = Math.floor(Date.now() / 1000);
        
        console.log("=".repeat(80));
        console.log("Actual Candle Values for Item 2351");
        console.log("=".repeat(80));
        
        // Get latest 5m candles
        const candles5m = await db.query(`
            SELECT timestamp, avg_high, avg_low,
                   CASE 
                       WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                       WHEN avg_high IS NOT NULL THEN avg_high
                       WHEN avg_low IS NOT NULL THEN avg_low
                       ELSE NULL
                   END AS mid
            FROM price_5m
            WHERE item_id = $1
              AND timestamp >= $2
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC
            LIMIT 20
        `, [itemId, now - (6 * 60 * 60)]); // Last 6 hours
        
        console.log("\n📊 Latest 5m Candles (last 20):");
        candles5m.rows.forEach((c, i) => {
            console.log(`  ${i + 1}. ${new Date(c.timestamp * 1000).toISOString()}: high=${c.avg_high}, low=${c.avg_low}, mid=${c.mid}`);
        });
        
        if (candles5m.rows.length >= 2) {
            const latest = candles5m.rows[0];
            const prev5m = candles5m.rows.find(c => c.timestamp <= latest.timestamp - 300);
            
            console.log("\n🔍 5M TREND Calculation:");
            console.log("  Latest:", new Date(latest.timestamp * 1000).toISOString(), "mid:", latest.mid);
            if (prev5m) {
                console.log("  Previous (5m ago):", new Date(prev5m.timestamp * 1000).toISOString(), "mid:", prev5m.mid);
                console.log("  Time diff:", latest.timestamp - prev5m.timestamp, "seconds");
                if (prev5m.mid != null && prev5m.mid !== 0 && latest.mid != null) {
                    const trend = (100.0 * (latest.mid - prev5m.mid) / prev5m.mid);
                    console.log("  Trend:", trend.toFixed(2) + "%");
                }
            } else {
                console.log("  ❌ No previous candle found 5 minutes before latest");
            }
            
            // 1h trend
            const prev1h = candles5m.rows.find(c => c.timestamp <= latest.timestamp - 3600);
            console.log("\n🔍 1H TREND Calculation:");
            console.log("  Latest:", new Date(latest.timestamp * 1000).toISOString(), "mid:", latest.mid);
            if (prev1h) {
                console.log("  Previous (1h ago):", new Date(prev1h.timestamp * 1000).toISOString(), "mid:", prev1h.mid);
                console.log("  Time diff:", latest.timestamp - prev1h.timestamp, "seconds");
                if (prev1h.mid != null && prev1h.mid !== 0 && latest.mid != null) {
                    const trend = (100.0 * (latest.mid - prev1h.mid) / prev1h.mid);
                    console.log("  Trend:", trend.toFixed(2) + "%");
                }
            } else {
                console.log("  ❌ No previous candle found 1 hour before latest");
            }
            
            // 6h trend
            const prev6h = candles5m.rows.find(c => c.timestamp <= latest.timestamp - 21600);
            console.log("\n🔍 6H TREND Calculation:");
            console.log("  Latest:", new Date(latest.timestamp * 1000).toISOString(), "mid:", latest.mid);
            if (prev6h) {
                console.log("  Previous (6h ago):", new Date(prev6h.timestamp * 1000).toISOString(), "mid:", prev6h.mid);
                console.log("  Time diff:", latest.timestamp - prev6h.timestamp, "seconds");
                if (prev6h.mid != null && prev6h.mid !== 0 && latest.mid != null) {
                    const trend = (100.0 * (latest.mid - prev6h.mid) / prev6h.mid);
                    console.log("  Trend:", trend.toFixed(2) + "%");
                }
            } else {
                console.log("  ❌ No previous candle found 6 hours before latest");
            }
        }
        
    } catch (err) {
        console.error("Error:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
})();

