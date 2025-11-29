require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

(async () => {
    try {
        console.log("🔄 Populating dirty_items table with all items...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        // First, clear any existing dirty items
        await db.query("DELETE FROM dirty_items");
        console.log("✅ Cleared existing dirty_items");
        
        // Insert all items into dirty_items
        const now = Math.floor(Date.now() / 1000);
        const { rowCount } = await db.query(`
            INSERT INTO dirty_items (item_id, touched_at)
            SELECT id, $1 FROM items
            ON CONFLICT (item_id) DO NOTHING
        `, [now]);
        
        console.log(`✅ Inserted ${rowCount} items into dirty_items`);
        
        // Verify
        const { rows } = await db.query(`SELECT COUNT(*) as count FROM dirty_items`);
        const count = parseInt(rows[0].count);
        console.log(`\n🔍 Verification: ${count} items in dirty_items`);
        
        if (count > 0) {
            console.log("✅ Ready to run canonical updater!");
        } else {
            console.log("❌ Warning: No items in dirty_items!");
        }
        
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    } finally {
        await db.end();
    }
})();

