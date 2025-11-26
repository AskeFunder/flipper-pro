/**
 * Migration: Update trend columns from NUMERIC(10,2) to NUMERIC(18,4)
 * This allows for larger trend values (up to ±100,000%) and more precision
 */

require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const migration = `
-- Update all trend columns to NUMERIC(18,4) to handle larger values
ALTER TABLE canonical_items 
  ALTER COLUMN trend_5m TYPE NUMERIC(18,4),
  ALTER COLUMN trend_1h TYPE NUMERIC(18,4),
  ALTER COLUMN trend_6h TYPE NUMERIC(18,4),
  ALTER COLUMN trend_24h TYPE NUMERIC(18,4),
  ALTER COLUMN trend_7d TYPE NUMERIC(18,4),
  ALTER COLUMN trend_1m TYPE NUMERIC(18,4),
  ALTER COLUMN trend_3m TYPE NUMERIC(18,4),
  ALTER COLUMN trend_1y TYPE NUMERIC(18,4);
`;

(async () => {
  try {
    console.log("Starting migration: Update trend columns to NUMERIC(18,4)...");
    await db.query(migration);
    console.log("✅ Successfully updated all trend columns to NUMERIC(18,4)");
    
    // Verify the changes
    const { rows } = await db.query(`
      SELECT 
        column_name, 
        data_type, 
        numeric_precision, 
        numeric_scale
      FROM information_schema.columns
      WHERE table_name = 'canonical_items'
        AND column_name LIKE 'trend_%'
      ORDER BY column_name
    `);
    
    console.log("\nVerification - Trend column types:");
    rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}(${row.numeric_precision},${row.numeric_scale})`);
    });
    
  } catch (err) {
    console.error("❌ Failed to update trend columns:", err);
    process.exit(1);
  } finally {
    await db.end();
  }
})();

