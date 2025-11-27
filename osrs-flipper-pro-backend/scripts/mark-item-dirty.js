require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function markItemDirty(itemId) {
    try {
        const now = Math.floor(Date.now() / 1000);
        await db.query(`
            INSERT INTO dirty_items (item_id, touched_at)
            VALUES ($1, $2)
            ON CONFLICT (item_id) DO UPDATE SET
                touched_at = EXCLUDED.touched_at
        `, [itemId, now]);
        
        console.log(`✅ Marked item ${itemId} as dirty`);
        
        const { rows } = await db.query(`
            SELECT COUNT(*)::INT AS count FROM dirty_items
        `);
        console.log(`Total dirty items: ${rows[0].count}`);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await db.end();
    }
}

const itemId = process.argv[2] || 8010; // Camelot teleport (tablet)
markItemDirty(parseInt(itemId, 10));



