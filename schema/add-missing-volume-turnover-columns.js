require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const migration = `
-- Add missing volume and turnover columns for 1m, 3m, and 1y
ALTER TABLE canonical_items
  ADD COLUMN IF NOT EXISTS volume_1m BIGINT,
  ADD COLUMN IF NOT EXISTS volume_3m BIGINT,
  ADD COLUMN IF NOT EXISTS volume_1y BIGINT,
  ADD COLUMN IF NOT EXISTS turnover_3m NUMERIC(20,0),
  ADD COLUMN IF NOT EXISTS turnover_1y NUMERIC(20,0);
`;

(async () => {
  try {
    await db.query(migration);
    console.log("✅ Added missing volume and turnover columns successfully");
  } catch (err) {
    console.error("❌ Failed to add volume/turnover columns:", err);
  } finally {
    await db.end();
  }
})();



