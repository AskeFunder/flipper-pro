require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const intervalSeconds = 300;
const retentionHours = 24 + (5 / 60); // 24.083 hours

(async () => {
    try {
        const { rows } = await db.query(`SELECT MAX(timestamp) as latest FROM price_5m`);
        const latestTimestamp = rows[0]?.latest;
        
        console.log(`Latest database timestamp: ${latestTimestamp} (${new Date(latestTimestamp * 1000).toISOString()})`);
        
        // Convert to API timestamp
        const apiLatestTimestamp = latestTimestamp - 300;
        console.log(`API timestamp: ${apiLatestTimestamp} (${new Date(apiLatestTimestamp * 1000).toISOString()})`);
        
        // Calculate expected
        const extraStepHours = intervalSeconds / 3600;
        const baseHours = retentionHours - extraStepHours;
        const baseRetentionSeconds = baseHours * 3600;
        const numIntervals = Math.floor(baseRetentionSeconds / intervalSeconds);
        
        console.log(`\nCalculation:`);
        console.log(`  retentionHours: ${retentionHours}`);
        console.log(`  extraStepHours: ${extraStepHours}`);
        console.log(`  baseHours: ${baseHours}`);
        console.log(`  baseRetentionSeconds: ${baseRetentionSeconds}`);
        console.log(`  numIntervals: ${numIntervals}`);
        
        const startCandidate = apiLatestTimestamp - (numIntervals * intervalSeconds);
        console.log(`\nStart candidate (API): ${startCandidate} (${new Date(startCandidate * 1000).toISOString()})`);
        
        const startDb = startCandidate + 300;
        console.log(`Start (DB): ${startDb} (${new Date(startDb * 1000).toISOString()})`);
        console.log(`End (DB): ${latestTimestamp} (${new Date(latestTimestamp * 1000).toISOString()})`);
        
        const expectedCount = numIntervals + 1;
        console.log(`\nExpected count: ${expectedCount} points (${numIntervals} intervals + 1)`);
        
        // Check what's actually in the database around the start
        const { rows: startRows } = await db.query(`
            SELECT timestamp, COUNT(*) as item_count
            FROM price_5m
            WHERE timestamp >= $1 - 600 AND timestamp <= $1 + 600
            GROUP BY timestamp
            ORDER BY timestamp
        `, [startDb]);
        
        console.log(`\nTimestamps in database around start:`);
        startRows.forEach(row => {
            console.log(`  ${row.timestamp} (${new Date(row.timestamp * 1000).toISOString()}): ${row.item_count} items`);
        });
        
    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await db.end();
    }
})();



