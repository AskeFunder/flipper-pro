#!/usr/bin/env node
/**
 * Minimal PostgreSQL connection test
 * Tests remote database connectivity using DATABASE_URL
 * Exit code: 0 on success, 1 on failure
 * 
 * IMPORTANT: Set DATABASE_URL in your .env file before running this test.
 * 
 * ⚠️  DO NOT start any backend services (server.js) or pollers (scheduler.js)
 *     until this test passes with exit code 0.
 * 
 * Usage: node test-db-connection.js
 */

require("dotenv").config();
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL environment variable is required");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000
});

pool.query("SELECT NOW() as current_time")
    .then((result) => {
        console.log("✅ Database connection successful");
        console.log(`   Current database time: ${result.rows[0].current_time}`);
        pool.end();
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Database connection failed");
        console.error(`   Error: ${error.message}`);
        pool.end();
        process.exit(1);
    });

