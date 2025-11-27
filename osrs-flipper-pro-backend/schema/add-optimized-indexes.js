require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Strategy 1: Enhanced Database Indexes
 * 
 * Creates optimized composite indexes for LATERAL join performance:
 * - Covering indexes that include avg_high and avg_low to avoid table lookups
 * - Partial indexes filtered by NOT NULL conditions
 * - Optimized for timestamp DESC ordering
 */
const optimizedIndexes = `
-- Covering indexes for latest point queries (includes avg_high, avg_low)
-- These allow index-only scans, avoiding table lookups
CREATE INDEX IF NOT EXISTS idx_price_5m_covering_latest 
ON price_5m(item_id, timestamp DESC, avg_high, avg_low)
WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_price_1h_covering_latest 
ON price_1h(item_id, timestamp DESC, avg_high, avg_low)
WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_price_6h_covering_latest 
ON price_6h(item_id, timestamp DESC, avg_high, avg_low)
WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_price_24h_covering_latest 
ON price_24h(item_id, timestamp DESC, avg_high, avg_low)
WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL);

-- Covering index for first 1h point (ASC ordering)
CREATE INDEX IF NOT EXISTS idx_price_1h_covering_first 
ON price_1h(item_id, timestamp ASC, avg_high, avg_low)
WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL);

-- Optimized indexes for LATERAL join queries (previous point lookups)
-- These support efficient range scans with timestamp <= condition
CREATE INDEX IF NOT EXISTS idx_price_5m_lateral_prev 
ON price_5m(item_id, timestamp DESC, avg_high, avg_low)
WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_price_6h_lateral_prev 
ON price_6h(item_id, timestamp DESC, avg_high, avg_low)
WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_price_1h_lateral_prev 
ON price_1h(item_id, timestamp DESC, avg_high, avg_low)
WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_price_24h_lateral_prev 
ON price_24h(item_id, timestamp DESC, avg_high, avg_low)
WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL);

-- Indexes for ABS(timestamp - target) queries (used in 1m, 1w, 3m, 1y trends)
-- These support efficient distance-based lookups
CREATE INDEX IF NOT EXISTS idx_price_6h_distance 
ON price_6h(item_id, timestamp, avg_high, avg_low)
WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_price_1h_distance 
ON price_1h(item_id, timestamp, avg_high, avg_low)
WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_price_24h_distance 
ON price_24h(item_id, timestamp, avg_high, avg_low)
WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL);
`;

/**
 * Analyze existing indexes and show query plans
 */
async function analyzeIndexes() {
    console.log("Analyzing existing indexes...\n");
    
    const tables = ['price_5m', 'price_1h', 'price_6h', 'price_24h'];
    
    for (const table of tables) {
        const { rows } = await db.query(`
            SELECT 
                indexname,
                indexdef
            FROM pg_indexes
            WHERE tablename = $1
            ORDER BY indexname
        `, [table]);
        
        console.log(`\n${table}:`);
        if (rows.length === 0) {
            console.log("  No indexes found");
        } else {
            rows.forEach(row => {
                console.log(`  - ${row.indexname}`);
            });
        }
    }
}

/**
 * Test query plans with EXPLAIN ANALYZE
 */
async function testQueryPlans() {
    console.log("\n\nTesting query plans with EXPLAIN ANALYZE...\n");
    
    // Test latest 5m point query
    const testItemIds = [1, 2, 3, 4, 5];
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
    
    console.log("Test Query: Latest 5m points");
    const { rows: planRows } = await db.query(`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT DISTINCT ON (item_id) item_id, timestamp, (avg_high + avg_low) / 2.0 AS mid
        FROM price_5m
        WHERE item_id = ANY($1) AND timestamp >= $2 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY item_id, timestamp DESC
    `, [testItemIds, fiveMinutesAgo]);
    
    if (planRows && planRows[0] && planRows[0]['QUERY PLAN']) {
        const plan = planRows[0]['QUERY PLAN'][0];
        console.log(`  Execution Time: ${plan['Execution Time']}ms`);
        console.log(`  Planning Time: ${plan['Planning Time']}ms`);
        console.log(`  Index Used: ${JSON.stringify(plan.Plan, null, 2).substring(0, 200)}...`);
    }
}

(async () => {
  try {
    console.log("=".repeat(80));
    console.log("Strategy 1: Enhanced Database Indexes");
    console.log("=".repeat(80));
    console.log();
    
    // Analyze existing indexes
    await analyzeIndexes();
    
    // Create optimized indexes
    console.log("\n\nCreating optimized indexes...");
    await db.query(optimizedIndexes);
    console.log("✅ Optimized indexes created successfully");
    
    // Analyze tables to update statistics
    console.log("\nUpdating table statistics...");
    await db.query(`ANALYZE price_5m, price_1h, price_6h, price_24h`);
    console.log("✅ Statistics updated");
    
    // Test query plans
    await testQueryPlans();
    
    console.log("\n\n✅ Strategy 1 implementation complete!");
    console.log("\nNext steps:");
    console.log("1. Run test-optimization-strategies.js to measure performance");
    console.log("2. Compare results against baseline");
    
  } catch (err) {
    console.error("❌ Failed to create optimized indexes:", err);
    console.error(err.stack);
  } finally {
    await db.end();
  }
})();

