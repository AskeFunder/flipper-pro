require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        const result = await db.query("SELECT COUNT(*) as count FROM dirty_items");
        const count = result.rows[0].count;
        
        const oldest = await db.query("SELECT MIN(touched_at) as oldest FROM dirty_items");
        let oldestAge = null;
        if (oldest.rows[0].oldest) {
            const age = Math.floor((Date.now() / 1000) - oldest.rows[0].oldest);
            oldestAge = Math.floor(age / 60);
        }
        
        const timestamp = new Date().toISOString();
        
        console.log(`[${timestamp}] Dirty items: ${count}${oldestAge != null ? ` (oldest: ${oldestAge} minutes)` : ''}`);
        
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await db.end();
    }
})();




