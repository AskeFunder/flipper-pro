require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const CONFIG = {
    "1h": { table: "price_1h", intervalSeconds: 3600 },
    "6h": { table: "price_6h", intervalSeconds: 21600 },
    "24h": { table: "price_24h", intervalSeconds: 86400 }
};

(async () => {
    try {
        for (const [granularity, cfg] of Object.entries(CONFIG)) {
            console.log(`\n📊 [${granularity}] Migrating timestamps to end-of-interval:`);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            
            // Check current state
            const { rows: countRows } = await db.query(`
                SELECT COUNT(DISTINCT timestamp) as count
                FROM ${cfg.table}
            `);
            console.log(`Current timestamps: ${countRows[0].count}`);
            
            // Check which timestamps need migration (those that are at start of interval, not end)
            // For 1h: timestamps ending in :00:00 need +3600 to become :00:00 of next hour
            // We'll update in batches to avoid conflicts
            const { rows: toMigrate } = await db.query(`
                SELECT DISTINCT timestamp
                FROM ${cfg.table}
                WHERE timestamp % $1 = 0
                  AND timestamp NOT IN (
                      SELECT timestamp - $1
                      FROM ${cfg.table}
                  )
                ORDER BY timestamp
            `, [cfg.intervalSeconds]);
            
            console.log(`Found ${toMigrate.length} timestamps to migrate`);
            
            let updated = 0;
            for (const row of toMigrate) {
                try {
                    const { rowCount } = await db.query(`
                        UPDATE ${cfg.table}
                        SET timestamp = timestamp + $1
                        WHERE timestamp = $2
                    `, [cfg.intervalSeconds, row.timestamp]);
                    updated += rowCount;
                } catch (err) {
                    if (err.code === '23505') {
                        // Duplicate key - this timestamp already exists with offset, delete the old one
                        await db.query(`
                            DELETE FROM ${cfg.table}
                            WHERE timestamp = $1
                        `, [row.timestamp]);
                        console.log(`   Deleted duplicate at ${row.timestamp} (offset version already exists)`);
                    } else {
                        throw err;
                    }
                }
            }
            
            console.log(`✅ Updated ${updated} rows`);
            console.log(`   Added ${cfg.intervalSeconds} seconds (${cfg.intervalSeconds / 3600} hours) to timestamps`);
            
            // Verify
            const { rows: verifyRows } = await db.query(`
                SELECT COUNT(DISTINCT timestamp) as count
                FROM ${cfg.table}
            `);
            console.log(`After migration: ${verifyRows[0].count} timestamps`);
        }
        
        console.log(`\n✅ Migration complete!`);
        
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    } finally {
        await db.end();
    }
})();

