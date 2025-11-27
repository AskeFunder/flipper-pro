require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const missingTimestamps = [1764181800, 1764199500, 1764203100];

(async () => {
    try {
        for (const ts of missingTimestamps) {
            const { rows } = await db.query(`
                SELECT COUNT(*) as count
                FROM price_5m
                WHERE timestamp = $1
            `, [ts]);
            
            const date = new Date(ts * 1000).toISOString();
            console.log(`Timestamp ${ts} (${date}): ${rows[0].count} rows`);
        }
    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await db.end();
    }
})();



