require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const TABLES = ["price_5m", "price_1h", "price_6h", "price_24h"];

(async () => {
    try {
        console.log("🔍 Verifying table row counts...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        let allEmpty = true;
        for (const table of TABLES) {
            const { rows } = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
            const count = parseInt(rows[0].count);
            const status = count === 0 ? "✅" : "❌";
            console.log(`${status} ${table}: ${count} rows`);
            if (count !== 0) {
                allEmpty = false;
            }
        }
        
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        if (allEmpty) {
            console.log("✅ All tables are empty!");
        } else {
            console.log("❌ Some tables still have data!");
        }
        
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    } finally {
        await db.end();
    }
})();


