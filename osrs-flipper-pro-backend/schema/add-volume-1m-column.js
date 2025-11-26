require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function addVolume1mColumn() {
    try {
        // Check if column already exists
        const { rows: columnCheck } = await db.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'canonical_items'
              AND column_name = 'volume_1m'
        `);
        
        if (columnCheck.length > 0) {
            console.log("✅ volume_1m column already exists");
            await db.end();
            return;
        }
        
        // Add volume_1m column
        await db.query(`
            ALTER TABLE canonical_items
            ADD COLUMN volume_1m BIGINT
        `);
        
        console.log("✅ Added volume_1m column to canonical_items table");
        
        // Create index for better query performance
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_canonical_volume_1m
            ON canonical_items(volume_1m DESC)
        `);
        
        console.log("✅ Created index on volume_1m");
        
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await db.end();
    }
}

addVolume1mColumn();

