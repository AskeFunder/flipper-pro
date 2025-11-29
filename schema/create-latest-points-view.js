require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Strategy 5: Materialized Latest Points View
 * 
 * Creates a materialized view that pre-computes the latest timestamp per item per granularity.
 * This eliminates expensive DISTINCT ON queries during trend calculation.
 * 
 * The view is refreshed on a schedule (via scheduler) or can be refreshed manually.
 */
const materializedView = `
-- Drop existing view if it exists
DROP MATERIALIZED VIEW IF EXISTS latest_price_points CASCADE;

-- Create materialized view with latest points for all granularities
CREATE MATERIALIZED VIEW latest_price_points AS
SELECT 
    '5m' AS granularity,
    item_id,
    timestamp AS latest_timestamp,
    (avg_high + avg_low) / 2.0 AS mid_price,
    avg_high,
    avg_low
FROM (
    SELECT DISTINCT ON (item_id) item_id, timestamp, avg_high, avg_low
    FROM price_5m
    WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL)
    ORDER BY item_id, timestamp DESC
) t

UNION ALL

SELECT 
    '1h' AS granularity,
    item_id,
    timestamp AS latest_timestamp,
    (avg_high + avg_low) / 2.0 AS mid_price,
    avg_high,
    avg_low
FROM (
    SELECT DISTINCT ON (item_id) item_id, timestamp, avg_high, avg_low
    FROM price_1h
    WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL)
    ORDER BY item_id, timestamp DESC
) t

UNION ALL

SELECT 
    '6h' AS granularity,
    item_id,
    timestamp AS latest_timestamp,
    (avg_high + avg_low) / 2.0 AS mid_price,
    avg_high,
    avg_low
FROM (
    SELECT DISTINCT ON (item_id) item_id, timestamp, avg_high, avg_low
    FROM price_6h
    WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL)
    ORDER BY item_id, timestamp DESC
) t

UNION ALL

SELECT 
    '24h' AS granularity,
    item_id,
    timestamp AS latest_timestamp,
    (avg_high + avg_low) / 2.0 AS mid_price,
    avg_high,
    avg_low
FROM (
    SELECT DISTINCT ON (item_id) item_id, timestamp, avg_high, avg_low
    FROM price_24h
    WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL)
    ORDER BY item_id, timestamp DESC
) t;

-- Create indexes on the materialized view for fast lookups
CREATE INDEX IF NOT EXISTS idx_latest_points_granularity_item 
ON latest_price_points(granularity, item_id);

CREATE INDEX IF NOT EXISTS idx_latest_points_item_granularity 
ON latest_price_points(item_id, granularity);

-- Create a function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_latest_price_points()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY latest_price_points;
END;
$$ LANGUAGE plpgsql;

-- Also create a view for first 1h points (needed for 1w trend)
DROP MATERIALIZED VIEW IF EXISTS first_1h_price_points CASCADE;

CREATE MATERIALIZED VIEW first_1h_price_points AS
SELECT 
    item_id,
    timestamp AS first_timestamp,
    (avg_high + avg_low) / 2.0 AS mid_price,
    avg_high,
    avg_low
FROM (
    SELECT DISTINCT ON (item_id) item_id, timestamp, avg_high, avg_low
    FROM price_1h
    WHERE (avg_high IS NOT NULL OR avg_low IS NOT NULL)
    ORDER BY item_id, timestamp ASC
) t;

CREATE INDEX IF NOT EXISTS idx_first_1h_item ON first_1h_price_points(item_id);

CREATE OR REPLACE FUNCTION refresh_first_1h_price_points()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY first_1h_price_points;
END;
$$ LANGUAGE plpgsql;
`;

(async () => {
  try {
    console.log("=".repeat(80));
    console.log("Strategy 5: Materialized Latest Points View");
    console.log("=".repeat(80));
    console.log();
    
    console.log("Creating materialized views...");
    await db.query(materializedView);
    console.log("✅ Materialized views created successfully");
    
    console.log("\nRefreshing materialized views (this may take a while)...");
    await db.query(`REFRESH MATERIALIZED VIEW latest_price_points`);
    await db.query(`REFRESH MATERIALIZED VIEW first_1h_price_points`);
    console.log("✅ Materialized views refreshed");
    
    // Show statistics
    const { rows: stats } = await db.query(`
        SELECT 
            granularity,
            COUNT(*) AS item_count,
            MIN(latest_timestamp) AS oldest_timestamp,
            MAX(latest_timestamp) AS newest_timestamp
        FROM latest_price_points
        GROUP BY granularity
        ORDER BY granularity
    `);
    
    console.log("\nMaterialized view statistics:");
    console.log("Granularity | Item Count | Oldest Timestamp | Newest Timestamp");
    console.log("-".repeat(80));
    stats.forEach(row => {
        console.log(
            `${row.granularity.padEnd(11)} | ` +
            `${row.item_count.toString().padStart(10)} | ` +
            `${new Date(row.oldest_timestamp * 1000).toISOString().padStart(19)} | ` +
            `${new Date(row.newest_timestamp * 1000).toISOString().padStart(19)}`
        );
    });
    
    console.log("\n\n✅ Strategy 5 implementation complete!");
    console.log("\nNote: Materialized views need to be refreshed periodically.");
    console.log("Call refresh_latest_price_points() and refresh_first_1h_price_points() functions");
    console.log("or use: REFRESH MATERIALIZED VIEW CONCURRENTLY latest_price_points;");
    
  } catch (err) {
    console.error("❌ Failed to create materialized views:", err);
    console.error(err.stack);
  } finally {
    await db.end();
  }
})();

