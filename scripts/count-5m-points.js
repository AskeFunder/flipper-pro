require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

(async () => {
    try {
        // Count total 5m price points
        const countQuery = `SELECT COUNT(*) as total FROM price_5m;`;
        const { rows: countRows } = await db.query(countQuery);
        
        // Count unique items
        const itemCountQuery = `SELECT COUNT(DISTINCT item_id) as unique_items FROM price_5m;`;
        const { rows: itemRows } = await db.query(itemCountQuery);
        
        // Get timestamp range
        const rangeQuery = `
            SELECT 
                MIN(timestamp) as earliest,
                MAX(timestamp) as latest,
                to_char(to_timestamp(MIN(timestamp)), 'YYYY-MM-DD HH24:MI:SS') AS earliest_utc,
                to_char(to_timestamp(MAX(timestamp)), 'YYYY-MM-DD HH24:MI:SS') AS latest_utc
            FROM price_5m;
        `;
        const { rows: rangeRows } = await db.query(rangeQuery);
        
        // Count points per item (top 10)
        const topItemsQuery = `
            SELECT 
                item_id,
                COUNT(*) as point_count
            FROM price_5m
            GROUP BY item_id
            ORDER BY point_count DESC
            LIMIT 10;
        `;
        const { rows: topItemsRows } = await db.query(topItemsQuery);
        
        console.log("📊 5m Price Points Statistics:");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`Total 5m price points: ${countRows[0].total.toLocaleString()}`);
        console.log(`Unique items: ${itemRows[0].unique_items.toLocaleString()}`);
        console.log(`Average points per item: ${Math.round(countRows[0].total / itemRows[0].unique_items).toLocaleString()}`);
        
        if (rangeRows[0].earliest && rangeRows[0].latest) {
            const earliest = rangeRows[0].earliest;
            const latest = rangeRows[0].latest;
            const hoursSpan = (latest - earliest) / 3600;
            console.log(`\nTime Range:`);
            console.log(`  Earliest: ${rangeRows[0].earliest_utc} (${earliest})`);
            console.log(`  Latest:   ${rangeRows[0].latest_utc} (${latest})`);
            console.log(`  Span:     ${hoursSpan.toFixed(2)} hours (${(hoursSpan / 24).toFixed(2)} days)`);
        }
        
        if (topItemsRows.length > 0) {
            console.log(`\nTop 10 items by 5m point count:`);
            topItemsRows.forEach((row, idx) => {
                console.log(`  ${idx + 1}. Item ${row.item_id}: ${row.point_count.toLocaleString()} points`);
            });
        }
        
    } catch (err) {
        console.error("❌ Error querying database:", err);
    } finally {
        await db.end();
    }
})();



