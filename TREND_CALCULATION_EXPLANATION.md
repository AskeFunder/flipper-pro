# Trend Calculation System - Complete Explanation

## Overview
Trend values represent the percentage change in item prices over different time periods. The system calculates 6 different trend metrics: `trend_5m`, `trend_1h`, `trend_6h`, `trend_24h`, `trend_7d`, and `trend_1m`.

---

## 1. Data Sources

### External API: OSRS Wiki Price API
**Base URL**: `https://prices.runescape.wiki/api/v1/osrs/`

The system fetches aggregated price data from the OSRS Wiki API at different granularities:

- **5m endpoint**: `https://prices.runescape.wiki/api/v1/osrs/5m`
- **1h endpoint**: `https://prices.runescape.wiki/api/v1/osrs/1h`
- **6h endpoint**: `https://prices.runescape.wiki/api/v1/osrs/6h`
- **24h endpoint**: `https://prices.runescape.wiki/api/v1/osrs/24h`

### API Response Structure
Each API response contains:
```json
{
  "timestamp": 1234567890,
  "data": {
    "item_id": {
      "avgHighPrice": 1000000,
      "avgLowPrice": 950000,
      "highPriceVolume": 150,
      "lowPriceVolume": 200
    }
  }
}
```

### Data Collection Process

#### A. Polling (Real-time updates)
**File**: `osrs-flipper-pro-backend/poller/poll-granularities.js`

- Polls the API endpoints periodically (scheduled via `scheduler.js`)
- Fetches the latest aggregated price data
- Inserts into corresponding database tables:
  - `price_5m` table ← 5m endpoint
  - `price_1h` table ← 1h endpoint
  - `price_6h` table ← 6h endpoint
  - `price_24h` table ← 24h endpoint

**Mapping**:
- API `avgHighPrice` → Database `avg_high`
- API `avgLowPrice` → Database `avg_low`
- API `highPriceVolume` → Database `high_volume`
- API `lowPriceVolume` → Database `low_volume`

#### B. Backfilling (Historical data)
**File**: `osrs-flipper-pro-backend/poller/backfill-timeseries.js`

- Fetches historical data for missing timestamps
- Uses the same API endpoints with `?timestamp=` parameter
- Populates historical price data for trend calculations

---

## 2. Database Schema

### Tables Used for Trend Calculation

#### `price_5m` Table
```sql
CREATE TABLE price_5m (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,  -- Unix timestamp (seconds)
  avg_high BIGINT,              -- Average high price over 5 minutes
  avg_low BIGINT,               -- Average low price over 5 minutes
  low_volume BIGINT,
  high_volume BIGINT,
  volume BIGINT GENERATED ALWAYS AS (low_volume + high_volume) STORED,
  UNIQUE(item_id, timestamp)
);
```

#### `price_1h` Table
Same structure as `price_5m`, but contains 1-hour aggregated data.

#### `price_6h` Table
Same structure as `price_5m`, but contains 6-hour aggregated data.

#### `price_24h` Table
Same structure as `price_5m`, but contains 24-hour aggregated data.

**Note**: Each table stores one row per item per timestamp. Timestamps are Unix epoch seconds.

---

## 3. Mid Price Calculation

Before calculating trends, the system computes a "mid price" from `avg_high` and `avg_low`:

```sql
CASE 
    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
    WHEN avg_high IS NOT NULL THEN avg_high
    WHEN avg_low IS NOT NULL THEN avg_low
    ELSE NULL
END AS mid
```

**Logic**:
- If both high and low exist: use average `(avg_high + avg_low) / 2.0`
- If only high exists: use `avg_high`
- If only low exists: use `avg_low`
- If neither exists: return `NULL`

This mid price represents the average market price at that point in time.

---

## 4. Trend Calculation Formula

### Basic Formula
```
trend = ROUND(100.0 * (current_mid_price - previous_mid_price) / previous_mid_price, 2)
```

**Where**:
- `current_mid_price` = Mid price at the current/latest timestamp
- `previous_mid_price` = Mid price at a historical timestamp (X seconds ago)
- Result is a percentage (e.g., 5.25 means +5.25% increase)

