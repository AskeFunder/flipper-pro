require("dotenv").config();
const db = require("../db/db");
const { calculateBatchTrends } = require("../poller/update-canonical-items");

async function testBatchPerformance() {
    try {
        // Get a full batch of items (matching the batch size in update-canonical-items.js)
        const batchSize = 200;
        const { rows: items } = await db.query(`
            SELECT id 
            FROM items 
            LIMIT $1
        `, [batchSize]);
        
        if (items.length === 0) {
            console.log("No items found");
            return;
        }
        
        const itemIds = items.map(item => item.id);
        const now = Math.floor(Date.now() / 1000);
        
        console.log(`Testing batch performance with ${itemIds.length} items...\n`);
        console.log(`Target: <500ms (0.5 seconds) for 200 items\n`);
        
        // Warm up (first query is often slower due to connection setup)
        console.log("Warming up...");
        await calculateBatchTrends(itemIds.slice(0, 10), now);
        
        // Test multiple runs
        const runs = 5;
        const times = [];
        
        for (let i = 0; i < runs; i++) {
            const start = process.hrtime.bigint();
            const trends = await calculateBatchTrends(itemIds, now);
            const end = process.hrtime.bigint();
            const duration = Number(end - start) / 1_000_000; // Convert to milliseconds
            times.push(duration);
            
            console.log(`Run ${i + 1}: ${duration.toFixed(2)}ms (${(duration/1000).toFixed(3)}s) - Found trends for ${trends.size} items`);
        }
        
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        
        console.log(`\nPerformance Summary:`);
        console.log(`  Average: ${avgTime.toFixed(2)}ms (${(avgTime/1000).toFixed(3)}s)`);
        console.log(`  Min: ${minTime.toFixed(2)}ms (${(minTime/1000).toFixed(3)}s)`);
        console.log(`  Max: ${maxTime.toFixed(2)}ms (${(maxTime/1000).toFixed(3)}s)`);
        console.log(`  Target: <500ms (0.5 seconds) for ${itemIds.length} items`);
        
        if (avgTime < 500) {
            console.log(`\n✅ SUCCESS: Average time is under 0.5 seconds!`);
        } else {
            const overage = avgTime - 500;
            console.log(`\n❌ NEEDS OPTIMIZATION: Average time is ${(avgTime / 1000).toFixed(3)} seconds`);
            console.log(`   Need to reduce by ${(overage / 1000).toFixed(3)} seconds (${((overage / avgTime) * 100).toFixed(1)}% faster)`);
        }
        
        // Show sample results
        const trends = await calculateBatchTrends(itemIds.slice(0, 5), now);
        console.log(`\nSample results for first 5 items:`);
        for (const [itemId, trendData] of trends.entries()) {
            const { rows: itemInfo } = await db.query(`SELECT name FROM items WHERE id = $1`, [itemId]);
            const name = itemInfo[0]?.name || `Item ${itemId}`;
            console.log(`  ${name}:`);
            if (trendData.trend_5m !== null) console.log(`    trend_5m: ${trendData.trend_5m}%`);
            if (trendData.trend_1h !== null) console.log(`    trend_1h: ${trendData.trend_1h}%`);
            if (trendData.trend_6h !== null) console.log(`    trend_6h: ${trendData.trend_6h}%`);
            if (trendData.trend_24h !== null) console.log(`    trend_24h: ${trendData.trend_24h}%`);
            if (trendData.trend_7d !== null) console.log(`    trend_7d: ${trendData.trend_7d}%`);
            if (trendData.trend_1m !== null) console.log(`    trend_1m: ${trendData.trend_1m}%`);
            if (trendData.trend_3m !== null) console.log(`    trend_3m: ${trendData.trend_3m}%`);
            if (trendData.trend_1y !== null) console.log(`    trend_1y: ${trendData.trend_1y}%`);
        }
        
    } catch (err) {
        console.error("Error testing batch performance:", err);
    } finally {
        await db.end();
    }
}

testBatchPerformance();

