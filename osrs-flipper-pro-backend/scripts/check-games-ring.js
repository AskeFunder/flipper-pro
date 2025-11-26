require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkItems() {
    try {
        const { rows } = await db.query(`
            SELECT i.id, i.name
            FROM items i
            WHERE i.name IN ('Games necklace (8)', 'Ring of dueling (8)')
            ORDER BY i.name
        `);
        
        console.log(`Found ${rows.length} items:\n`);
        rows.forEach(row => {
            console.log(`  ${row.id}: "${row.name}"`);
        });
        
        if (rows.length > 0) {
            const now = Math.floor(Date.now() / 1000);
            for (const row of rows) {
                await db.query(`
                    INSERT INTO dirty_items (item_id, touched_at)
                    VALUES ($1, $2)
                    ON CONFLICT (item_id) DO UPDATE SET
                        touched_at = EXCLUDED.touched_at
                `, [row.id, now]);
                console.log(`  ✓ Marked item ${row.id} as dirty`);
            }
            
            const { rows: dirtyCount } = await db.query(`
                SELECT COUNT(*)::INT AS count FROM dirty_items
            `);
            console.log(`\nTotal dirty items: ${dirtyCount[0].count}`);
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await db.end();
    }
}

checkItems();

