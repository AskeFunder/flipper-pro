require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

(async () => {
    try {
        console.log("🗑️  Emptying canonical_items table...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        const { rowCount } = await db.query(`DELETE FROM canonical_items`);
        console.log(`✅ Emptied canonical_items: ${rowCount} rows deleted`);
        
        // Verify it's empty
        const { rows } = await db.query(`SELECT COUNT(*) as count FROM canonical_items`);
        const count = parseInt(rows[0].count);
        console.log(`\n🔍 Verification: ${count} rows remaining`);
        
        if (count === 0) {
            console.log("✅ canonical_items table is now empty!");
            console.log("📋 The canonical updater will rebuild it after backfill completes.");
        } else {
            console.log("❌ Warning: Table is not empty!");
        }
        
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    } finally {
        await db.end();
    }
})();


