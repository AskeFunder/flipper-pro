require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        // Check current dirty items count
        const dirtyCount = await db.query("SELECT COUNT(*) as count FROM dirty_items");
        console.log("Current dirty items:", dirtyCount.rows[0].count);
        
        // Check how many items were processed in the last canonical update
        // We can't directly track this, but we can check:
        // 1. How many items have been updated in canonical_items recently
        const recentCanonical = await db.query(`
            SELECT COUNT(*) as count
            FROM canonical_items
            WHERE timestamp_updated >= $1
        `, [Math.floor(Date.now() / 1000) - 60]); // Last 60 seconds
        
        console.log("Canonical items updated in last 60s:", recentCanonical.rows[0].count);
        
        // 2. Check the oldest dirty item
        const oldestDirty = await db.query(`
            SELECT item_id, touched_at,
                   EXTRACT(EPOCH FROM NOW()) - touched_at as age_seconds
            FROM dirty_items
            ORDER BY touched_at ASC
            LIMIT 1
        `);
        
        if (oldestDirty.rows.length > 0) {
            console.log("\nOldest dirty item:");
            console.log("  Item ID:", oldestDirty.rows[0].item_id);
            console.log("  Touched at:", new Date(oldestDirty.rows[0].touched_at * 1000).toISOString());
            console.log("  Age:", Math.floor(oldestDirty.rows[0].age_seconds), "seconds =", Math.floor(oldestDirty.rows[0].age_seconds/60), "minutes");
        }
        
        // 3. Check if canonical update is actually processing items
        // Look at the difference between dirty count and items that should be dirty
        const totalItems = await db.query("SELECT COUNT(*) as count FROM items");
        console.log("\nTotal items in database:", totalItems.rows[0].count);
        
        // 4. Check recent price updates to see how many items are being marked dirty
        const recentPriceUpdates = await db.query(`
            SELECT COUNT(DISTINCT item_id) as count
            FROM price_instants
            WHERE last_updated >= $1
        `, [Math.floor(Date.now() / 1000) - 60]); // Last 60 seconds
        
        console.log("Items with price updates in last 60s:", recentPriceUpdates.rows[0].count);
        
        // 5. Calculate expected processing rate
        // With 4386 items, batch size 350, 13 batches
        // If processing at ~1000 items/sec, should take ~4.4 seconds
        // But logs show 0.14s, which suggests it's not processing all items
        console.log("\nExpected processing time:");
        console.log("  Items:", dirtyCount.rows[0].count);
        console.log("  Batch size: 350");
        console.log("  Batches:", Math.ceil(dirtyCount.rows[0].count / 350));
        console.log("  Expected time at 1000 items/sec:", (dirtyCount.rows[0].count / 1000).toFixed(2), "seconds");
        console.log("  Actual time from logs: ~0.14s");
        console.log("  ⚠️  Mismatch suggests items aren't being processed!");
        
    } catch (err) {
        console.error("Error:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
})();




