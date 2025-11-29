require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

(async () => {
    try {
        console.log("🔍 Checking canonical_items status...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        // Check canonical_items count
        const { rows: canonicalRows } = await db.query(`SELECT COUNT(*) as count FROM canonical_items`);
        const canonicalCount = parseInt(canonicalRows[0].count);
        console.log(`📊 Items in canonical_items: ${canonicalCount}`);
        
        // Check dirty_items count
        const { rows: dirtyRows } = await db.query(`SELECT COUNT(*) as count FROM dirty_items`);
        const dirtyCount = parseInt(dirtyRows[0].count);
        console.log(`📊 Items in dirty_items: ${dirtyCount}`);
        
        // Check if there are any items with prices
        const { rows: priceRows } = await db.query(`
            SELECT COUNT(*) as count 
            FROM canonical_items 
            WHERE high IS NOT NULL OR low IS NOT NULL
        `);
        const itemsWithPrices = parseInt(priceRows[0].count);
        console.log(`📊 Items with prices: ${itemsWithPrices}`);
        
        // Check price_instants count
        const { rows: instantRows } = await db.query(`SELECT COUNT(DISTINCT item_id) as count FROM price_instants`);
        const instantCount = parseInt(instantRows[0].count);
        console.log(`📊 Items in price_instants: ${instantCount}`);
        
        console.log("\n💡 Analysis:");
        if (canonicalCount === 0) {
            console.log("❌ canonical_items is empty - canonical updater hasn't run yet");
            if (dirtyCount > 0) {
                console.log(`   → ${dirtyCount} items are marked dirty and waiting to be processed`);
            }
        } else {
            console.log(`✅ canonical_items has ${canonicalCount} items`);
            if (itemsWithPrices === 0) {
                console.log("   ⚠️  But no items have prices yet - need to poll /latest first");
            }
        }
        
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    } finally {
        await db.end();
    }
})();


