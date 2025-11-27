require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkNames() {
    try {
        const { rows } = await db.query(`
            SELECT i.id, i.name
            FROM items i
            WHERE i.name LIKE '%Ring of dueling%' OR i.name LIKE '%Games necklace%'
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

checkNames();



