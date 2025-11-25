# Complete Item Data Rundown

This document lists all available data fields for items in the OSRS Flipper Pro system. Use this to plan the organization of data on the item detail page.

## 📊 Data Categories

### 1. **Core Item Metadata** (from `items` table)
- **item_id** (INTEGER) - Unique item identifier
- **name** (TEXT) - Item name
- **icon** (TEXT) - Icon filename for display
- **members** (BOOLEAN) - Whether item is members-only
- **limit** (INTEGER) - GE trade limit (max quantity per 4 hours)
- **examine** (TEXT) - Item examine text (available in items table, not in canonical)
- **value** (INTEGER) - Base item value (available in items table, not in canonical)
- **highalch** (INTEGER) - High alchemy value (available in items table, not in canonical)
- **lowalch** (INTEGER) - Low alchemy value (available in items table, not in canonical)

### 2. **Current Prices** (from `price_instants` table - real-time API data)
- **high** (BIGINT) - Current sell price (instant high)
- **low** (BIGINT) - Current buy price (instant low)
- **high_timestamp** (INTEGER) - Unix timestamp when high price was last updated
- **low_timestamp** (INTEGER) - Unix timestamp when low price was last updated

### 3. **Calculated Profitability Metrics**
- **margin** (BIGINT) - Profit per item after GE tax (FLOOR(high * 0.98) - low)
- **roi_percent** (NUMERIC 10,2) - Return on investment percentage
- **spread_percent** (NUMERIC 10,2) - Price spread percentage ((high - low) / high * 100)
- **max_profit** (NUMERIC 20,0) - Maximum profit if you buy/sell at limit (margin × limit)
- **max_investment** (NUMERIC 20,0) - Maximum investment needed (low × limit)

### 4. **Volume Data** (aggregated from time-series tables)
All volumes are calculated from `price_5m`, `price_1h`, `price_6h`, `price_24h` tables:
- **volume_5m** (BIGINT) - Volume in last 5 minutes (single latest data point)
- **volume_1h** (BIGINT) - Volume in last 1 hour (sum of 5m intervals)
- **volume_6h** (BIGINT) - Volume in last 6 hours (sum of 5m intervals)
- **volume_24h** (BIGINT) - Volume in last 24 hours (sum of 5m intervals)
- **volume_7d** (BIGINT) - Volume in last 7 days (sum of 1h intervals)
- **volume_1m** (BIGINT) - Volume in last 1 month (sum of 6h intervals)

### 5. **Turnover Data** (average_price × volume)
Turnover represents the total value of items traded:
- **turnover_5m** (NUMERIC 20,0) - Turnover in last 5 minutes
- **turnover_1h** (NUMERIC 20,0) - Turnover in last 1 hour
- **turnover_6h** (NUMERIC 20,0) - Turnover in last 6 hours
- **turnover_24h** (NUMERIC 20,0) - Turnover in last 24 hours
- **turnover_7d** (NUMERIC 20,0) - Turnover in last 7 days
- **turnover_1m** (NUMERIC 20,0) - Turnover in last 1 month

### 6. **Price Trends** (percentage change over time periods)
Trends show price movement as percentage change:
- **trend_5m** (NUMERIC 10,2) - Price change in last 5 minutes (%)
- **trend_1h** (NUMERIC 10,2) - Price change in last 1 hour (%)
- **trend_6h** (NUMERIC 10,2) - Price change in last 6 hours (%)
- **trend_24h** (NUMERIC 10,2) - Price change in last 24 hours (%)
- **trend_7d** (NUMERIC 10,2) - Price change in last 7 days (%)
- **trend_1m** (NUMERIC 10,2) - Price change in last 1 month (%)
- **trend_3m** (NUMERIC 10,2) - Price change in last 3 months (%)
- **trend_1y** (NUMERIC 10,2) - Price change in last 1 year (%)

