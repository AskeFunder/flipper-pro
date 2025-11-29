require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        const result = await db.query('SHOW max_connections');
        console.log('PostgreSQL max_connections:', result.rows[0].max_connections);
        
        const result2 = await db.query('SELECT count(*) as count FROM pg_stat_activity');
        console.log('Current active connections:', result2.rows[0].count);
        
        const result3 = await db.query(`
            SELECT 
                setting as max_connections,
                (SELECT count(*) FROM pg_stat_activity) as current_connections,
                setting::int - (SELECT count(*) FROM pg_stat_activity) as available_connections
            FROM pg_settings 
            WHERE name = 'max_connections'
        `);
        console.log('\nConnection Summary:');
        console.log('  Max:', result3.rows[0].max_connections);
        console.log('  Current:', result3.rows[0].current_connections);
        console.log('  Available:', result3.rows[0].available_connections);
        
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await db.end();
    }
})();

