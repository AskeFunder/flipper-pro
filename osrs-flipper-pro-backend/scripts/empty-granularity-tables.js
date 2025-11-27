require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const TABLES = ["price_5m", "price_1h", "price_6h", "price_24h"];

(async () => {
    try {
        console.log("🗑️  Emptying granularity tables...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        for (const table of TABLES) {
            const { rowCount } = await db.query(`DELETE FROM ${table}`);
            console.log(`✅ Emptied ${table}: ${rowCount} rows deleted`);
        }
        
        console.log("\n✅ All granularity tables emptied!");
        console.log("📋 Next step: Run backfill for all granularities");
        
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    } finally {
        await db.end();
    }
})();



