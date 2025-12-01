// get-row-counts.js
// Get row counts for all production tables

require("dotenv").config();
const db = require("./db/db");

(async () => {
    try {
        const tables = ['price_instants', 'price_5m', 'price_1h', 'price_6h', 'price_24h', 'canonical_items'];
        console.log("=== Row Counts ===");
        for (const table of tables) {
            const { rows } = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
            console.log(`${table}: ${rows[0].count}`);
        }
        await db.end();
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        await db.end();
        process.exit(1);
    }
})();






