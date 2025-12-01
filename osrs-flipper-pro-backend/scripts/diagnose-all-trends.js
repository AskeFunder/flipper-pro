require("dotenv").config();
const db = require("../db/db");
const { calculateTrendFromCandles } = require("../poller/update-canonical-items");

(async () => {
    try {
        const now = Math.floor(Date.now() / 1000);
        
        console.log("=".repeat(80));
        console.log("🔍 DIAGNOSE ALL TRENDS - System-wide Diagnostic");
        console.log("=".repeat(80));
        
        // Get all items from canonical_items
        const allItems = await db.query(`
            SELECT item_id 
            FROM canonical_items 
            ORDER BY item_id
        `);
        
        console.log(`\nFound ${allItems.rows.length} items in canonical_items\n`);
        
        // Define trend configurations
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
        
        // Statistics
        const stats = {
            totalItems: allItems.rows.length,
            itemsWithIssues: 0,
            trendStats: trends.map(t => ({
                name: t.name,
                matching: 0,
                mismatching: 0,
                storedNull: 0,
                calculatedNull: 0,
                bothNull: 0
            }))
        };
        
        const itemsWithIssues = [];
        
        // Process each item
        for (let i = 0; i < allItems.rows.length; i++) {
            const itemId = allItems.rows[i].item_id;
            
            if ((i + 1) % 100 === 0) {
                console.log(`Processing item ${i + 1}/${allItems.rows.length} (item_id: ${itemId})...`);
            }
            
            try {
                // Get current canonical data
                const canonical = await db.query(`
                    SELECT 
                        trend_5m, trend_1h, trend_6h, trend_24h, 
                        trend_7d, trend_1m, trend_3m, trend_1y,
                        timestamp_updated
                    FROM canonical_items
                    WHERE item_id = $1
                `, [itemId]);
                
                if (canonical.rows.length === 0) continue;
                
                const itemIssues = [];
                
                // Check each trend
                for (const trend of trends) {
                    // Get latest timestamp for this item in the trend table
                    const latestCheck = await db.query(`
                        SELECT MAX(timestamp) as latest_ts
                        FROM ${trend.table}
                        WHERE item_id = $1
                    `, [itemId]);
                    
                    const latestTimestamp = latestCheck.rows[0]?.latest_ts;
                    if (!latestTimestamp) continue; // Skip if no data
                    
                    // Fetch candles - last 30 days should be enough
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
                    `, [itemId, now - (86400 * 30)]);
                    
                    const candles = candlesQuery.rows.map(row => ({
                        timestamp: row.timestamp,
                        avg_high: row.avg_high,
                        avg_low: row.avg_low,
                        mid: row.mid
                    }));
                    
                    // Calculate trend
                    const auditContext = { itemId, trendType: trend.name.toUpperCase(), source: trend.table };
                    const trendResult = calculateTrendFromCandles(candles, trend.period, trend.tolerance, auditContext);
                    
                    const calculatedValue = trendResult.value;
                    const status = trendResult.status;
                    
                    const storedRaw = canonical.rows[0][`trend_${trend.name}`];
                    const storedValue = storedRaw != null ? (typeof storedRaw === 'string' ? parseFloat(storedRaw) : storedRaw) : null;
                    
                    const isStoredValid = storedValue != null && !isNaN(storedValue) && isFinite(storedValue);
                    const isCalculatedValid = calculatedValue != null && !isNaN(calculatedValue) && isFinite(calculatedValue);
                    
                    // Update statistics
                    const trendStat = stats.trendStats.find(s => s.name === trend.name);
                    if (!isStoredValid && !isCalculatedValid) {
                        trendStat.bothNull++;
                    } else if (!isStoredValid && isCalculatedValid) {
                        trendStat.storedNull++;
                        itemIssues.push({
                            trend: trend.name,
                            issue: `stored NULL but calculated ${calculatedValue.toFixed(2)}%`,
                            stored: null,
                            calculated: calculatedValue
                        });
                    } else if (isStoredValid && !isCalculatedValid) {
                        trendStat.calculatedNull++;
                        itemIssues.push({
                            trend: trend.name,
                            issue: `stored ${storedValue.toFixed(2)}% but calculated NULL`,
                            stored: storedValue,
                            calculated: null
                        });
                    } else if (isStoredValid && isCalculatedValid) {
                        const diff = Math.abs(storedValue - calculatedValue);
                        if (diff < 0.01) {
                            trendStat.matching++;
                        } else {
                            trendStat.mismatching++;
                            itemIssues.push({
                                trend: trend.name,
                                issue: `mismatch: stored ${storedValue.toFixed(2)}% vs calculated ${calculatedValue.toFixed(2)}% (diff: ${diff.toFixed(2)}%)`,
                                stored: storedValue,
                                calculated: calculatedValue,
                                diff: diff
                            });
                        }
                    }
                }
                
                if (itemIssues.length > 0) {
                    stats.itemsWithIssues++;
                    itemsWithIssues.push({
                        itemId,
                        issues: itemIssues,
                        timestampUpdated: canonical.rows[0].timestamp_updated
                    });
                }
                
            } catch (err) {
                console.error(`Error processing item ${itemId}:`, err.message);
            }
        }
        
        // Print summary
        console.log("\n" + "=".repeat(80));
        console.log("📋 SUMMARY");
        console.log("=".repeat(80));
        console.log(`Total items processed: ${stats.totalItems}`);
        console.log(`Items with issues: ${stats.itemsWithIssues}`);
        console.log(`Items without issues: ${stats.totalItems - stats.itemsWithIssues}`);
        
        console.log("\n" + "=".repeat(80));
        console.log("📊 TREND STATISTICS");
        console.log("=".repeat(80));
        
        for (const trendStat of stats.trendStats) {
            const total = trendStat.matching + trendStat.mismatching + trendStat.storedNull + trendStat.calculatedNull + trendStat.bothNull;
            console.log(`\n${trendStat.name.toUpperCase().padEnd(4)} Trend:`);
            console.log(`  ✅ Matching:        ${trendStat.matching}`);
            console.log(`  ⚠️  Mismatching:      ${trendStat.mismatching}`);
            console.log(`  ⚠️  Stored NULL:      ${trendStat.storedNull}`);
            console.log(`  ⚠️  Calculated NULL:  ${trendStat.calculatedNull}`);
            console.log(`  ✅ Both NULL:        ${trendStat.bothNull}`);
            console.log(`  Total checked:      ${total}`);
        }
        
        // Show items with issues (limit to first 20)
        if (itemsWithIssues.length > 0) {
            console.log("\n" + "=".repeat(80));
            console.log(`⚠️  ITEMS WITH ISSUES (showing first 20 of ${itemsWithIssues.length})`);
            console.log("=".repeat(80));
            
            const itemsToShow = itemsWithIssues.slice(0, 20);
            for (const item of itemsToShow) {
                console.log(`\nItem ${item.itemId} (last updated: ${new Date(item.timestampUpdated * 1000).toISOString()}):`);
                for (const issue of item.issues) {
                    console.log(`  - ${issue.trend}: ${issue.issue}`);
                }
            }
            
            if (itemsWithIssues.length > 20) {
                console.log(`\n... and ${itemsWithIssues.length - 20} more items with issues`);
            }
        } else {
            console.log("\n✅ No items with issues found!");
        }
        
        console.log("\n" + "=".repeat(80));
        console.log("✅ Diagnostic complete");
        console.log("=".repeat(80));
        
    } catch (err) {
        console.error("Error:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
})();



