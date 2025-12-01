require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        const now = Math.floor(Date.now() / 1000);
        
        // Get canonical data
        const canonical = await db.query(`
            SELECT item_id, name, trend_24h, buy_sell_rate_24h, high, low, volume_24h
            FROM canonical_items 
            WHERE item_id = 2351
        `);
        
        if (canonical.rows.length > 0) {
            const item = canonical.rows[0];
            console.log("Canonical Data for Item 2351:");
            console.log("Trend 24h:", item.trend_24h);
            console.log("Buy/Sell Rate 24h:", item.buy_sell_rate_24h);
            console.log("High:", item.high, "Low:", item.low);
            console.log("Volume 24h:", item.volume_24h);
        }
        
        // Check buy/sell rate calculation
        const bsr = await db.query(`
            SELECT 
                SUM(CASE WHEN timestamp >= $1 THEN high_volume ELSE 0 END) as hv,
                SUM(CASE WHEN timestamp >= $1 THEN low_volume ELSE 0 END) as lv,
                COUNT(*) as count
            FROM price_5m
            WHERE item_id = 2351 AND timestamp >= $1
        `, [now - 86400]);
        
        if (bsr.rows.length > 0) {
            const row = bsr.rows[0];
            const calc = row.lv > 0 ? (parseFloat(row.hv) / parseFloat(row.lv)).toFixed(2) : null;
            console.log("\nBuy/Sell Rate Calculation:");
            console.log("High Vol Sum:", row.hv);
            console.log("Low Vol Sum:", row.lv);
            console.log("Calculated:", calc);
            console.log("Candle Count:", row.count);
        }
        
        // Check trend calculation
        const trendNow = await db.query(`
            SELECT timestamp, avg_high, avg_low,
                CASE 
                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL
                END as mid
            FROM price_5m
            WHERE item_id = 2351 AND timestamp >= $1
            ORDER BY timestamp DESC LIMIT 1
        `, [now - 300]);
        
        const trend24h = await db.query(`
            SELECT timestamp, avg_high, avg_low,
                CASE 
                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL
                END as mid
            FROM price_5m
            WHERE item_id = 2351 
              AND timestamp >= $1 AND timestamp <= $2
              AND ABS(timestamp - $3) <= 3600
            ORDER BY ABS(timestamp - $3) ASC LIMIT 1
        `, [now - 172800, now - 86400, now - 86400]);
        
        if (trendNow.rows.length > 0 && trend24h.rows.length > 0) {
            const nowPrice = parseFloat(trendNow.rows[0].mid);
            const thenPrice = parseFloat(trend24h.rows[0].mid);
            const calcTrend = thenPrice > 0 ? ((nowPrice - thenPrice) / thenPrice) * 100 : null;
            
            console.log("\nTrend 24h Calculation:");
            console.log("Now Price:", nowPrice, "at", new Date(trendNow.rows[0].timestamp * 1000).toISOString());
            console.log("Then Price:", thenPrice, "at", new Date(trend24h.rows[0].timestamp * 1000).toISOString());
            console.log("Calculated Trend:", calcTrend?.toFixed(2) + "%");
        }
        
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await db.end();
    }
})();




