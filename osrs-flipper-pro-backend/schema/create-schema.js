require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const schema = `

CREATE TABLE IF NOT EXISTS price_5m (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  avg_high BIGINT,
  avg_low BIGINT,
  low_volume BIGINT,
  high_volume BIGINT,
  volume BIGINT GENERATED ALWAYS AS (low_volume + high_volume) STORED,
  UNIQUE(item_id, timestamp)
);

CREATE TABLE IF NOT EXISTS price_1h (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  avg_high BIGINT,
  avg_low BIGINT,
  low_volume BIGINT,
  high_volume BIGINT,
  volume BIGINT GENERATED ALWAYS AS (low_volume + high_volume) STORED,
  UNIQUE(item_id, timestamp)
);

CREATE TABLE IF NOT EXISTS price_6h (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  avg_high BIGINT,
  avg_low BIGINT,
  low_volume BIGINT,
  high_volume BIGINT,
  volume BIGINT GENERATED ALWAYS AS (low_volume + high_volume) STORED,
  UNIQUE(item_id, timestamp)
);

CREATE TABLE IF NOT EXISTS price_24h (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  avg_high BIGINT,
  avg_low BIGINT,
  low_volume BIGINT,
  high_volume BIGINT,
  volume BIGINT GENERATED ALWAYS AS (low_volume + high_volume) STORED,
  UNIQUE(item_id, timestamp)
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  name TEXT,
  members BOOLEAN,
  examine TEXT,
  "limit" INTEGER,
  value INTEGER,
  highalch INTEGER,
  lowalch INTEGER,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS price_instants (
  item_id INTEGER NOT NULL,
  price BIGINT NOT NULL,
  type TEXT CHECK(type IN ('high', 'low')) NOT NULL,
  timestamp INTEGER NOT NULL,
  last_updated INTEGER NOT NULL,
  PRIMARY KEY (item_id, type)
);

CREATE TABLE IF NOT EXISTS price_instant_log (
  item_id INTEGER NOT NULL,
  price BIGINT NOT NULL,
  type TEXT CHECK(type IN ('high', 'low')) NOT NULL,
  timestamp INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, type, timestamp)
);

`;

(async () => {
  try {
    await db.query(schema);
    console.log("✅ PostgreSQL schema created successfully");
  } catch (err) {
    console.error("❌ Failed to create schema:", err);
  } finally {
    await db.end();
  }
})();
