require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const migration = `
-- Add trend columns
ALTER TABLE canonical_items 
  ADD COLUMN IF NOT EXISTS trend_5m NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS trend_1h NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS trend_6h NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS trend_24h NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS trend_7d NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS trend_1m NUMERIC(10,2);
`;

(async () => {
  try {
    await db.query(migration);
    console.log("✅ Added trend columns successfully");
  } catch (err) {
    console.error("❌ Failed to add trend columns:", err);
  } finally {
    await db.end();
  }
})();




