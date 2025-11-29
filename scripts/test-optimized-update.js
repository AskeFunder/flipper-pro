const db = require('../db/db');

async function testOptimizedQuery() {
    try {
        const now = Math.floor(Date.now() / 1000);
        
        const result = await db.query(`
            SELECT COUNT(DISTINCT i.id) as count
            FROM items i
            LEFT JOIN canonical_items c ON i.id = c.item_id
            LEFT JOIN (
                SELECT item_id, MAX(last_updated) as max_last_updated
                FROM price_instants
                GROUP BY item_id
            ) pi ON i.id = pi.item_id
            WHERE 
                (pi.max_last_updated > c.timestamp_updated OR c.timestamp_updated IS NULL)
                OR (c.timestamp_updated IS NOT NULL AND c.timestamp_updated < $1 - 300)
                OR c.item_id IS NULL
        `, [now]);
        
        console.log('Items that need updating:', result.rows[0].count);
        
        // Also check total items
        const total = await db.query('SELECT COUNT(*) as count FROM items');
        console.log('Total items:', total.rows[0].count);
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await db.end();
    }
}

testOptimizedQuery();







