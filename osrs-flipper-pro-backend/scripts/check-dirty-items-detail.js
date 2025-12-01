require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        const result = await db.query(`
            SELECT item_id, touched_at, 
                   EXTRACT(EPOCH FROM NOW()) - touched_at as age_seconds
            FROM dirty_items 
            ORDER BY touched_at ASC 
            LIMIT 10
        `);
        
        console.log("Oldest 10 dirty items:");
        result.rows.forEach(r => {
            const age = Math.floor(r.age_seconds / 60);
            console.log(`  Item ${r.item_id} - age: ${age} minutes`);
        });
        
        const total = await db.query("SELECT COUNT(*) as count FROM dirty_items");
        console.log(`\nTotal dirty items: ${total.rows[0].count}`);
        
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await db.end();
    }
})();




