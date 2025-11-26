require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

/**
 * Migration: Add 5 minutes (300 seconds) to all existing price_5m timestamps
 * This aligns timestamps to represent the end of the 5-minute window instead of the start
 */
async function migrate5mTimestamps() {
    try {
        console.log("🔄 Starting migration: Adding 5 minutes to all price_5m timestamps...\n");

        // First, check how many rows will be affected
        const { rows: countRows } = await db.query(`
            SELECT COUNT(*)::BIGINT AS count FROM price_5m
        `);
        const totalRows = parseInt(countRows[0].count, 10);
        console.log(`📊 Total rows in price_5m: ${totalRows.toLocaleString()}`);

        if (totalRows === 0) {
            console.log("✅ No rows to migrate. Exiting.");
            await db.end();
            return;
        }

        // Check for potential conflicts (rows that would have duplicate timestamps after migration)
        const { rows: conflictRows } = await db.query(`
            SELECT COUNT(*)::BIGINT AS count
            FROM price_5m p1
            WHERE EXISTS (
                SELECT 1
                FROM price_5m p2
                WHERE p2.item_id = p1.item_id
                  AND p2.timestamp = p1.timestamp + 300
                  AND p2.timestamp != p1.timestamp
            )
        `);
        const conflictCount = parseInt(conflictRows[0].count, 10);

        if (conflictCount > 0) {
            console.log(`⚠️  WARNING: ${conflictCount.toLocaleString()} rows would have timestamp conflicts after migration.`);
            console.log("   This means some rows already have timestamps that are 5 minutes ahead.");
            console.log("   These rows will be skipped during migration.\n");
        }

        // Start transaction
        await db.query("BEGIN");

        // Update all timestamps by adding 300 seconds (5 minutes)
        // Use a subquery to avoid conflicts with existing rows
        const { rowCount } = await db.query(`
            UPDATE price_5m
            SET timestamp = timestamp + 300
            WHERE NOT EXISTS (
                SELECT 1
                FROM price_5m p2
                WHERE p2.item_id = price_5m.item_id
                  AND p2.timestamp = price_5m.timestamp + 300
                  AND p2.timestamp != price_5m.timestamp
            )
        `);

        await db.query("COMMIT");

        console.log(`✅ Migration complete!`);
        console.log(`   Updated ${rowCount.toLocaleString()} rows`);
        if (conflictCount > 0) {
            console.log(`   Skipped ${conflictCount.toLocaleString()} rows due to conflicts`);
        }

        // Verify migration
        const { rows: sampleRows } = await db.query(`
            SELECT 
                item_id,
                timestamp,
                to_char(to_timestamp(timestamp), 'YYYY-MM-DD HH24:MI:SS') AS ts_formatted
            FROM price_5m
            ORDER BY timestamp DESC
            LIMIT 5
        `);

        console.log("\n📋 Sample of updated timestamps (latest 5):");
        sampleRows.forEach(row => {
            console.log(`   Item ${row.item_id}: ${row.ts_formatted} (${row.timestamp})`);
        });

    } catch (err) {
        await db.query("ROLLBACK").catch(() => {});
        console.error("❌ Migration failed:", err);
        throw err;
    } finally {
        await db.end();
    }
}

// Run migration
migrate5mTimestamps()
    .then(() => {
        console.log("\n✅ Migration script completed successfully");
        process.exit(0);
    })
    .catch((err) => {
        console.error("\n❌ Migration script failed:", err);
        process.exit(1);
    });

