// db.js
const { Pool } = require("pg");

/**
 * Strategy 8: Database Connection Pool Tuning
 * 
 * Optimize connection pool settings for parallel queries:
 * - Increase max connections for parallel query execution
 * - Set appropriate idle timeout
 * - Configure connection limits
 */
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
}

const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    // Strategy 8: Optimized pool settings for parallel canonical updates
    // Increased to 30 to support 12 parallel batches (each batch uses ~2-3 connections)
    // With available CPU headroom, we can use more connections for better parallelization
    max: parseInt(process.env.DB_POOL_MAX || "30", 10),
    min: parseInt(process.env.DB_POOL_MIN || "2", 10),
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || "5000", 10), // 5s for faster cleanup
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || "30000", 10), // 30s to handle high load with more connections
    // Force close idle connections faster
    allowExitOnIdle: true,
    // Set query timeout for all connections to prevent hanging queries
    // Default 30 seconds - can be overridden via CANONICAL_QUERY_TIMEOUT_MS env var
    query_timeout: parseInt(process.env.CANONICAL_QUERY_TIMEOUT_MS || "30000", 10)
};

const db = new Pool(poolConfig);

// Set statement_timeout on all new connections to prevent hanging queries
db.on('connect', async (client) => {
    try {
        const timeoutMs = parseInt(process.env.CANONICAL_QUERY_TIMEOUT_MS || "30000", 10);
        await client.query(`SET statement_timeout = ${timeoutMs}`);
    } catch (err) {
        console.error('[DB Pool] Error setting statement_timeout:', err.message);
    }
});

// Log pool statistics (for monitoring)
if (process.env.DB_POOL_DEBUG === 'true') {
    setInterval(() => {
        console.log(`[DB Pool] Total: ${db.totalCount}, Idle: ${db.idleCount}, Waiting: ${db.waitingCount}`);
    }, 5000);
}

module.exports = db;
