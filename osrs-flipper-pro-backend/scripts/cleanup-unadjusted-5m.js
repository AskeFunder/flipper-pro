require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

(async () => {
    try {
        // Find timestamps that are not aligned to 5-minute boundaries (when +300 is applied)
        // Valid 5m timestamps should be: ... :00, :05, :10, :15, etc. (seconds = 0 or 5 minutes)
        // But with +300 adjustment, they become: ... :05, :10, :15, :20, etc.
        // So valid timestamps mod 300 should be 0 (after +300 adjustment)
        
        const { rows } = await db.query(`
            SELECT DISTINCT timestamp
            FROM price_5m
            WHERE timestamp % 300 != 0
            ORDER BY timestamp
        `);
        
        console.log(`Found ${rows.length} unadjusted timestamps:`);
        rows.forEach(row => {
            const date = new Date(row.timestamp * 1000).toISOString();
            console.log(`  ${row.timestamp} (${date})`);
        });
        
        if (rows.length > 0) {
            const timestamps = rows.map(r => r.timestamp);
            const { rowCount } = await db.query(`
                DELETE FROM price_5m
                WHERE timestamp = ANY($1::bigint[])
            `, [timestamps]);
            
            console.log(`\n✅ Deleted ${rowCount} rows with unadjusted timestamps`);
        } else {
            console.log(`\n✅ No unadjusted timestamps found`);
        }
        
    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await db.end();
    }
})();



