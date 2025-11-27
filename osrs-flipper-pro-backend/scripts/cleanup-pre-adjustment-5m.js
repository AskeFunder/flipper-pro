require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

(async () => {
    try {
        // Get the latest timestamp
        const { rows: latestRows } = await db.query(`SELECT MAX(timestamp) as latest FROM price_5m`);
        const latestTimestamp = latestRows[0]?.latest;
        
        // Calculate expected start
        const intervalSeconds = 300;
        const retentionHours = 24 + (5 / 60);
        const extraStepHours = intervalSeconds / 3600;
        const baseHours = retentionHours - extraStepHours;
        const baseRetentionSeconds = baseHours * 3600;
        const numIntervals = Math.floor(baseRetentionSeconds / intervalSeconds);
        const apiLatestTimestamp = latestTimestamp - 300;
        const apiStartTimestamp = apiLatestTimestamp - (numIntervals * intervalSeconds);
        const expectedStart = apiStartTimestamp + 300;
        
        console.log(`Latest: ${latestTimestamp} (${new Date(latestTimestamp * 1000).toISOString()})`);
        console.log(`Expected start: ${expectedStart} (${new Date(expectedStart * 1000).toISOString()})`);
        
        // Find timestamps that are 300 seconds before expected timestamps (old unadjusted data)
        const oldStart = expectedStart - 300;
        console.log(`\nLooking for old unadjusted timestamp: ${oldStart} (${new Date(oldStart * 1000).toISOString()})`);
        
        const { rows } = await db.query(`
            SELECT timestamp, COUNT(*) as item_count
            FROM price_5m
            WHERE timestamp = $1
            GROUP BY timestamp
        `, [oldStart]);
        
        if (rows.length > 0) {
            console.log(`Found ${rows[0].item_count} items at old timestamp`);
            const { rowCount } = await db.query(`
                DELETE FROM price_5m
                WHERE timestamp = $1
            `, [oldStart]);
            console.log(`✅ Deleted ${rowCount} rows`);
        } else {
            console.log(`No data found at old timestamp`);
        }
        
    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await db.end();
    }
})();



