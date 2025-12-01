// check-db-connections.js
// Check how many database connections are in use

require("dotenv").config();
const { Pool } = require("pg");

const testPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1
});

(async () => {
    try {
        // Try to connect
        const result = await testPool.query("SELECT 1");
        console.log("✅ Database connection successful!");
        
        // Try to check connection count (if we have permission)
        try {
            const connResult = await testPool.query(`
                SELECT count(*) as total_connections 
                FROM pg_stat_activity 
                WHERE datname = current_database()
            `);
            console.log(`📊 Total connections to database: ${connResult.rows[0].total_connections}`);
        } catch (err) {
            console.log("⚠️  Cannot check connection count (permission denied)");
        }
        
        await testPool.end();
        process.exit(0);
    } catch (err) {
        console.error("❌ Error:", err.message);
        if (err.message.includes("remaining connection slots")) {
            console.log("\n💡 Too many connections! You need to:");
            console.log("   1. Stop old node processes");
            console.log("   2. Wait for connections to timeout");
            console.log("   3. Or restart the PostgreSQL server");
        }
        await testPool.end();
        process.exit(1);
    }
})();






