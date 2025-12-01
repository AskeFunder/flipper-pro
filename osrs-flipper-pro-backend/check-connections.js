// check-connections.js
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1
});

(async () => {
    try {
        await pool.query("SELECT 1");
        console.log("✅ Database connection successful");
        const { rows } = await pool.query(`
            SELECT 
                count(*) as total, 
                count(*) FILTER (WHERE state = 'active') as active 
            FROM pg_stat_activity 
            WHERE datname = current_database()
        `);
        console.log("Active connections:", rows[0].active, "/ Total:", rows[0].total);
        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error("❌ Error:", err.message);
        await pool.end();
        process.exit(1);
    }
})();






