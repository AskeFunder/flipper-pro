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
            console.log(`\n📊 [${granularity}] Checking timestamp offsets:`);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            
            // Get a few sample timestamps
            const { rows } = await db.query(`
                SELECT DISTINCT timestamp
                FROM ${cfg.table}
                ORDER BY timestamp DESC
                LIMIT 5
            `);
            
            console.log(`Sample timestamps (latest 5):`);
            rows.forEach(row => {
                const date = new Date(row.timestamp * 1000);
                const seconds = date.getUTCSeconds();
                const minutes = date.getUTCMinutes();
                const hours = date.getUTCHours();
                
                // Check if timestamp is aligned to interval boundary
                const mod = row.timestamp % cfg.intervalSeconds;
                const isAligned = mod === 0;
                
                console.log(`  ${row.timestamp} (${date.toISOString()})`);
                console.log(`    UTC: ${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
                console.log(`    Mod ${cfg.intervalSeconds}: ${mod} ${isAligned ? '✅ aligned' : '❌ not aligned'}`);
                
                // If we add intervalSeconds, what would it be?
                const withOffset = row.timestamp + cfg.intervalSeconds;
                const offsetDate = new Date(withOffset * 1000);
                console.log(`    With +${cfg.intervalSeconds}s offset: ${withOffset} (${offsetDate.toISOString()})`);
            });
        }
        
    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await db.end();
    }
})();



