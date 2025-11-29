require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        // Check if item 2351 is in dirty_items
        const item2351 = await db.query(`
            SELECT item_id, touched_at, 
                   EXTRACT(EPOCH FROM NOW()) - touched_at as age_seconds
            FROM dirty_items 
            WHERE item_id = 2351
        `);
        
        console.log("Item 2351 in dirty_items:", item2351.rows.length > 0 ? "YES" : "NO");
        if (item2351.rows.length > 0) {
            console.log("  Touched at:", new Date(item2351.rows[0].touched_at * 1000).toISOString());
            console.log("  Age:", Math.floor(item2351.rows[0].age_seconds), "seconds =", Math.floor(item2351.rows[0].age_seconds/60), "minutes");
        }
        
        // Check total dirty items
        const totalDirty = await db.query("SELECT COUNT(*) as count FROM dirty_items");
        console.log("\nTotal dirty items:", totalDirty.rows[0].count);
        
        // Check when canonical was last updated for item 2351
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
        
        // Check recent price updates for item 2351
        const recentPrices = await db.query(`
            SELECT MAX(last_updated) as last_update,
                   EXTRACT(EPOCH FROM NOW()) - MAX(last_updated) as age_seconds
            FROM price_instants
            WHERE item_id = 2351
        `);
        
        if (recentPrices.rows.length > 0 && recentPrices.rows[0].last_update) {
            console.log("\nPrice instants last updated:", new Date(recentPrices.rows[0].last_update * 1000).toISOString());
            console.log("Age:", Math.floor(recentPrices.rows[0].age_seconds), "seconds =", Math.floor(recentPrices.rows[0].age_seconds/60), "minutes");
        }
        
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await db.end();
    }
})();

