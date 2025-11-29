require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const schema = `
CREATE TABLE IF NOT EXISTS canonical_items (
  item_id INTEGER PRIMARY KEY,
  
  -- Item metadata (from items table)
  name TEXT,
  icon TEXT,
  members BOOLEAN,
  "limit" INTEGER,
  
  -- Prices (from price_instants - direct from API)
  high BIGINT,
  low BIGINT,
  high_timestamp INTEGER,
  low_timestamp INTEGER,
  
  -- Calculated from high/low
  margin BIGINT,
  roi_percent NUMERIC(10,2),
  spread_percent NUMERIC(10,2),
  max_profit NUMERIC(20,0),
  max_investment NUMERIC(20,0),
  
  -- Volume (from price_5m aggregations)
  volume_5m BIGINT,
  volume_1h BIGINT,
  volume_6h BIGINT,
  volume_24h BIGINT,
  volume_7d BIGINT,
  
  -- Prices from aggregated tables (for historical context)
  price_5m_high BIGINT,
  price_5m_low BIGINT,
  price_1h_high BIGINT,
  price_1h_low BIGINT,
  price_6h_high BIGINT,
  price_6h_low BIGINT,
  price_24h_high BIGINT,
  price_24h_low BIGINT,
  price_1w_high BIGINT,
  price_1w_low BIGINT,
  price_1m_high BIGINT,
  price_1m_low BIGINT,
  price_3m_high BIGINT,
  price_3m_low BIGINT,
  price_1y_high BIGINT,
  price_1y_low BIGINT,
  
  -- Turnover (average_price × volume) - using NUMERIC to handle large values
  turnover_5m NUMERIC(20,0),
  turnover_1h NUMERIC(20,0),
  turnover_6h NUMERIC(20,0),
  turnover_24h NUMERIC(20,0),
  turnover_7d NUMERIC(20,0),
  turnover_1m NUMERIC(20,0),
  
  -- Buy/sell rate (high_volume / low_volume)
  buy_sell_rate_5m NUMERIC(10,2),
  buy_sell_rate_1h NUMERIC(10,2),
  buy_sell_rate_6h NUMERIC(10,2),
  buy_sell_rate_24h NUMERIC(10,2),
  buy_sell_rate_1w NUMERIC(10,2),
  buy_sell_rate_1m NUMERIC(10,2),
  buy_sell_rate_3m NUMERIC(10,2),
  buy_sell_rate_1y NUMERIC(10,2),
  
  -- Trend (percentage change over time period)
  trend_5m NUMERIC(10,2),
  trend_1h NUMERIC(10,2),
  trend_6h NUMERIC(10,2),
  trend_24h NUMERIC(10,2),
  trend_7d NUMERIC(10,2),
  trend_1m NUMERIC(10,2),
  trend_3m NUMERIC(10,2),
  trend_1y NUMERIC(10,2),
  
  -- Metadata
  timestamp_updated INTEGER NOT NULL
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_canonical_margin ON canonical_items(margin DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_roi ON canonical_items(roi_percent DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_turnover_1h ON canonical_items(turnover_1h DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_turnover_24h ON canonical_items(turnover_24h DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_volume_1h ON canonical_items(volume_1h DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_volume_24h ON canonical_items(volume_24h DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_members ON canonical_items(members);
CREATE INDEX IF NOT EXISTS idx_canonical_limit ON canonical_items("limit");
CREATE INDEX IF NOT EXISTS idx_canonical_name ON canonical_items(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_canonical_high ON canonical_items(high DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_low ON canonical_items(low DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_buy_sell_rate_1h ON canonical_items(buy_sell_rate_1h DESC);
`;

(async () => {
  try {
    await db.query(schema);
    console.log("✅ Canonical items table created successfully");
  } catch (err) {
    console.error("❌ Failed to create canonical table:", err);
  } finally {
    await db.end();
  }
})();

