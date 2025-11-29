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
            console.log(`\n📊 [${granularity}] Cleaning up old timestamps:`);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            
            // Find timestamps that are at the start of interval (old data)
            // These are timestamps where (timestamp - intervalSeconds) doesn't exist
            // meaning they're the old "start of interval" timestamps
            const { rows: oldTimestamps } = await db.query(`
                SELECT DISTINCT t1.timestamp
                FROM ${cfg.table} t1
                WHERE NOT EXISTS (
                    SELECT 1 FROM ${cfg.table} t2
                    WHERE t2.timestamp = t1.timestamp - $1
                )
                ORDER BY t1.timestamp DESC
                LIMIT 10
            `, [cfg.intervalSeconds]);
            
            console.log(`Found ${oldTimestamps.length} potential old timestamps (showing first 10):`);
            oldTimestamps.forEach(row => {
                const date = new Date(row.timestamp * 1000).toISOString();
                console.log(`  ${row.timestamp} (${date})`);
            });
            
            // Actually, a simpler approach: delete timestamps where there's a duplicate with +offset
            const { rowCount } = await db.query(`
                DELETE FROM ${cfg.table} t1
                WHERE EXISTS (
                    SELECT 1 FROM ${cfg.table} t2
                    WHERE t2.timestamp = t1.timestamp + $1
                      AND t2.item_id = t1.item_id
                )
            `, [cfg.intervalSeconds]);
            
            console.log(`\n✅ Deleted ${rowCount} old timestamps (ones that have duplicates with +offset)`);
        }
        
        console.log(`\n✅ Cleanup complete! Run backfill to recreate with correct offsets.`);
        
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    } finally {
        await db.end();
    }
})();



