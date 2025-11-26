require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const migration = `
-- Add 24h price high/low and buy/sell rate columns
ALTER TABLE canonical_items 
  ADD COLUMN IF NOT EXISTS price_24h_high BIGINT,
  ADD COLUMN IF NOT EXISTS price_24h_low BIGINT,
  ADD COLUMN IF NOT EXISTS buy_sell_rate_24h NUMERIC(10,2);
`;

(async () => {
  try {
    await db.query(migration);
    console.log("✅ Added 24h price and buy/sell rate columns successfully");
  } catch (err) {
    console.error("❌ Failed to add 24h columns:", err);
  } finally {
    await db.end();
  }
})();

