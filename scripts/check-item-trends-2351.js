require("dotenv").config();
const db = require("../db/db");

async function checkTrends() {
    try {
        const { rows } = await db.query(`
            SELECT 
                item_id, 
                trend_5m, 
                trend_1h, 
                trend_6h, 
                trend_24h, 
                trend_1w, 
                trend_1m, 
                trend_3m, 
                trend_1y
            FROM canonical_items 
            WHERE item_id = $1
        `, [2351]);

        if (rows.length > 0) {
            const item = rows[0];
            console.log('\nIron Bar (ID: 2351) Trend Values:');
            console.log('  trend_5m:  ', item.trend_5m ?? 'NULL');
            console.log('  trend_1h:  ', item.trend_1h ?? 'NULL');
            console.log('  trend_6h:  ', item.trend_6h ?? 'NULL');
            console.log('  trend_24h: ', item.trend_24h ?? 'NULL');
            console.log('  trend_1w:  ', item.trend_1w ?? 'NULL');
            console.log('  trend_1m:  ', item.trend_1m ?? 'NULL');
            console.log('  trend_3m:  ', item.trend_3m ?? 'NULL');
            console.log('  trend_1y:  ', item.trend_1y ?? 'NULL');
        } else {
            console.log('Item 2351 not found in canonical_items');
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await db.end();
    }
}

checkTrends();

