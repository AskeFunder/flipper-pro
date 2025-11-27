require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        await db.query("DELETE FROM dirty_items");
        
        const now = Math.floor(Date.now() / 1000);
        const { rows } = await db.query("SELECT item_id FROM price_instants LIMIT 300");
        
        for (const row of rows) {
            await db.query(
                "INSERT INTO dirty_items (item_id, touched_at) VALUES ($1, $2) ON CONFLICT (item_id) DO UPDATE SET touched_at = EXCLUDED.touched_at",
                [row.item_id, now]
            );
        }
        
        console.log(`✅ Inserted ${rows.length} items into dirty_items`);
        
        const { rows: countRows } = await db.query("SELECT COUNT(*)::INT AS count FROM dirty_items");
        console.log(`Dirty count: ${countRows[0].count}`);
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await db.end();
    }
})();



