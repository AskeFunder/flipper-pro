require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

(async () => {
    try {
        const query = `
      SELECT 
          MAX(timestamp) AS latest_ts,
          to_char(to_timestamp(MAX(timestamp)), 'YYYY-MM-DD HH24:MI:SS') AS latest_time_utc
      FROM price_5m;
    `;
        const { rows } = await db.query(query);

        if (rows.length && rows[0].latest_ts) {
            console.log("✅ Latest 5m timestamp found:");
            console.log("  Raw timestamp:", rows[0].latest_ts);
            console.log("  UTC time:", rows[0].latest_time_utc);
        } else {
            console.log("⚠️ No 5m data found in price_5m table.");
        }
    } catch (err) {
        console.error("❌ Error querying database:", err);
    } finally {
        await db.end();
    }
})();
