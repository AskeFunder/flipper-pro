require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        const now = Math.floor(Date.now() / 1000);
        
        // Get canonical data
        const canonical = await db.query(`
            SELECT item_id, name, trend_5m, trend_24h, buy_sell_rate_24h
            FROM canonical_items 
            WHERE item_id = 2351
        `);
        
        if (canonical.rows.length > 0) {
            const item = canonical.rows[0];
            console.log("Canonical Data for Item 2351:");
            console.log("Trend 5m:", item.trend_5m);
            console.log("Trend 24h:", item.trend_24h);
            console.log("Buy/Sell Rate 24h:", item.buy_sell_rate_24h);
        }
        
        // Check 5m trend calculation - latest vs 5 minutes ago
        const latest5m = await db.query(`
            SELECT DISTINCT ON (item_id) 
                timestamp, avg_high, avg_low,
                CASE 
                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL
                END as mid
            FROM price_5m
            WHERE item_id = 2351 AND timestamp >= $1
            ORDER BY item_id, timestamp DESC
            LIMIT 1
        `, [now - 300]);
        
        const prev5m = await db.query(`
            SELECT 
                timestamp, avg_high, avg_low,
                CASE 
                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL
                END as mid
            FROM price_5m
            WHERE item_id = 2351 
              AND timestamp <= $1
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC
            LIMIT 1
        `, [latest5m.rows.length > 0 ? latest5m.rows[0].timestamp - 300 : now - 600]);
        
        if (latest5m.rows.length > 0 && prev5m.rows.length > 0) {
            const nowPrice = parseFloat(latest5m.rows[0].mid);
            const thenPrice = parseFloat(prev5m.rows[0].mid);
            const calcTrend = thenPrice > 0 ? ((nowPrice - thenPrice) / thenPrice) * 100 : null;
            
            console.log("\nTrend 5m Calculation:");
            console.log("Latest Price:", nowPrice, "at", new Date(latest5m.rows[0].timestamp * 1000).toISOString());
            console.log("Previous Price (5m ago):", thenPrice, "at", new Date(prev5m.rows[0].timestamp * 1000).toISOString());
            console.log("Time difference:", (latest5m.rows[0].timestamp - prev5m.rows[0].timestamp), "seconds");
            console.log("Calculated Trend:", calcTrend?.toFixed(2) + "%");
            console.log("Stored Trend:", canonical.rows[0]?.trend_5m);
        } else {
            console.log("\nCould not find price data for 5m trend calculation");
            if (latest5m.rows.length === 0) console.log("  No latest 5m data");
            if (prev5m.rows.length === 0) console.log("  No previous 5m data");
        }
        
        // Show recent 5m candles
        const recent = await db.query(`
            SELECT 
                timestamp,
                avg_high,
                avg_low,
                CASE 
                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL
                END as mid
            FROM price_5m
            WHERE item_id = 2351 
              AND timestamp >= $1
            ORDER BY timestamp DESC
            LIMIT 5
        `, [now - 600]);
        
        if (recent.rows.length > 0) {
            console.log("\nRecent 5m Candles:");
            recent.rows.forEach((candle, i) => {
                console.log(`  ${i + 1}. ${new Date(candle.timestamp * 1000).toISOString()}: Mid=${candle.mid?.toFixed(0)}`);
            });
        }
        
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await db.end();
    }
})();




