require("dotenv").config();
const db = require("../db/db");
const { calculateTrendFromCandles } = require("../poller/update-canonical-items");

(async () => {
    try {
        const itemId = 2351;
        const now = Math.floor(Date.now() / 1000);
        
        console.log("=".repeat(80));
        console.log(`Trend Diagnostic for Item ${itemId} (Iron Bar)`);
        console.log("=".repeat(80));
        
        // Get current canonical data
        const canonical = await db.query(`
            SELECT 
                trend_5m, trend_1h, trend_6h, trend_24h, 
                trend_7d, trend_1m, trend_3m, trend_1y,
                timestamp_updated
            FROM canonical_items
            WHERE item_id = $1
        `, [itemId]);
        
        console.log("\n📊 CURRENT CANONICAL VALUES:");
        if (canonical.rows.length > 0) {
            const c = canonical.rows[0];
            const formatTrend = (val) => {
                if (val == null) return 'null';
                const num = typeof val === 'string' ? parseFloat(val) : val;
                if (isNaN(num) || !isFinite(num)) return 'NaN';
                return num.toFixed(2) + '%';
            };
            console.log(`  Trend 5m:  ${formatTrend(c.trend_5m)}`);
            console.log(`  Trend 1h:  ${formatTrend(c.trend_1h)}`);
            console.log(`  Trend 6h:  ${formatTrend(c.trend_6h)}`);
            console.log(`  Trend 24h: ${formatTrend(c.trend_24h)}`);
            console.log(`  Trend 7d:  ${formatTrend(c.trend_7d)}`);
            console.log(`  Trend 1m:  ${formatTrend(c.trend_1m)}`);
            console.log(`  Trend 3m:  ${formatTrend(c.trend_3m)}`);
            console.log(`  Trend 1y:  ${formatTrend(c.trend_1y)}`);
            console.log(`  Last updated: ${new Date(c.timestamp_updated * 1000).toISOString()}`);
        } else {
            console.log("  No canonical data found");
        }
        
        // Define trend configurations
        // Note: 5m, 1h, 6h, and 24h trends are ALL based on 5m candles
        const trends = [
            { name: '5m', period: 5 * 60, tolerance: 2 * 60, table: 'price_5m', window: 15 * 60 },
            { name: '1h', period: 60 * 60, tolerance: 5 * 60, table: 'price_5m', window: 2 * 60 * 60 },
            { name: '6h', period: 6 * 60 * 60, tolerance: 20 * 60, table: 'price_5m', window: 8 * 60 * 60 },
            { name: '24h', period: 24 * 60 * 60, tolerance: 5 * 60, table: 'price_5m', window: 26 * 60 * 60 },
            { name: '7d', period: 7 * 24 * 60 * 60, tolerance: 6 * 60 * 60, table: 'price_1h', window: 8 * 24 * 60 * 60 },
            { name: '1m', period: 30 * 24 * 60 * 60, tolerance: 24 * 60 * 60, table: 'price_6h', window: 32 * 24 * 60 * 60 },
            { name: '3m', period: 90 * 24 * 60 * 60, tolerance: 7 * 24 * 60 * 60, table: 'price_24h', window: 95 * 24 * 60 * 60 },
            { name: '1y', period: 365 * 24 * 60 * 60, tolerance: 7 * 24 * 60 * 60, table: 'price_24h', window: 370 * 24 * 60 * 60 }
        ];
        
        console.log("\n" + "=".repeat(80));
        console.log("🔍 CALCULATED VALUES (from raw data):");
        console.log("=".repeat(80));
        
        const results = [];
        
        for (const trend of trends) {
            // Fetch ALL candles - use a very large window to ensure we capture all data
            // Don't limit by timestamp window - just get all available data for this item
            // The calculateTrendFromCandles function will handle finding the right candles
            const fetchWindowStart = 0; // Start from beginning (will be filtered by table's actual data)
            const fetchWindowEnd = now + 86400 * 2; // 2 days in future as buffer
            
            // First, check what the actual latest timestamp is in the table for this item
            const latestCheck = await db.query(`
                SELECT MAX(timestamp) as latest_ts, COUNT(*) as total_count
                FROM ${trend.table}
                WHERE item_id = $1
            `, [itemId]);
            
            const latestTimestamp = latestCheck.rows[0]?.latest_ts;
            const totalCount = latestCheck.rows[0]?.total_count || 0;
            
            // Fetch candles - get all recent data (last 30 days should be enough for any trend)
            const candlesQuery = await db.query(`
                SELECT timestamp, avg_high, avg_low,
                       CASE 
                           WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                           WHEN avg_high IS NOT NULL THEN avg_high
                           WHEN avg_low IS NOT NULL THEN avg_low
                           ELSE NULL
                       END AS mid
                FROM ${trend.table}
                WHERE item_id = $1
                  AND timestamp >= $2
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY timestamp DESC
            `, [itemId, now - (86400 * 30)]); // Last 30 days
            
            const candles = candlesQuery.rows.map(row => ({
                timestamp: row.timestamp,
                avg_high: row.avg_high,
                avg_low: row.avg_low,
                mid: row.mid
            }));
            
            // Use the actual calculateTrendFromCandles function for accurate calculation
            // This matches exactly how trends are calculated in production
            const auditContext = { itemId, trendType: trend.name.toUpperCase(), source: trend.table };
            const trendResult = calculateTrendFromCandles(candles, trend.period, trend.tolerance, auditContext);
            
            const calculatedValue = trendResult.value;
            const status = trendResult.status;
            
            const storedRaw = canonical.rows[0] ? canonical.rows[0][`trend_${trend.name}`] : null;
            const storedValue = storedRaw != null ? (typeof storedRaw === 'string' ? parseFloat(storedRaw) : storedRaw) : null;
            
            const isStoredValid = storedValue != null && !isNaN(storedValue) && isFinite(storedValue);
            const isCalculatedValid = calculatedValue != null && !isNaN(calculatedValue) && isFinite(calculatedValue);
            
            let match = "❌";
            if (!isStoredValid && !isCalculatedValid) {
                match = "✅";
            } else if (isStoredValid && isCalculatedValid) {
                const diff = Math.abs(storedValue - calculatedValue);
                if (diff < 0.01) { // Within 0.01% tolerance
                    match = "✅";
                } else {
                    match = `⚠️  (diff: ${diff.toFixed(2)}%)`;
                }
            } else if (!isStoredValid && isCalculatedValid) {
                match = "⚠️  (stored invalid, calculated valid)";
            } else if (isStoredValid && !isCalculatedValid) {
                match = "⚠️  (stored valid, calculated invalid)";
            }
            
            results.push({
                name: trend.name,
                stored: storedValue,
                calculated: calculatedValue,
                status: status,
                match: match,
                candleCount: candles.length
            });
            
            const formatValue = (val) => {
                if (val == null || isNaN(val) || !isFinite(val)) return 'null/NaN';
                return val.toFixed(2) + '%';
            };
            
            console.log(`\n${trend.name.toUpperCase().padEnd(4)} Trend:`);
            console.log(`  Stored:     ${formatValue(storedValue)}`);
            console.log(`  Calculated: ${formatValue(calculatedValue)} (${status})`);
            console.log(`  Match:      ${match}`);
            console.log(`  Candles:    ${candles.length} (from ${trend.table})`);
            if (latestTimestamp) {
                const latestDate = new Date(latestTimestamp * 1000).toISOString();
                const ageSeconds = now - latestTimestamp;
                console.log(`  Latest TS:  ${latestDate} (${ageSeconds}s ago, ${Math.floor(ageSeconds/60)} min ago)`);
            }
            if (totalCount > 0) {
                console.log(`  Total rows: ${totalCount} in table for this item`);
            }
            
            // Debug: Show which candles are being used from trendResult
            if (status === "valid" && trendResult.nowTimestamp && trendResult.matchedTimestamp) {
                const sortedCandles = candles
                    .filter(c => c.timestamp != null && c.mid != null)
                    .sort((a, b) => b.timestamp - a.timestamp);
                
                const latestCandle = sortedCandles.find(c => c.timestamp === trendResult.nowTimestamp);
                const matchedCandle = sortedCandles.find(c => c.timestamp === trendResult.matchedTimestamp);
                
                if (latestCandle && matchedCandle) {
                    console.log(`  📊 Latest: ${new Date(latestCandle.timestamp * 1000).toISOString()} mid=${latestCandle.mid}`);
                    console.log(`  📊 Matched: ${new Date(matchedCandle.timestamp * 1000).toISOString()} mid=${matchedCandle.mid}`);
                    console.log(`  📊 Time diff: ${latestCandle.timestamp - matchedCandle.timestamp}s (expected: ${trend.period}s)`);
                    console.log(`  📊 Distance from target: ${Math.abs(matchedCandle.timestamp - trendResult.targetTimestamp)}s`);
                }
            }
            
            if (status === "unavailable" && candles.length > 0 && trendResult.nowTimestamp) {
                const sortedCandles = candles
                    .filter(c => c.timestamp != null)
                    .sort((a, b) => b.timestamp - a.timestamp);
                
                if (sortedCandles.length > 0) {
                    const latestCandle = sortedCandles[0];
                    const targetTimestamp = trendResult.targetTimestamp || (latestCandle.timestamp - trend.period);
                    const toleranceLower = targetTimestamp - trend.tolerance;
                    const toleranceUpper = targetTimestamp + trend.tolerance;
                    
                    const candlesInTolerance = sortedCandles.filter(c => 
                        c.timestamp >= toleranceLower && c.timestamp <= toleranceUpper
                    );
                    
                    console.log(`  ⚠️  No candle found within tolerance window`);
                    console.log(`     Latest: ${new Date(latestCandle.timestamp * 1000).toISOString()}`);
                    console.log(`     Target: ${new Date(targetTimestamp * 1000).toISOString()}`);
                    console.log(`     Window: ${new Date(toleranceLower * 1000).toISOString()} to ${new Date(toleranceUpper * 1000).toISOString()}`);
                    console.log(`     Found: ${candlesInTolerance.length} candles in tolerance`);
                }
            }
        }
        
        // Summary
        console.log("\n" + "=".repeat(80));
        console.log("📋 SUMMARY:");
        console.log("=".repeat(80));
        
        const matching = results.filter(r => r.match === "✅").length;
        const mismatching = results.filter(r => r.match.startsWith("⚠️")).length;
        const errors = results.filter(r => r.match === "❌").length;
        
        console.log(`✅ Matching:     ${matching}/${results.length}`);
        console.log(`⚠️  Close match:  ${mismatching}/${results.length}`);
        console.log(`❌ Mismatch:      ${errors}/${results.length}`);
        
        console.log("\nDetailed breakdown:");
        results.forEach(r => {
            const icon = r.match === "✅" ? "✅" : r.match.startsWith("⚠️") ? "⚠️" : "❌";
            const formatVal = (v) => v != null && !isNaN(v) && isFinite(v) ? v.toFixed(2) + '%' : 'null/NaN';
            console.log(`  ${icon} ${r.name.padEnd(4)}: stored=${formatVal(r.stored)}, calc=${formatVal(r.calculated)}, status=${r.status}`);
        });
        
    } catch (err) {
        console.error("Error:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
})();

