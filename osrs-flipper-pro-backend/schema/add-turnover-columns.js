require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const migration = `
-- Add missing turnover columns
ALTER TABLE canonical_items 
  ADD COLUMN IF NOT EXISTS turnover_6h NUMERIC(20,0),
  ADD COLUMN IF NOT EXISTS turnover_7d NUMERIC(20,0),
  ADD COLUMN IF NOT EXISTS turnover_1m NUMERIC(20,0);
`;

(async () => {
  try {
    await db.query(migration);
    console.log("✅ Added turnover_6h, turnover_7d, turnover_1m columns successfully");
  } catch (err) {
    console.error("❌ Failed to add turnover columns:", err);
  } finally {
    await db.end();
  }
})();