**SQL Implementation**:
```sql
ROUND(100.0 * (current.mid - previous.mid) / NULLIF(previous.mid, 0), 2)
```

**`NULLIF(previous.mid, 0)`**: Prevents division by zero. If previous price is 0, returns NULL instead of error.

---

## 5. Trend Periods Explained

### trend_5m (5-minute trend)
**Time difference**: 300 seconds (5 minutes)

**Current price**: Latest mid price from `price_5m` table
**Historical price**: Mid price from `price_5m` table where `timestamp <= now - 300`

**Calculation**:
```sql
-- Get latest 5m mid price
latest_5m: Latest row from price_5m → calculate mid

-- Get 5m mid price from 5 minutes ago
prev_5m_300: price_5m WHERE timestamp <= now - 300 → calculate mid

-- Calculate trend
trend_5m = 100.0 * (latest_5m.mid - prev_5m_300.mid) / prev_5m_300.mid
```

**Use case**: Very short-term price movement (last 5 minutes)

---

### trend_1h (1-hour trend)
**Time difference**: 3600 seconds (1 hour)

**Current price**: Latest mid price from `price_5m` table
**Historical price**: Mid price from `price_5m` table where `timestamp <= now - 3600`

**Note**: Uses `price_5m` for both current and historical, but looks back 1 hour.

**Calculation**:
```sql
latest_5m: Latest row from price_5m → calculate mid
prev_5m_3600: price_5m WHERE timestamp <= now - 3600 → calculate mid
trend_1h = 100.0 * (latest_5m.mid - prev_5m_3600.mid) / prev_5m_3600.mid
```

**Use case**: Short-term price movement (last hour)

---

### trend_6h (6-hour trend)
**Time difference**: 21600 seconds (6 hours)

**Current price**: Latest mid price from `price_5m` table
**Historical price**: Mid price from `price_5m` table where `timestamp <= now - 21600`

**Calculation**:
```sql
latest_5m: Latest row from price_5m → calculate mid
prev_5m_21600: price_5m WHERE timestamp <= now - 21600 → calculate mid
trend_6h = 100.0 * (latest_5m.mid - prev_5m_21600.mid) / prev_5m_21600.mid
```

**Use case**: Medium-term price movement (last 6 hours)

---

### trend_24h (24-hour trend)
**Time difference**: 86400 seconds (24 hours / 1 day)

**Current price**: Latest mid price from `price_5m` table
**Historical price**: Mid price from `price_5m` table where `timestamp <= now - 86400`

**Calculation**:
```sql
latest_5m: Latest row from price_5m → calculate mid
prev_5m_86400: price_5m WHERE timestamp <= now - 86400 → calculate mid
trend_24h = 100.0 * (latest_5m.mid - prev_5m_86400.mid) / prev_5m_86400.mid
```

**Use case**: Daily price movement (last 24 hours)

---

### trend_7d (7-day trend)
**Time difference**: 604800 seconds (7 days)

**Current price**: Latest mid price from `price_1h` table
**Historical price**: Mid price from `price_1h` table where `timestamp <= now - 604800`

**Note**: Uses `price_1h` table (1-hour granularity) for better performance on longer time periods.

**Calculation**:
```sql
latest_1h: Latest row from price_1h → calculate mid
prev_1h_604800: price_1h WHERE timestamp <= now - 604800 → calculate mid
trend_7d = 100.0 * (latest_1h.mid - prev_1h_604800.mid) / prev_1h_604800.mid
```

**Use case**: Weekly price movement (last 7 days)

---

### trend_1m (1-month trend)
**Time difference**: 2592000 seconds (30 days)

**Current price**: Latest mid price from `price_6h` table
**Historical price**: Mid price from `price_6h` table where `timestamp <= now - 2592000`

**Note**: Uses `price_6h` table (6-hour granularity) for better performance on very long time periods.

**Calculation**:
```sql
latest_6h: Latest row from price_6h → calculate mid
prev_6h_2592000: price_6h WHERE timestamp <= now - 2592000 → calculate mid
trend_1m = 100.0 * (latest_6h.mid - prev_6h_2592000.mid) / prev_6h_2592000.mid
```

**Use case**: Monthly price movement (last 30 days)

---

