require("dotenv").config();
const db = require("../db/db");
const updateCanonicalItems = require("../poller/update-canonical-items");

async function testFullCanonicalUpdate() {
    try {
        // First, get the total number of items
        const { rows: itemCount } = await db.query(`
            SELECT COUNT(*) as count FROM items
        `);
        const totalItems = parseInt(itemCount[0].count, 10);
        
        console.log(`\n📊 Testing full canonical update for ${totalItems} items...\n`);
        console.log(`Batch size: 200 items per batch\n`);
        
        const startTime = process.hrtime.bigint();
        
        // Run the full update
        await updateCanonicalItems();
        
        const endTime = process.hrtime.bigint();
        const totalDuration = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds
        const totalSeconds = totalDuration / 1000;
        
        // Calculate batches
        const batchSize = 200;
        const totalBatches = Math.ceil(totalItems / batchSize);
        const avgTimePerBatch = totalDuration / totalBatches;
        const itemsPerSecond = totalItems / totalSeconds;
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📈 PERFORMANCE SUMMARY`);
        console.log(`${'='.repeat(60)}`);
        console.log(`Total items: ${totalItems.toLocaleString()}`);
        console.log(`Total batches: ${totalBatches}`);
        console.log(`Total time: ${totalDuration.toFixed(2)}ms (${totalSeconds.toFixed(2)}s)`);
        console.log(`Average per batch: ${avgTimePerBatch.toFixed(2)}ms (${(avgTimePerBatch/1000).toFixed(3)}s)`);
        console.log(`Items per second: ${itemsPerSecond.toFixed(0)}`);
        console.log(`\n✅ Full canonical update completed successfully!`);
        console.log(`${'='.repeat(60)}\n`);
        
    } catch (err) {
        console.error("❌ Error testing full canonical update:", err);
        throw err;
    } finally {
        await db.end();
    }
}

testFullCanonicalUpdate();

