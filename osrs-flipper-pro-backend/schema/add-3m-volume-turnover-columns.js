require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const migration = `
-- Add 3m volume and turnover columns
ALTER TABLE canonical_items 
  ADD COLUMN IF NOT EXISTS volume_3m BIGINT,
  ADD COLUMN IF NOT EXISTS turnover_3m NUMERIC(20,0);
`;

(async () => {
  try {
    await db.query(migration);
    console.log("✅ Added 3m volume and turnover columns successfully");
  } catch (err) {
    console.error("❌ Failed to add 3m columns:", err);
  } finally {
    await db.end();
  }
})();

