require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const migration = `
-- Add 1w price high/low and buy/sell rate columns
ALTER TABLE canonical_items 
  ADD COLUMN IF NOT EXISTS price_1w_high BIGINT,
  ADD COLUMN IF NOT EXISTS price_1w_low BIGINT,
  ADD COLUMN IF NOT EXISTS buy_sell_rate_1w NUMERIC(10,2);
`;

(async () => {
  try {
    await db.query(migration);
    console.log("✅ Added 1w price and buy/sell rate columns successfully");
  } catch (err) {
    console.error("❌ Failed to add 1w columns:", err);
  } finally {
    await db.end();
  }
})();

