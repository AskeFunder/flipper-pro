require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkPriceInstants(itemId) {
    try {
        const { rows } = await db.query(`
            SELECT item_id, type, price, timestamp 
            FROM price_instants 
            WHERE item_id = $1
            ORDER BY type
        `, [itemId]);
        
        console.log(`Price instants for item ${itemId}:`);
        rows.forEach(row => {
            console.log(`  ${row.type}: price=${row.price}, timestamp=${row.timestamp} (${row.timestamp ? 'has value' : 'NULL'})`);
        });
        
        if (rows.length === 0) {
            console.log("  No records found!");
        } else if (rows.length === 1) {
            console.log(`  ⚠️  Only ${rows[0].type} record found - missing ${rows[0].type === 'high' ? 'low' : 'high'}!`);
        } else {
            const high = rows.find(r => r.type === 'high');
            const low = rows.find(r => r.type === 'low');
            
            if (!high || !low) {
                console.log("  ⚠️  Missing high or low record!");
            } else {
                if (high.timestamp === null) {
                    console.log("  ❌ PROBLEM: high.timestamp is NULL!");
                }
                if (low.timestamp === null) {
                    console.log("  ❌ PROBLEM: low.timestamp is NULL!");
                }
            }
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await db.end();
    }
}

const itemId = process.argv[2] || 2351;
checkPriceInstants(parseInt(itemId, 10));



