require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

const taxExemptItems = [
    'Ardougne teleport (tablet)',
    'Camelot teleport (tablet)',
    'Civitas illa fortis teleport (tablet)',
    'Falador teleport (tablet)',
    'Games necklace (8)',
    'Kourend castle teleport (tablet)',
    'Lumbridge teleport (tablet)',
    'Ring of dueling (8)',
    'Teleport to house (tablet)',
    'Varrock teleport (tablet)',
    'Energy potion(1)',
    'Energy potion(2)',
    'Energy potion(3)',
    'Energy potion(4)'
];

async function markDirty() {
    try {
        const { rows } = await db.query(`
            SELECT i.id, i.name
            FROM items i
            WHERE i.name = ANY($1)
        `, [taxExemptItems]);
        
        console.log(`Found ${rows.length} items to mark as dirty:\n`);
        
        const now = Math.floor(Date.now() / 1000);
        let marked = 0;
        
        for (const row of rows) {
            await db.query(`
                INSERT INTO dirty_items (item_id, touched_at)
                VALUES ($1, $2)
                ON CONFLICT (item_id) DO UPDATE SET
                    touched_at = EXCLUDED.touched_at
            `, [row.id, now]);
            console.log(`  ✓ Marked item ${row.id}: "${row.name}"`);
            marked++;
        }
        
        console.log(`\n✅ Marked ${marked} items as dirty`);
        
        const { rows: dirtyCount } = await db.query(`
            SELECT COUNT(*)::INT AS count FROM dirty_items
        `);
        console.log(`Total dirty items: ${dirtyCount[0].count}`);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await db.end();
    }
}

markDirty();

