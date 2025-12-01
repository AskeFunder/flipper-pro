require("dotenv").config();
const db = require("../db/db");
const { calculateTrendFromCandles } = require("../poller/update-canonical-items");

(async () => {
    try {
        const itemId = 2351;
        const now = Math.floor(Date.now() / 1000);
        
        // Check current canonical data
        const canonical = await db.query(`
            SELECT trend_5m, timestamp_updated
            FROM canonical_items
            WHERE item_id = $1
        `, [itemId]);
        
        console.log("Current canonical data for item 2351:");
        if (canonical.rows.length > 0) {
            console.log("  Trend 5m:", canonical.rows[0].trend_5m);
            console.log("  Last updated:", new Date(canonical.rows[0].timestamp_updated * 1000).toISOString());
        }
        
        // Get latest 5m candles for 5m trend calculation
        // 5m trend needs: latest candle and candle from 5 minutes ago
        const periodSeconds = 5 * 60; // 5 minutes
        const toleranceSeconds = 2 * 60; // ±2 minutes tolerance
        
        const candlesQuery = await db.query(`
            SELECT timestamp, avg_high, avg_low
            FROM price_5m
            WHERE item_id = $1
              AND timestamp >= $2
              AND timestamp <= $3
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC
        `, [itemId, now - (periodSeconds + toleranceSeconds + 300), now + 300]); // Extra buffer
        
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
        
        // Test 5m trend calculation
        const auditContext = { itemId, trendType: "5m", source: "5m" };
        const trendResult = calculateTrendFromCandles(candles, periodSeconds, toleranceSeconds, auditContext);
        
        console.log("\n5m Trend calculation result:");
        console.log("  Status:", trendResult.status);
        console.log("  Value:", trendResult.value);
        console.log("  Now timestamp:", trendResult.nowTimestamp ? new Date(trendResult.nowTimestamp * 1000).toISOString() : "null");
        console.log("  Target timestamp (5m ago):", trendResult.targetTimestamp ? new Date(trendResult.targetTimestamp * 1000).toISOString() : "null");
        console.log("  Matched timestamp:", trendResult.matchedTimestamp ? new Date(trendResult.matchedTimestamp * 1000).toISOString() : "null");
        
        if (trendResult.status === "unavailable") {
            console.log("\n⚠️  5m Trend is unavailable - checking why:");
            
            if (candles.length === 0) {
                console.log("  - No candles found in window");
            } else {
                const latestCandle = candles[0];
                const targetTimestamp = latestCandle.timestamp - periodSeconds;
                const toleranceLower = targetTimestamp - toleranceSeconds;
                const toleranceUpper = targetTimestamp + toleranceSeconds;
                
                console.log("  - Latest candle:", new Date(latestCandle.timestamp * 1000).toISOString());
                console.log("  - Target (5m ago):", new Date(targetTimestamp * 1000).toISOString());
                console.log("  - Tolerance window:", new Date(toleranceLower * 1000).toISOString(), "to", new Date(toleranceUpper * 1000).toISOString());
                
                const candlesInTolerance = candles.filter(c => 
                    c.timestamp >= toleranceLower && c.timestamp <= toleranceUpper
                );
                console.log("  - Candles in tolerance window:", candlesInTolerance.length);
                
                if (candlesInTolerance.length === 0) {
                    console.log("  - ❌ No candles found within tolerance!");
                    console.log("  - Available candles around that time:");
                    const nearbyCandles = candles.filter(c => 
                        Math.abs(c.timestamp - targetTimestamp) <= 600 // Within 10 minutes
                    );
                    nearbyCandles.forEach(c => {
                        const mid = c.avg_high != null && c.avg_low != null 
                            ? (c.avg_high + c.avg_low) / 2 
                            : c.avg_high || c.avg_low;
                        const diff = Math.abs(c.timestamp - targetTimestamp);
                        console.log(`    ${new Date(c.timestamp * 1000).toISOString()}: mid=${mid}, diff=${Math.floor(diff)}s`);
                    });
                }
            }
        }
        
        // Also check what the batch calculation would return
        console.log("\n\nChecking batch calculation approach:");
        const latest5mQuery = await db.query(`
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
        `, [itemId, now - 600]); // Last 10 minutes
        
        if (latest5mQuery.rows.length > 0) {
            const latest = latest5mQuery.rows[0];
            console.log("  Latest 5m:", new Date(latest.latest_ts * 1000).toISOString(), "mid:", latest.mid);
            
            // Check for previous 5m (5 minutes before latest)
            const prev5mQuery = await db.query(`
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
            `, [itemId, latest.latest_ts - 300]); // 5 minutes before latest
            
            if (prev5mQuery.rows.length > 0) {
                const prev = prev5mQuery.rows[0];
                console.log("  Previous 5m:", new Date(prev.prev_ts * 1000).toISOString(), "mid:", prev.mid);
                console.log("  Time difference:", latest.latest_ts - prev.prev_ts, "seconds");
                
                if (latest.mid != null && prev.mid != null && prev.mid !== 0) {
                    const calculatedTrend = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                    console.log("  Calculated trend:", calculatedTrend + "%");
                } else {
                    console.log("  ❌ Cannot calculate - missing data:");
                    console.log("    latest.mid:", latest.mid);
                    console.log("    prev.mid:", prev.mid);
                }
            } else {
                console.log("  ❌ No previous 5m candle found (need candle from 5 minutes before latest)");
            }
        } else {
            console.log("  ❌ No latest 5m candle found");
        }
        
    } catch (err) {
        console.error("Error:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
})();




