const db = require('../db/db');

async function checkTrends() {
    try {
        const result = await db.query(`
            SELECT item_id, trend_5m, trend_1h, trend_6h 
            FROM canonical_items 
            WHERE trend_5m IS NOT NULL OR trend_1h IS NOT NULL 
            LIMIT 5
        `);
        console.log('Sample items with trends:');
        result.rows.forEach(r => {
            console.log(`  Item ${r.item_id}: 5m=${r.trend_5m}, 1h=${r.trend_1h}, 6h=${r.trend_6h}`);
        });
        
        const count = await db.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(trend_5m) as has_5m,
                COUNT(trend_1h) as has_1h,
                COUNT(trend_6h) as has_6h
            FROM canonical_items
        `);
        console.log('\nTrend statistics:');
        console.log(`  Total items: ${count.rows[0].total}`);
        console.log(`  Items with trend_5m: ${count.rows[0].has_5m}`);
        console.log(`  Items with trend_1h: ${count.rows[0].has_1h}`);
        console.log(`  Items with trend_6h: ${count.rows[0].has_6h}`);
    } finally {
        await db.end();
    }
}

checkTrends();







