require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkVolume1m() {
    try {
        // Check if volume_1m column exists in canonical_items
        const { rows: columnCheck } = await db.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'canonical_items'
              AND column_name LIKE '%volume%'
            ORDER BY column_name
        `);
        
        console.log("Volume columns in canonical_items:");
        columnCheck.forEach(row => {
            console.log(`  ${row.column_name}: ${row.data_type}`);
        });
        
        // Check if any items have volume_1m data
        if (columnCheck.some(c => c.column_name === 'volume_1m')) {
            const { rows: dataCheck } = await db.query(`
                SELECT 
                    COUNT(*) AS total_items,
                    COUNT(volume_1m) AS items_with_volume_1m,
                    COUNT(CASE WHEN volume_1m > 0 THEN 1 END) AS items_with_volume_1m_gt_zero
                FROM canonical_items
            `);
            
            console.log("\nVolume 1M data statistics:");
            console.log(`  Total items: ${dataCheck[0].total_items}`);
            console.log(`  Items with volume_1m (not null): ${dataCheck[0].items_with_volume_1m}`);
            console.log(`  Items with volume_1m > 0: ${dataCheck[0].items_with_volume_1m_gt_zero}`);
            
            // Show a few examples
            const { rows: examples } = await db.query(`
                SELECT item_id, name, volume_1m
                FROM canonical_items
                WHERE volume_1m IS NOT NULL AND volume_1m > 0
                ORDER BY volume_1m DESC
                LIMIT 5
            `);
            
            if (examples.length > 0) {
                console.log("\nExamples of items with volume_1m:");
                examples.forEach(row => {
                    console.log(`  ${row.item_id}: "${row.name}" - volume_1m: ${row.volume_1m}`);
                });
            }
        } else {
            console.log("\n❌ volume_1m column does NOT exist in canonical_items table!");
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await db.end();
    }
}

checkVolume1m();

