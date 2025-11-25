require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const indexes = `
-- Index for item name search (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_items_name_lower ON items(LOWER(name));

-- Indexes for price_instants JOINs (item_id + type for faster lookups)
CREATE INDEX IF NOT EXISTS idx_price_instants_item_type ON price_instants(item_id, type);

-- Indexes for price tables JOINs (item_id for faster lookups)
CREATE INDEX IF NOT EXISTS idx_price_5m_item_id ON price_5m(item_id);
CREATE INDEX IF NOT EXISTS idx_price_1h_item_id ON price_1h(item_id);
CREATE INDEX IF NOT EXISTS idx_price_6h_item_id ON price_6h(item_id);
CREATE INDEX IF NOT EXISTS idx_price_24h_item_id ON price_24h(item_id);

-- Indexes for timestamp filtering (if you filter by buy_time/sell_time)
CREATE INDEX IF NOT EXISTS idx_price_instants_timestamp ON price_instants(timestamp);

-- Composite index for latest price lookups (item_id + type + timestamp DESC)
CREATE INDEX IF NOT EXISTS idx_price_instants_latest ON price_instants(item_id, type, timestamp DESC);

-- Critical indexes for LATERAL JOIN performance (item_id + timestamp for time-based filters)
-- These are essential for the volume/turnover/buy_sell_rate calculations
CREATE INDEX IF NOT EXISTS idx_price_5m_item_timestamp ON price_5m(item_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_price_1h_item_timestamp ON price_1h(item_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_price_6h_item_timestamp ON price_6h(item_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_price_24h_item_timestamp ON price_24h(item_id, timestamp DESC);
`;

(async () => {
  try {
    await db.query(indexes);
    console.log("✅ Indexes created successfully");
  } catch (err) {
    console.error("❌ Failed to create indexes:", err);
  } finally {
    await db.end();
  }
})();

