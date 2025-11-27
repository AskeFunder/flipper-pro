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
    // Strategy 8: Optimized pool settings for parallel batch processing
    // Reduced to 30 to lower connection overhead while still supporting 2-3 parallel batches
    // Each batch uses ~4-5 connections (trends + data queries), so 2 batches = ~8-10 connections
    max: parseInt(process.env.DB_POOL_MAX || "30", 10),
    min: parseInt(process.env.DB_POOL_MIN || "2", 10),
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || "30000", 10),
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || "2000", 10),
    // Allow connection reuse
    allowExitOnIdle: false
};

const db = new Pool(poolConfig);

// Log pool statistics (for monitoring)
if (process.env.DB_POOL_DEBUG === 'true') {
    setInterval(() => {
        console.log(`[DB Pool] Total: ${db.totalCount}, Idle: ${db.idleCount}, Waiting: ${db.waitingCount}`);
    }, 5000);
}

module.exports = db;
