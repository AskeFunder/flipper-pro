require("dotenv").config();
const db = require("../db/db");
const { calculateBatchTrends } = require("../poller/update-canonical-items");

/**
 * Mock test of canonical update speed
 * Simulates updating all items without actually writing to database
 * Tests the trend calculation performance which is the most expensive part
 */
async function testCanonicalUpdateSpeed() {
    const startTime = Date.now();
    const now = Math.floor(Date.now() / 1000);
    
    console.log("🚀 Starting mock canonical update speed test...");
    console.log("📝 This test calculates trends for all items (no DB writes)\n");
    
    try {
        // Get all item IDs
        console.log("📊 Fetching all items...");
        const itemsStart = Date.now();
        const { rows: items } = await db.query(`
            SELECT id, name FROM items ORDER BY id
        `);
        const itemsTime = ((Date.now() - itemsStart) / 1000).toFixed(2);
        console.log(`✅ Found ${items.length} items (${itemsTime}s)\n`);
        
        // Test different batch sizes (same as canonical update uses)
        const batchSizes = [25, 50, 100, 200];
        
        const results = [];
        
        for (const batchSize of batchSizes) {
            console.log(`\n${"=".repeat(70)}`);
            console.log(`🧪 Testing with batch size: ${batchSize}`);
            console.log(`${"=".repeat(70)}\n`);
            
            const batchStart = Date.now();
            let totalBatches = 0;
            let totalTrendsCalculated = 0;
            let itemsWithTrends = 0;
            
            // Process items in batches
            for (let i = 0; i < items.length; i += batchSize) {
                const batch = items.slice(i, i + batchSize);
                const itemIds = batch.map(item => item.id);
                
                const batchCalcStart = Date.now();
                
                // Calculate trends (this is the expensive part)
                const trendsMap = await calculateBatchTrends(itemIds, now);
                
                const batchCalcTime = ((Date.now() - batchCalcStart) / 1000).toFixed(3);
                totalBatches++;
                
                // Count trends calculated
                for (const [itemId, trends] of trendsMap.entries()) {
                    const trendCount = Object.values(trends).filter(v => v !== null).length;
                    totalTrendsCalculated += trendCount;
                    if (trendCount > 0) itemsWithTrends++;
                }
                
                // Progress indicator
                const progress = ((i + batch.length) / items.length * 100).toFixed(1);
                const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
                const avgTimePerBatch = ((Date.now() - batchStart) / totalBatches / 1000).toFixed(3);
                const remainingBatches = Math.ceil((items.length - i - batch.length) / batchSize);
                const estimatedRemaining = (remainingBatches * parseFloat(avgTimePerBatch)).toFixed(1);
                
                process.stdout.write(
                    `\r  Batch ${totalBatches}/${Math.ceil(items.length / batchSize)}: ` +
                    `${batch.length} items (${batchCalcTime}s) | ` +
                    `Progress: ${progress}% | ` +
                    `Elapsed: ${elapsed}s | ` +
                    `ETA: ${estimatedRemaining}s`
                );
            }
            
            const totalTime = ((Date.now() - batchStart) / 1000).toFixed(2);
            const itemsPerSecond = (items.length / parseFloat(totalTime)).toFixed(1);
            const trendsPerSecond = (totalTrendsCalculated / parseFloat(totalTime)).toFixed(1);
            const timePerItem = (parseFloat(totalTime) / items.length * 1000).toFixed(2);
            const timePerBatch = (parseFloat(totalTime) / totalBatches).toFixed(3);
            
            console.log(`\n\n📊 Results for batch size ${batchSize}:`);
            console.log(`   Total items: ${items.length}`);
            console.log(`   Items with trends: ${itemsWithTrends}`);
            console.log(`   Total batches: ${totalBatches}`);
            console.log(`   Total trends calculated: ${totalTrendsCalculated}`);
            console.log(`   Total time: ${totalTime}s`);
            console.log(`   Items/second: ${itemsPerSecond}`);
            console.log(`   Trends/second: ${trendsPerSecond}`);
            console.log(`   Time per item: ${timePerItem}ms`);
            console.log(`   Time per batch: ${timePerBatch}s`);
            
            results.push({
                batchSize,
                totalTime: parseFloat(totalTime),
                itemsPerSecond: parseFloat(itemsPerSecond),
                timePerItem: parseFloat(timePerItem)
            });
        }
        
        // Summary
        console.log(`\n\n${"=".repeat(70)}`);
        console.log("📈 Performance Summary");
        console.log(`${"=".repeat(70)}\n`);
        console.log("Batch Size | Total Time | Items/sec | Time/item");
        console.log("-".repeat(70));
        results.forEach(r => {
            console.log(
                `${r.batchSize.toString().padStart(10)} | ` +
                `${r.totalTime.toFixed(2).padStart(10)}s | ` +
                `${r.itemsPerSecond.toFixed(1).padStart(9)} | ` +
                `${r.timePerItem.toFixed(2).padStart(9)}ms`
            );
        });
        
        // Find best batch size
        const best = results.reduce((best, current) => 
            current.itemsPerSecond > best.itemsPerSecond ? current : best
        );
        console.log(`\n🏆 Best performance: batch size ${best.batchSize} (${best.itemsPerSecond} items/sec)`);
        
        const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n✅ Mock test completed in ${totalElapsed}s`);
        console.log(`\n💡 Note: This test only calculates trends (no DB writes)`);
        console.log(`   Actual canonical update includes:`);
        console.log(`   - Fetching prices, volumes, turnovers, buy/sell rates`);
        console.log(`   - Database INSERT/UPDATE operations`);
        console.log(`   - Expected to be ~20-30% slower than this test\n`);
        
    } catch (err) {
        console.error("\n❌ Error:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
}

testCanonicalUpdateSpeed();

