require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        // Check how many dirty items there are
        const totalDirty = await db.query("SELECT COUNT(*) as count FROM dirty_items");
        console.log("Total dirty items:", totalDirty.rows[0].count);
        
        // Check if item 2351 is in dirty_items and its position
        // Note: dirty_items doesn't have ORDER BY in the canonical update query, so order is undefined
        const item2351Pos = await db.query(`
            SELECT item_id, touched_at
            FROM dirty_items
            WHERE item_id = 2351
        `);
        
        if (item2351Pos.rows.length > 0) {
            console.log("\nItem 2351 IS in dirty_items");
            console.log("Touched at:", new Date(item2351Pos.rows[0].touched_at * 1000).toISOString());
            const age = Math.floor((Date.now() / 1000) - item2351Pos.rows[0].touched_at);
            console.log("Age:", age, "seconds =", Math.floor(age/60), "minutes");
        } else {
            console.log("\nItem 2351 NOT in dirty_items");
        }
        
        // Check batch size calculation
        const batchSize = totalDirty.rows[0].count <= 50 ? 25 : 
                         totalDirty.rows[0].count <= 300 ? 100 : 350;
        const numBatches = Math.ceil(totalDirty.rows[0].count / batchSize);
        console.log("\nBatch size:", batchSize);
        console.log("Number of batches:", numBatches);
        console.log("Items per batch:", Math.ceil(totalDirty.rows[0].count / numBatches));
        
        // Check when canonical was last updated
        const canonical = await db.query(`
            SELECT timestamp_updated,
                   EXTRACT(EPOCH FROM NOW()) - timestamp_updated as age_seconds
            FROM canonical_items
            WHERE item_id = 2351
        `);
        
        if (canonical.rows.length > 0) {
            console.log("\nCanonical last updated:", new Date(canonical.rows[0].timestamp_updated * 1000).toISOString());
            console.log("Age:", Math.floor(canonical.rows[0].age_seconds), "seconds =", Math.floor(canonical.rows[0].age_seconds/60), "minutes");
        }
        
        // Check recent canonical update logs to see how many items were processed
        console.log("\nRecent canonical updates (check logs for items processed):");
        console.log("Run: node poller/view-process-logs.js 1 | grep CANONICAL");
        
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await db.end();
    }
})();

