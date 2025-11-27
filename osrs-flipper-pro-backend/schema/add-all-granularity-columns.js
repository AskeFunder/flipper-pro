require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const migration = `
-- Add price high/low columns for all granularities
ALTER TABLE canonical_items
  ADD COLUMN IF NOT EXISTS price_6h_high BIGINT,
  ADD COLUMN IF NOT EXISTS price_6h_low BIGINT,
  ADD COLUMN IF NOT EXISTS price_24h_high BIGINT,
  ADD COLUMN IF NOT EXISTS price_24h_low BIGINT,
  ADD COLUMN IF NOT EXISTS price_1w_high BIGINT,
  ADD COLUMN IF NOT EXISTS price_1w_low BIGINT,
  ADD COLUMN IF NOT EXISTS price_1m_high BIGINT,
  ADD COLUMN IF NOT EXISTS price_1m_low BIGINT,
  ADD COLUMN IF NOT EXISTS price_3m_high BIGINT,
  ADD COLUMN IF NOT EXISTS price_3m_low BIGINT,
  ADD COLUMN IF NOT EXISTS price_1y_high BIGINT,
  ADD COLUMN IF NOT EXISTS price_1y_low BIGINT;

-- Add buy/sell rate columns for all granularities
ALTER TABLE canonical_items
  ADD COLUMN IF NOT EXISTS buy_sell_rate_6h NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS buy_sell_rate_24h NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS buy_sell_rate_1w NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS buy_sell_rate_1m NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS buy_sell_rate_3m NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS buy_sell_rate_1y NUMERIC(10,2);
`;

(async () => {
  try {
    await db.query(migration);
    console.log("✅ Added all granularity columns successfully");
  } catch (err) {
    console.error("❌ Failed to add granularity columns:", err);
  } finally {
    await db.end();
  }
})();

