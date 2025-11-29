require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const migration = `
-- Add new trend columns for 90-day and 365-day trends
ALTER TABLE canonical_items 
  ADD COLUMN IF NOT EXISTS trend_3m NUMERIC(10,2);
ALTER TABLE canonical_items 
  ADD COLUMN IF NOT EXISTS trend_1y NUMERIC(10,2);
`;

(async () => {
  try {
    await db.query(migration);
    console.log("✅ Added trend_3m and trend_1y columns successfully");
  } catch (err) {
    console.error("❌ Failed to add trend columns:", err);
  } finally {
    await db.end();
  }
})();


