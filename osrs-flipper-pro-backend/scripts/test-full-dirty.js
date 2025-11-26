require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        await db.query("DELETE FROM dirty_items");
        
        const now = Math.floor(Date.now() / 1000);
        const { rows } = await db.query("SELECT id FROM items");
        
        for (const row of rows) {
            await db.query(
                "INSERT INTO dirty_items (item_id, touched_at) VALUES ($1, $2) ON CONFLICT (item_id) DO UPDATE SET touched_at = EXCLUDED.touched_at",
                [row.id, now]
            );
        }
        
        console.log(`✅ Inserted ${rows.length} items into dirty_items`);
        
        const { rows: countRows } = await db.query("SELECT COUNT(*)::INT AS count FROM dirty_items");
        const { rows: totalRows } = await db.query("SELECT COUNT(*)::INT AS count FROM items");
        const percentage = ((countRows[0].count / totalRows[0].count) * 100).toFixed(1);
        console.log(`Dirty count: ${countRows[0].count}/${totalRows[0].count} (${percentage}%)`);
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await db.end();
    }
})();