### 7. **Buy/Sell Rate** (high_volume / low_volume ratio)
Shows the ratio of sell volume to buy volume (indicates demand vs supply):
- **buy_sell_rate_5m** (NUMERIC 10,2) - Buy/sell rate in last 5 minutes
- **buy_sell_rate_1h** (NUMERIC 10,2) - Buy/sell rate in last 1 hour
- **buy_sell_rate_6h** (NUMERIC 10,2) - Buy/sell rate in last 6 hours (available in queries, not in canonical)
- **buy_sell_rate_24h** (NUMERIC 10,2) - Buy/sell rate in last 24 hours (available in queries, not in canonical)
- **buy_sell_rate_7d** (NUMERIC 10,2) - Buy/sell rate in last 7 days (available in queries, not in canonical)

### 8. **Aggregated Historical Prices** (from time-series tables)
These are average prices from aggregated tables, not instant prices:
- **price_5m_high** (BIGINT) - Average high price from latest 5m interval
- **price_5m_low** (BIGINT) - Average low price from latest 5m interval
- **price_1h_high** (BIGINT) - Average high price from latest 1h interval
- **price_1h_low** (BIGINT) - Average low price from latest 1h interval

### 9. **Metadata**
- **timestamp_updated** (INTEGER) - When canonical data was last updated

---

## 📈 Historical/Time-Series Data (Available via API endpoints)

### Price Chart Data
Available via `/api/prices/chart/:granularity/:id`:
- **Granularities**: `4h`, `5m`, `1h`, `6h`, `24h`
- Returns array of: `{ ts, high, low, volume }` (timestamp, high price, low price, volume)
- Can be filtered by `since` query parameter (Unix timestamp)

### Recent Trades
Available via `/api/prices/recent/:id`:
- Returns last 20 trades from `price_instant_log`
- Format: `[{ ts, type, price }]` where type is 'buy' or 'sell'

### Latest Price Data
Available via `/api/prices/latest/:id`:
- Returns: `{ high, low, margin, roi, ts, lowTs, trend_5m, trend_1h, trend_6h, trend_24h, trend_7d, trend_1m }`

---

## 🗄️ Database Tables Reference

### Main Tables:
1. **canonical_items** - Precomputed aggregated data (fast queries)
2. **items** - Base item metadata
3. **price_instants** - Current real-time prices (high/low)
4. **price_instant_log** - Historical log of instant price changes
5. **price_5m** - 5-minute aggregated price data
6. **price_1h** - 1-hour aggregated price data
7. **price_6h** - 6-hour aggregated price data
8. **price_24h** - 24-hour aggregated price data

### Time-Series Table Structure:
Each time-series table (`price_5m`, `price_1h`, etc.) contains:
- `item_id` (INTEGER)
- `timestamp` (INTEGER) - Unix timestamp
- `avg_high` (BIGINT) - Average high price in that interval
- `avg_low` (BIGINT) - Average low price in that interval
- `high_volume` (BIGINT) - Volume of high trades
- `low_volume` (BIGINT) - Volume of low trades
- `volume` (BIGINT) - Generated column: high_volume + low_volume

---

## 💡 Suggested Organization for Item Detail Page

### Primary Section (Above the fold):
- Item name, icon
- Current buy/sell prices (high/low)
- Margin, ROI%, Spread%
- Max profit, Max investment
- Trade limit

### Secondary Sections:

**Trading Activity:**
- Volume metrics (5m, 1h, 6h, 24h, 7d, 1m)
- Turnover metrics (5m, 1h, 6h, 24h, 7d, 1m)
- Buy/sell rate (5m, 1h)

**Price Trends:**
- Short-term trends (5m, 1h, 6h, 24h)
- Medium-term trends (7d, 1m)
- Long-term trends (3m, 1y)

**Historical Data:**
- Price chart (interactive, multiple time ranges)
- Recent trades table
- Aggregated prices (5m, 1h averages)

**Item Information:**
- Members only status
- Examine text
- Base value, high alch, low alch

---

## 🔍 Notes

- All prices are in OSRS gold pieces (gp)
- Timestamps are Unix timestamps (seconds since epoch)
- Percentages are stored as NUMERIC with 2 decimal places
- Large numbers (turnover, max_profit) use NUMERIC(20,0) to handle very large values
- The canonical_items table is precomputed for fast queries
- Historical data can be queried directly from time-series tables for charts
- Trend calculations compare mid-price (avg of high and low) between time periods

