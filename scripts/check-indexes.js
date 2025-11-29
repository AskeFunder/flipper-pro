const db = require('../db/db');

async function checkIndexes() {
    try {
        const indexes = await db.query(`
            SELECT tablename, indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename IN ('price_5m', 'price_1h', 'price_6h', 'price_24h') 
            ORDER BY tablename, indexname
        `);
        console.log('Indexes on price tables:');
        indexes.rows.forEach(r => {
            console.log(`  ${r.tablename}.${r.indexname}: ${r.indexdef}`);
        });
    } finally {
        await db.end();
    }
}

checkIndexes();







