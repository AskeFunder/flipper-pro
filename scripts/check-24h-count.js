require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

(async () => {
    try {
        console.log("🔍 Checking 24h data points...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        // Get distinct timestamps
        const { rows: timestampRows } = await db.query(`
            SELECT COUNT(DISTINCT timestamp) as count 
            FROM price_24h
        `);
        const timestampCount = parseInt(timestampRows[0].count);
        console.log(`📊 Distinct timestamps in price_24h: ${timestampCount}`);
        
        // Get total rows
        const { rows: totalRows } = await db.query(`
            SELECT COUNT(*) as count 
            FROM price_24h
        `);
        const totalCount = parseInt(totalRows[0].count);
        console.log(`📊 Total rows in price_24h: ${totalCount}`);
        
        // Get item count
        const { rows: itemRows } = await db.query(`
            SELECT COUNT(DISTINCT item_id) as count 
            FROM price_24h
        `);
        const itemCount = parseInt(itemRows[0].count);
        console.log(`📊 Distinct items in price_24h: ${itemCount}`);
        
        // Get min and max timestamps
        const { rows: rangeRows } = await db.query(`
            SELECT 
                MIN(timestamp) as min_ts,
                MAX(timestamp) as max_ts,
                TO_TIMESTAMP(MIN(timestamp)) as min_time,
                TO_TIMESTAMP(MAX(timestamp)) as max_time
            FROM price_24h
        `);
        console.log(`\n📅 Timestamp range:`);
        console.log(`   Min: ${rangeRows[0].min_ts} (${rangeRows[0].min_time})`);
        console.log(`   Max: ${rangeRows[0].max_ts} (${rangeRows[0].max_time})`);
        
        // Calculate expected count based on retention
        const now = Math.floor(Date.now() / 1000);
        const retentionSeconds = 365 * 24 * 60 * 60; // 365 days
        const intervalSeconds = 24 * 60 * 60; // 24 hours
        const expectedCount = Math.floor(retentionSeconds / intervalSeconds) + 1;
        console.log(`\n💡 Expected count (365 days / 24h intervals): ~${expectedCount} timestamps`);
        
        if (timestampCount < expectedCount) {
            console.log(`⚠️  Missing ${expectedCount - timestampCount} timestamps`);
        } else {
            console.log(`✅ All expected timestamps present`);
        }
        
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    } finally {
        await db.end();
    }
})();


