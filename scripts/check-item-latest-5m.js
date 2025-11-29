require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

(async () => {
    try {
        const query = `
      SELECT 
          p.item_id,
          p.avg_high,
          p.avg_low,
          p.timestamp,
          to_char(to_timestamp(p.timestamp), 'YYYY-MM-DD HH24:MI:SS') AS ts_utc
      FROM price_5m p
      WHERE p.item_id = $1
      ORDER BY p.timestamp DESC
      LIMIT 1;
    `;

        const { rows } = await db.query(query, [30765]);

        if (rows.length) {
            console.log(`✅ Latest 5m data for item_id 30765:`);
            console.log(`  Timestamp (UTC): ${rows[0].ts_utc}`);
            console.log(`  Raw epoch: ${rows[0].timestamp}`);
            console.log(`  Avg High: ${rows[0].avg_high}`);
            console.log(`  Avg Low:  ${rows[0].avg_low}`);
        } else {
            console.log("⚠️ No data found for item_id 30765 in price_5m.");
        }
    } catch (err) {
        console.error("❌ Error querying database:", err);
    } finally {
        await db.end();
    }
})();
