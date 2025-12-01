require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        const result = await db.query(`
            SELECT timestamp_updated 
            FROM canonical_items 
            WHERE item_id = 2351
        `);
        
        if (result.rows.length > 0) {
            const ts = result.rows[0].timestamp_updated;
            const age = Math.floor(Date.now() / 1000) - ts;
            console.log('Item 2351 last updated:', new Date(ts * 1000).toISOString());
            console.log('Age:', Math.floor(age / 60), 'minutes');
        } else {
            console.log('Item 2351 not found in canonical_items');
        }
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await db.end();
    }
})();



