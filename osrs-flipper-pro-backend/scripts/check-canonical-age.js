require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        const now = Math.floor(Date.now() / 1000);
        const result = await db.query(`
            SELECT 
                item_id, 
                name, 
                trend_5m, 
                trend_24h,
                buy_sell_rate_24h,
                timestamp_updated,
                $1 - timestamp_updated as age_seconds
            FROM canonical_items 
            WHERE item_id = 2351
        `, [now]);
        
        if (result.rows.length > 0) {
            const item = result.rows[0];
            console.log("Canonical Data for Item 2351:");
            console.log("Trend 5m:", item.trend_5m);
            console.log("Trend 24h:", item.trend_24h);
            console.log("Buy/Sell Rate 24h:", item.buy_sell_rate_24h);
            console.log("Last Updated:", new Date(item.timestamp_updated * 1000).toISOString());
            console.log("Age:", Math.floor(item.age_seconds), "seconds =", Math.floor(item.age_seconds/60), "minutes");
        }
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await db.end();
    }
})();




