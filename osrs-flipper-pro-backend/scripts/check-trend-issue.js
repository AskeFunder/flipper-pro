require("dotenv").config();
const db = require("../db/db");
const { calculateTrendFromCandles } = require("../poller/update-canonical-items");

(async () => {
    try {
        const itemId = 2351;
        const now = Math.floor(Date.now() / 1000);
        
        // Check current canonical data
        const canonical = await db.query(`
            SELECT trend_24h, timestamp_updated
            FROM canonical_items
            WHERE item_id = $1
        `, [itemId]);
        
        console.log("Current canonical data:");
        if (canonical.rows.length > 0) {
            console.log("  Trend 24h:", canonical.rows[0].trend_24h);
            console.log("  Last updated:", new Date(canonical.rows[0].timestamp_updated * 1000).toISOString());
        }
        
        // Get latest 5m candles
        const periodSeconds = 24 * 60 * 60; // 24 hours
        const toleranceSeconds = 5 * 60; // ±5 minutes
        
        const candlesQuery = await db.query(`
            SELECT timestamp, avg_high, avg_low
            FROM price_5m
            WHERE item_id = $1
              AND timestamp >= $2
              AND timestamp <= $3
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC
        `, [itemId, now - (periodSeconds + toleranceSeconds), now + toleranceSeconds]);
        
        const candles = candlesQuery.rows.map(row => ({
            timestamp: row.timestamp,
            avg_high: row.avg_high,
            avg_low: row.avg_low
        }));
        
        console.log("\nLatest 5m candles (last 10):");
        candles.slice(0, 10).forEach(c => {
            const mid = c.avg_high != null && c.avg_low != null 
                ? (c.avg_high + c.avg_low) / 2 
                : c.avg_high || c.avg_low;
            console.log(`  ${new Date(c.timestamp * 1000).toISOString()}: high=${c.avg_high}, low=${c.avg_low}, mid=${mid}`);
        });
        
        console.log("\nTotal candles found:", candles.length);
        
        // Test trend calculation
        const auditContext = { itemId, trendType: "24H", source: "5m" };
        const trendResult = calculateTrendFromCandles(candles, periodSeconds, toleranceSeconds, auditContext);
        
        console.log("\nTrend calculation result:");
        console.log("  Status:", trendResult.status);
        console.log("  Value:", trendResult.value);
        console.log("  Now timestamp:", trendResult.nowTimestamp ? new Date(trendResult.nowTimestamp * 1000).toISOString() : "null");
        console.log("  Target timestamp:", trendResult.targetTimestamp ? new Date(trendResult.targetTimestamp * 1000).toISOString() : "null");
        console.log("  Matched timestamp:", trendResult.matchedTimestamp ? new Date(trendResult.matchedTimestamp * 1000).toISOString() : "null");
        
        if (trendResult.status === "unavailable") {
            console.log("\n⚠️  Trend is unavailable - checking why:");
            
            if (candles.length === 0) {
                console.log("  - No candles found in window");
            } else {
                const latestCandle = candles[0];
                const targetTimestamp = latestCandle.timestamp - periodSeconds;
                const toleranceLower = targetTimestamp - toleranceSeconds;
                const toleranceUpper = targetTimestamp + toleranceSeconds;
                
                console.log("  - Latest candle:", new Date(latestCandle.timestamp * 1000).toISOString());
                console.log("  - Target (24h ago):", new Date(targetTimestamp * 1000).toISOString());
                console.log("  - Tolerance window:", new Date(toleranceLower * 1000).toISOString(), "to", new Date(toleranceUpper * 1000).toISOString());
                
                const candlesInTolerance = candles.filter(c => 
                    c.timestamp >= toleranceLower && c.timestamp <= toleranceUpper
                );
                console.log("  - Candles in tolerance window:", candlesInTolerance.length);
                
                if (candlesInTolerance.length === 0) {
                    console.log("  - ❌ No candles found within tolerance!");
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




