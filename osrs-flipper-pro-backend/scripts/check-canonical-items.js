require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

(async () => {
    try {
        console.log("🔍 Checking canonical_items table...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        const { rows: countRows } = await db.query(`SELECT COUNT(*) as count FROM canonical_items`);
        const count = parseInt(countRows[0].count);
        console.log(`📊 Total rows in canonical_items: ${count}`);
        
        if (count > 0) {
            // Check a sample row to see what data it has
            const { rows: sampleRows } = await db.query(`
                SELECT 
                    item_id,
                    name,
                    price_5m_high,
                    price_5m_low,
                    price_1h_high,
                    price_1h_low,
                    price_6h_high,
                    price_6h_low,
                    price_24h_high,
                    price_24h_low
                FROM canonical_items 
                LIMIT 3
            `);
            
            console.log("\n📋 Sample rows (first 3):");
            sampleRows.forEach((row, idx) => {
                console.log(`\n  Row ${idx + 1}:`);
                console.log(`    ID: ${row.item_id}, Name: ${row.name}`);
                console.log(`    5m: high=${row.price_5m_high}, low=${row.price_5m_low}`);
                console.log(`    1h: high=${row.price_1h_high}, low=${row.price_1h_low}`);
                console.log(`    6h: high=${row.price_6h_high}, low=${row.price_6h_low}`);
                console.log(`    24h: high=${row.price_24h_high}, low=${row.price_24h_low}`);
            });
        }
        
        console.log("\n💡 Note: Since granularity tables are empty, canonical_items data is stale.");
        console.log("   The canonical updater will recalculate everything after backfill.");
        
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    } finally {
        await db.end();
    }
})();