## 6. Implementation Details

### File Location
**Main calculation**: `osrs-flipper-pro-backend/poller/update-canonical-items.js`
**Lines**: 276-416

### Query Structure
The system uses a single optimized SQL query with Common Table Expressions (CTEs) to calculate all 6 trends at once:

```sql
WITH 
    -- CTE 1: Latest prices from each granularity table
    latest_5m AS (...),
    latest_1h AS (...),
    latest_6h AS (...),
    
    -- CTE 2-N: Historical prices for each trend period
    prev_5m_300 AS (...),      -- For trend_5m
    prev_5m_3600 AS (...),     -- For trend_1h
    prev_5m_21600 AS (...),    -- For trend_6h
    prev_5m_86400 AS (...),    -- For trend_24h
    prev_1h_604800 AS (...),   -- For trend_7d
    prev_6h_2592000 AS (...)   -- For trend_1m
    
SELECT 
    ROUND(100.0 * (l5m.mid - p5m300.mid) / NULLIF(p5m300.mid, 0), 2) AS trend_5m,
    ROUND(100.0 * (l5m.mid - p5m3600.mid) / NULLIF(p5m3600.mid, 0), 2) AS trend_1h,
    ROUND(100.0 * (l5m.mid - p5m21600.mid) / NULLIF(p5m21600.mid, 0), 2) AS trend_6h,
    ROUND(100.0 * (l5m.mid - p5m86400.mid) / NULLIF(p5m86400.mid, 0), 2) AS trend_24h,
    ROUND(100.0 * (l1h.mid - p1h604800.mid) / NULLIF(p1h604800.mid, 0), 2) AS trend_7d,
    ROUND(100.0 * (l6h.mid - p6h2592000.mid) / NULLIF(p6h2592000.mid, 0), 2) AS trend_1m
FROM (SELECT 1) dummy
LEFT JOIN latest_5m l5m ON true
LEFT JOIN latest_1h l1h ON true
LEFT JOIN latest_6h l6h ON true
LEFT JOIN prev_5m_300 p5m300 ON true
LEFT JOIN prev_5m_3600 p5m3600 ON true
LEFT JOIN prev_5m_21600 p5m21600 ON true
LEFT JOIN prev_5m_86400 p5m86400 ON true
LEFT JOIN prev_1h_604800 p1h604800 ON true
LEFT JOIN prev_6h_2592000 p6h2592000 ON true
```

**Why CTEs?**: 
- Breaks down complex query into readable parts
- Allows reuse of mid price calculation logic
- More efficient than multiple separate queries
- Single database round-trip for all 6 trends

### Execution Context
- **When**: Runs as part of `update-canonical-items.js` script
- **Frequency**: Triggered by scheduler after each `/latest` poll (every ~15 seconds)
- **Scope**: Calculates trends for all items in the database
- **Storage**: Results stored in `canonical_items` table columns: `trend_5m`, `trend_1h`, `trend_6h`, `trend_24h`, `trend_7d`, `trend_1m`

---

## 7. Edge Cases and Null Handling

### Missing Data Scenarios

1. **No current price data**:
   - If latest row doesn't exist → `latest_5m.mid` = NULL
   - Result: `trend_5m` = NULL

2. **No historical price data**:
   - If historical row doesn't exist → `prev_5m_300.mid` = NULL
   - Result: `trend_5m` = NULL (division by NULL returns NULL)

3. **Zero historical price**:
   - If `previous.mid = 0` → `NULLIF(previous.mid, 0)` returns NULL
   - Result: `trend` = NULL (prevents division by zero)

4. **Only one price available**:
   - If only `avg_high` exists → uses `avg_high` as mid price
   - If only `avg_low` exists → uses `avg_low` as mid price
   - Still calculates trend if both current and historical have valid mid prices

### NULL Result Interpretation
- `NULL` trend = Insufficient data to calculate trend
- Displayed as "–" in the frontend
- Not included in sorting/filtering operations

---

## 8. Data Flow Diagram

