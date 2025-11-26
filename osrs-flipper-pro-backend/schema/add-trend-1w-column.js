require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const migration = `
-- Add trend_1w column
ALTER TABLE canonical_items 
  ADD COLUMN IF NOT EXISTS trend_1w NUMERIC(10,2);
`;

(async () => {
  try {
    await db.query(migration);
    console.log("✅ Added trend_1w column successfully");
  } catch (err) {
    console.error("❌ Failed to add trend_1w column:", err);
  } finally {
    await db.end();
  }
})();

