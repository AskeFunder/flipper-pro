require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function findTeleportTablets() {
    try {
        const { rows } = await db.query(`
            SELECT i.id, i.name
            FROM items i
            WHERE (i.name LIKE '%teleport%' AND i.name LIKE '%tablet%')
               OR i.name LIKE '%Energy potion%'
            ORDER BY i.name
        `);
        
        console.log(`Found ${rows.length} items:\n`);
        rows.forEach(row => {
            console.log(`  ${row.id}: "${row.name}"`);
        });
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await db.end();
    }
}

findTeleportTablets();



