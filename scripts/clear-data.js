// scripts/clear-data.js
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
}

(async () => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    // List all tables you want to clear
    const tables = [
        'price_5m',
        'price_1h',
        'price_6h',
        'price_24h',
        'price_instants',
        'price_instant_log'
    ];

    try {
        // TRUNCATE is faster and can reset SERIALs if you add RESTART IDENTITY
        const sql = `TRUNCATE ${tables.join(', ')} RESTART IDENTITY`;
        await pool.query(sql);
        console.log(`✅ Cleared data and reset IDs on: ${tables.join(', ')}`);
    } catch (err) {
        console.error('❌ Failed to clear data:', err.stack || err);
    } finally {
        await pool.end();
    }
})();
