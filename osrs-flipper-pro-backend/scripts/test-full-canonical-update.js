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
        console.log(`Marking all items as dirty for full update test...\n`);
        
        // Mark all items as dirty to force full update
        const now = Math.floor(Date.now() / 1000);
        await db.query(`
            INSERT INTO dirty_items (item_id, touched_at)
            SELECT id, $1 FROM items
            ON CONFLICT (item_id) DO UPDATE SET touched_at = $1
        `, [now]);
        
        const { rows: dirtyCount } = await db.query(`
            SELECT COUNT(*)::INT AS count FROM dirty_items
        `);
        console.log(`✅ Marked ${dirtyCount[0].count} items as dirty\n`);
        
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



