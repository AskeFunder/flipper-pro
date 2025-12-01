require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        console.log("=".repeat(80));
        console.log("⏱️  CANONICAL UPDATE PERFORMANCE ESTIMATES");
        console.log("=".repeat(80));
        
        // Get current dirty items count
        const dirtyCount = await db.query("SELECT COUNT(*) as count FROM dirty_items");
        const dirtyItems = parseInt(dirtyCount.rows[0].count);
        
        // Get total items
        const totalCount = await db.query("SELECT COUNT(*) as count FROM canonical_items");
        const totalItems = parseInt(totalCount.rows[0].count);
        
        console.log(`\n📊 Current Status:`);
        console.log(`   Total items: ${totalItems}`);
        console.log(`   Dirty items: ${dirtyItems}`);
        
        // Calculate batch size
        let batchSize;
        if (dirtyItems <= 50) {
            batchSize = 25;
        } else if (dirtyItems <= 300) {
            batchSize = 100;
        } else {
            batchSize = 600;
        }
        
        const numBatches = Math.ceil(dirtyItems / batchSize);
        const maxConcurrency = 6;
        
        console.log(`\n⚙️  Configuration:`);
        console.log(`   Batch size: ${batchSize}`);
        console.log(`   Number of batches: ${numBatches}`);
        console.log(`   Max concurrency: ${maxConcurrency} parallel batches`);
        
        // Performance estimates based on actual measurements
        // From recent run: 3,178 items in 2.42s = ~1,313 items/sec
        // Code comments suggest: ~3,000 items/sec with optimal conditions
        // Using conservative estimate: ~1,500 items/sec average
        
        const itemsPerSecond = 1500; // Conservative estimate
        const estimatedSeconds = dirtyItems / itemsPerSecond;
        const estimatedMinutes = estimatedSeconds / 60;
        
        console.log(`\n⏱️  Performance Estimates:`);
        console.log(`   Items/second: ~${itemsPerSecond.toLocaleString()} (conservative)`);
        console.log(`   Estimated time: ${estimatedSeconds.toFixed(2)}s (${estimatedMinutes.toFixed(2)} minutes)`);
        
        // Break down by batch processing
        if (numBatches > 0) {
            const itemsPerBatch = batchSize;
            const batchesInParallel = Math.min(maxConcurrency, numBatches);
            const sequentialRounds = Math.ceil(numBatches / batchesInParallel);
            
            // Estimate time per batch (conservative)
            const timePerBatch = itemsPerBatch / itemsPerSecond;
            const totalTime = sequentialRounds * timePerBatch;
            
            console.log(`\n📦 Batch Processing Breakdown:`);
            console.log(`   Items per batch: ${itemsPerBatch}`);
            console.log(`   Batches in parallel: ${batchesInParallel}`);
            console.log(`   Sequential rounds: ${sequentialRounds}`);
            console.log(`   Time per batch: ~${timePerBatch.toFixed(2)}s`);
            console.log(`   Total estimated time: ~${totalTime.toFixed(2)}s`);
        }
        
        // Scheduler frequency
        let frequency;
        if (dirtyItems === 0) {
            frequency = 60;
        } else if (dirtyItems <= 200) {
            frequency = 30;
        } else if (dirtyItems <= 1000) {
            frequency = 15;
        } else {
            frequency = 30;
        }
        
        console.log(`\n🔄 Scheduler Frequency:`);
        console.log(`   Current frequency: Every ${frequency} seconds`);
        console.log(`   Updates per hour: ${3600 / frequency}`);
        
        // Real-world scenarios
        console.log(`\n📈 Real-world Scenarios:`);
        console.log(`   Small update (50 items): ~${(50 / itemsPerSecond).toFixed(2)}s`);
        console.log(`   Medium update (300 items): ~${(300 / itemsPerSecond).toFixed(2)}s`);
        console.log(`   Large update (1000 items): ~${(1000 / itemsPerSecond).toFixed(2)}s`);
        console.log(`   Very large (3000 items): ~${(3000 / itemsPerSecond).toFixed(2)}s`);
        console.log(`   Full refresh (${totalItems} items): ~${(totalItems / itemsPerSecond).toFixed(2)}s (${(totalItems / itemsPerSecond / 60).toFixed(2)} minutes)`);
        
        // Check recent performance from logs if available
        console.log(`\n💡 Notes:`);
        console.log(`   - Performance varies based on database load`);
        console.log(`   - Recent actual: ~1,313 items/sec (3,178 items in 2.42s)`);
        console.log(`   - Optimal conditions: ~3,000+ items/sec`);
        console.log(`   - Estimates use conservative 1,500 items/sec`);
        
        console.log("\n" + "=".repeat(80));
        
    } catch (err) {
        console.error("❌ Error:", err.message);
        process.exit(1);
    } finally {
        await db.end();
    }
})();



