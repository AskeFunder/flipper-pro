require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function findItems() {
    try {
        const { rows: games } = await db.query(`
            SELECT i.id, i.name
            FROM items i
            WHERE i.name LIKE '%Games necklace%'
            ORDER BY i.name
        `);
        
        const { rows: ring } = await db.query(`
            SELECT i.id, i.name
            FROM items i
            WHERE i.name LIKE '%Ring of dueling%'
            ORDER BY i.name
        `);
        
        console.log("Games necklace items:");
        games.forEach(row => {
            console.log(`  ${row.id}: "${row.name}"`);
        });
        
        console.log("\nRing of dueling items:");
        ring.forEach(row => {
            console.log(`  ${row.id}: "${row.name}"`);
        });
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await db.end();
    }
}

findItems();



