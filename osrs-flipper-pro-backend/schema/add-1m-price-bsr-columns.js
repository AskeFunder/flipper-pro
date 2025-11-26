require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const migration = `
-- Add 1m price high/low and buy/sell rate columns
ALTER TABLE canonical_items 
  ADD COLUMN IF NOT EXISTS price_1m_high BIGINT,
  ADD COLUMN IF NOT EXISTS price_1m_low BIGINT,
  ADD COLUMN IF NOT EXISTS buy_sell_rate_1m NUMERIC(10,2);
`;

(async () => {
  try {
    await db.query(migration);
    console.log("✅ Added 1m price and buy/sell rate columns successfully");
  } catch (err) {
    console.error("❌ Failed to add 1m columns:", err);
  } finally {
    await db.end();
  }
})();

