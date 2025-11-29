require("dotenv").config();
const db = require("../db/db");

async function test() {
    try {
        // Simulate what the API endpoint does
        const { rows } = await db.query(`
            SELECT * FROM canonical_items WHERE item_id = $1
        `, [2351]);

        if (rows.length > 0) {
            const item = rows[0];
            console.log('\n=== Full API Response (first 20 keys) ===');
            const keys = Object.keys(item).slice(0, 20);
            keys.forEach(key => {
                console.log(`  ${key}:`, item[key]);
            });
            
            console.log('\n=== Trend Values Specifically ===');
            console.log('  trend_5m:', item.trend_5m, typeof item.trend_5m);
            console.log('  trend_1h:', item.trend_1h, typeof item.trend_1h);
            console.log('  trend_6h:', item.trend_6h, typeof item.trend_6h);
            console.log('  trend_24h:', item.trend_24h, typeof item.trend_24h);
            console.log('  trend_1w:', item.trend_1w, typeof item.trend_1w);
            console.log('  trend_1m:', item.trend_1m, typeof item.trend_1m);
            
            console.log('\n=== JSON Response (trends only) ===');
            const trendsOnly = {
                trend_5m: item.trend_5m,
                trend_1h: item.trend_1h,
                trend_6h: item.trend_6h,
                trend_24h: item.trend_24h,
                trend_1w: item.trend_1w,
                trend_1m: item.trend_1m
            };
            console.log(JSON.stringify(trendsOnly, null, 2));
        } else {
            console.log('Item 2351 not found');
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await db.end();
    }
}

test();

