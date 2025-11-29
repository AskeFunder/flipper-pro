require("dotenv").config();
const db = require("../db/db");
const { calculateBatchTrends, calculateBatchTrendsWithCaching } = require("../poller/update-canonical-items");

/**
 * Test and compare different optimization strategies
 */
async function testStrategyComparison() {
    console.log("=".repeat(80));
    console.log("STRATEGY COMPARISON TEST");
    console.log("=".repeat(80));
    console.log();
    
    try {
        // Get test items
        const { rows: allItems } = await db.query(`SELECT id, name FROM items ORDER BY id LIMIT 200`);
        const now = Math.floor(Date.now() / 1000);
        
        const batchSizes = [100, 200];
        const strategies = [
            { name: "Baseline", fn: calculateBatchTrends },
            { name: "Strategy 2: Caching", fn: calculateBatchTrendsWithCaching }
        ];
        
        const results = {};
        
        for (const batchSize of batchSizes) {
            console.log(`\n${"=".repeat(80)}`);
            console.log(`Batch Size: ${batchSize}`);
            console.log(`${"=".repeat(80)}\n`);
            
            const itemIds = allItems.slice(0, batchSize).map(item => item.id);
            results[batchSize] = {};
            
            for (const strategy of strategies) {
                console.log(`Testing: ${strategy.name}`);
                
                // Warm up
                await strategy.fn(itemIds.slice(0, 10), now);
                
                // Run 3 iterations
                const times = [];
                for (let i = 0; i < 3; i++) {
                    const start = Date.now();
                    await strategy.fn(itemIds, now);
                    const elapsed = (Date.now() - start) / 1000;
                    times.push(elapsed);
                }
                
                const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
                const itemsPerSec = batchSize / avgTime;
                
                results[batchSize][strategy.name] = {
                    avgTime,
                    itemsPerSec,
                    times
                };
                
                console.log(`  Avg Time: ${avgTime.toFixed(3)}s`);
                console.log(`  Items/sec: ${itemsPerSec.toFixed(1)}`);
                console.log();
            }
            
            // Compare
            const baseline = results[batchSize]["Baseline"];
            const strategy2 = results[batchSize]["Strategy 2: Caching"];
            if (baseline && strategy2) {
                const improvement = ((strategy2.itemsPerSec - baseline.itemsPerSec) / baseline.itemsPerSec * 100).toFixed(1);
                console.log(`Improvement: ${improvement}%`);
                console.log();
            }
        }
        
        // Summary
        console.log(`\n${"=".repeat(80)}`);
        console.log("SUMMARY");
        console.log(`${"=".repeat(80)}\n`);
        console.log("Batch Size | Strategy | Items/sec | Improvement");
        console.log("-".repeat(80));
        
        for (const batchSize of batchSizes) {
            const baseline = results[batchSize]["Baseline"];
            const strategy2 = results[batchSize]["Strategy 2: Caching"];
            
            console.log(
                `${batchSize.toString().padStart(10)} | Baseline | ` +
                `${baseline.itemsPerSec.toFixed(1).padStart(9)} | -`
            );
            
            if (strategy2) {
                const improvement = ((strategy2.itemsPerSec - baseline.itemsPerSec) / baseline.itemsPerSec * 100).toFixed(1);
                console.log(
                    `${batchSize.toString().padStart(10)} | Strategy 2 | ` +
                    `${strategy2.itemsPerSec.toFixed(1).padStart(9)} | ${improvement.padStart(10)}%`
                );
            }
        }
        
    } catch (err) {
        console.error("\nError:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
}

if (require.main === module) {
    testStrategyComparison();
}

module.exports = { testStrategyComparison };