```
OSRS Wiki API
    ↓
[poll-granularities.js] / [backfill-timeseries.js]
    ↓
PostgreSQL Tables:
  - price_5m (5-minute aggregated data)
  - price_1h (1-hour aggregated data)
  - price_6h (6-hour aggregated data)
  - price_24h (24-hour aggregated data)
    ↓
[update-canonical-items.js]
    ↓
Trend Calculation Query (CTEs)
    ↓
canonical_items table
  - trend_5m
  - trend_1h
  - trend_6h
  - trend_24h
  - trend_7d
  - trend_1m
    ↓
Frontend API (/api/items/browse)
    ↓
React Frontend Display
```

---

## 9. Performance Considerations

### Optimization Strategies

1. **Single Query Approach**: All 6 trends calculated in one SQL query instead of 6 separate queries
2. **CTE Usage**: Common Table Expressions allow PostgreSQL to optimize the query plan
3. **Index Usage**: Database indexes on `(item_id, timestamp DESC)` speed up historical lookups
4. **Granularity Selection**: 
   - Short trends (5m-24h) use `price_5m` (more granular, more data points)
   - Medium trends (7d) use `price_1h` (less granular, fewer rows to scan)
   - Long trends (1m) use `price_6h` (least granular, fastest for long periods)

### Query Performance
- **Per item**: ~10-50ms depending on data availability
- **All items**: Processed in batches of 100 to avoid memory issues
- **Lock mechanism**: Prevents concurrent execution to avoid conflicts

---

## 10. Example Calculation

### Scenario: Item with ID 12345

**Current state** (now = 1700000000):
- Latest `price_5m` row: `timestamp = 1699999800`, `avg_high = 1000000`, `avg_low = 950000`
- Mid price = `(1000000 + 950000) / 2 = 975000`

**Historical state** (5 minutes ago, timestamp = 1699999500):
- `price_5m` row: `timestamp = 1699999500`, `avg_high = 900000`, `avg_low = 850000`
- Mid price = `(900000 + 850000) / 2 = 875000`

**Calculation**:
```
trend_5m = 100.0 * (975000 - 875000) / 875000
         = 100.0 * 100000 / 875000
         = 100.0 * 0.1143
         = 11.43%
```

**Result**: `trend_5m = 11.43` (price increased by 11.43% in the last 5 minutes)

---

## 11. Key Files Reference

| File | Purpose |
|------|---------|
| `poller/poll-granularities.js` | Fetches latest aggregated data from API |
| `poller/backfill-timeseries.js` | Fetches historical aggregated data |
| `poller/update-canonical-items.js` | Calculates and stores trends (lines 276-416) |
| `schema/create-schema.js` | Defines database table structures |
| `routes/browse.js` | API endpoint that serves trend data to frontend |

---

## 12. Testing and Validation

### How to Verify Trend Calculations

1. **Check raw data**:
   ```sql
   SELECT * FROM price_5m WHERE item_id = 12345 ORDER BY timestamp DESC LIMIT 2;
   ```

2. **Verify mid price calculation**:
   ```sql
   SELECT 
       timestamp,
       avg_high,
       avg_low,
       (avg_high + avg_low) / 2.0 AS mid
   FROM price_5m 
   WHERE item_id = 12345 
   ORDER BY timestamp DESC 
   LIMIT 2;
   ```

3. **Check calculated trend**:
   ```sql
   SELECT trend_5m, trend_1h, trend_6h, trend_24h, trend_7d, trend_1m
   FROM canonical_items
   WHERE item_id = 12345;
   ```

4. **Manual calculation**:
   - Get current and historical mid prices
   - Apply formula: `100.0 * (current - historical) / historical`
   - Compare with stored `trend_5m` value

---

## Summary

The trend calculation system:
1. **Fetches** aggregated price data from OSRS Wiki API
2. **Stores** in PostgreSQL tables (`price_5m`, `price_1h`, `price_6h`, `price_24h`)
3. **Calculates** mid prices from `avg_high` and `avg_low`
4. **Compares** current mid price with historical mid price
5. **Computes** percentage change using: `100.0 * (current - previous) / previous`
6. **Stores** results in `canonical_items` table for fast frontend access

The system provides 6 different trend periods (5m, 1h, 6h, 24h, 7d, 1m) to show price movements across different timeframes, helping users identify short-term spikes, medium-term trends, and long-term price changes.



