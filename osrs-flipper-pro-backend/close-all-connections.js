// close-all-connections.js
// Attempt to close all database connections (requires SUPERUSER)
// This is an alternative to restarting PostgreSQL

require("dotenv").config();
const { Pool } = require("pg");

const adminPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1
});

(async () => {
    try {
        console.log("🔌 Attempting to close all database connections...");
        
        // Try to terminate all connections except our own
        const result = await adminPool.query(`
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
              AND usename = 'flipperpro_user'
        `);
        
        console.log(`✅ Terminated ${result.rowCount} connections`);
        console.log("💡 All connections closed. You can now test poll-latest.js");
        
        await adminPool.end();
        process.exit(0);
    } catch (err) {
        if (err.message.includes("permission denied") || err.message.includes("must be superuser")) {
            console.error("❌ Permission denied: You need SUPERUSER privileges to close connections");
            console.log("\n💡 Options:");
            console.log("   1. Restart PostgreSQL via SSH: sudo systemctl restart postgresql");
            console.log("   2. Wait for connections to timeout (5-30 seconds)");
            console.log("   3. Stop old node processes on your local machine");
        } else {
            console.error("❌ Error:", err.message);
        }
        await adminPool.end();
        process.exit(1);
    }
})();






