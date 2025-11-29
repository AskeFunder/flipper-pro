require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

(async () => {
    try {
        console.log("🔍 Checking 24h timestamp values...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        // Get latest 5 timestamps
        const { rows } = await db.query(`
            SELECT DISTINCT timestamp 
            FROM price_24h 
            ORDER BY timestamp DESC 
            LIMIT 5
        `);
        
        console.log("\n📅 Latest 5 timestamps:");
        rows.forEach((r, idx) => {
            const date = new Date(r.timestamp * 1000);
            console.log(`  ${idx + 1}. ${r.timestamp} = ${date.toISOString()}`);
        });
        
        // Get earliest 5 timestamps
        const { rows: earlyRows } = await db.query(`
            SELECT DISTINCT timestamp 
            FROM price_24h 
            ORDER BY timestamp ASC 
            LIMIT 5
        `);
        
        console.log("\n📅 Earliest 5 timestamps:");
        earlyRows.forEach((r, idx) => {
            const date = new Date(r.timestamp * 1000);
            console.log(`  ${idx + 1}. ${r.timestamp} = ${date.toISOString()}`);
        });
        
        // Check current time
        const now = Math.floor(Date.now() / 1000);
        const nowDate = new Date(now * 1000);
        console.log(`\n⏰ Current time: ${now} = ${nowDate.toISOString()}`);
        
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    } finally {
        await db.end();
    }
})();


