require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        // Check if the stuck items exist in the items table
        const stuckItems = await db.query(`
            SELECT d.item_id, d.touched_at,
                   EXTRACT(EPOCH FROM NOW()) - d.touched_at as age_seconds,
                   i.id as exists_in_items
            FROM dirty_items d
            LEFT JOIN items i ON i.id = d.item_id
            ORDER BY d.touched_at ASC
            LIMIT 10
        `);
        
        console.log("Stuck items analysis:");
        stuckItems.rows.forEach(r => {
            const age = Math.floor(r.age_seconds / 60);
            const exists = r.exists_in_items != null ? "✅ EXISTS" : "❌ MISSING";
            console.log(`  Item ${r.item_id}: age=${age}min, ${exists}`);
        });
        
        // Check recent canonical updates
        const recent = await db.query(`
            SELECT timestamp_updated, COUNT(*) as count
            FROM canonical_items
            WHERE timestamp_updated >= $1
            GROUP BY timestamp_updated
            ORDER BY timestamp_updated DESC
            LIMIT 5
        `, [Math.floor(Date.now() / 1000) - 300]); // Last 5 minutes
        
        console.log("\nRecent canonical updates (last 5 min):");
        if (recent.rows.length > 0) {
            recent.rows.forEach(r => {
                console.log(`  ${new Date(r.timestamp_updated * 1000).toISOString()}: ${r.count} items updated`);
            });
        } else {
            console.log("  No updates in last 5 minutes");
        }
        
        // Check if canonical update is actually running
        console.log("\nChecking if canonical update is running...");
        const { isBackfillRunning } = require("./poller/lock-utils");
        const isRunning = isBackfillRunning("canonical");
        console.log(`  Lock active: ${isRunning ? "YES" : "NO"}`);
        
    } catch (err) {
        console.error("Error:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
})();

