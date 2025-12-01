# Browse Items Technical Documentation
## FlipperPro - Complete Architecture Breakdown

---

## 1️⃣ Row Data Source

### API Endpoint
- **Endpoint**: `GET /api/items/browse`
- **Location**: `routes/browse.js`
- **Query Parameters**:
  - `page` (default: 1)
  - `pageSize` (default: 50)
  - `sortBy` (default: "margin")
  - `order` (default: "desc")
  - `search` (item name search)
  - Filter parameters (see Filtering System below)

### Database Tables
- **Primary Table**: `canonical_items` (single source of truth)
- **No JOINs**: All data comes from this precomputed table
- **Sparkline Data**: Embedded in production (7-day price history array per item)

### Data Composition
The browse endpoint returns data **purely from `canonical_items`** table. This table contains:
- **Latest prices**: `high` (sell_price), `low` (buy_price) with timestamps
- **Precomputed aggregates**: All volume, turnover, trend, and buy/sell rate columns
- **Precomputed metrics**: `margin`, `roi_percent`, `spread_percent`, `max_profit`, `max_investment`
- **Canonical item data**: `name`, `icon`, `members`, `limit`

**No mixing of data sources**: The endpoint does NOT query `/latest`, separate aggregate tables, or compute values on-the-fly. Everything is precomputed and stored in `canonical_items`.

---

## 2️⃣ What Is Displayed in Each Row

### Column Mapping Table

| Column Name | API Field | DB Source | Sortable? | Filterable? | Computed? | Notes |
|------------|-----------|-----------|-----------|-------------|-----------|-------|
| **Item** | `name`, `icon`, `id` | `name`, `icon`, `item_id` | N | N (search only) | No | Includes icon image and link |
| **7d** | `sparkline` | Embedded array | N | N | Backend | 7-day price history for sparkline graph |
| **Buy Price** | `buy_price` | `low` | Y (via `buy_time`) | Y (`minBuyPrice`, `maxBuyPrice`) | No | Direct from `low` column, shows `buy_time` below |
| **Sell Price** | `sell_price` | `high` | Y (via `sell_time`) | Y (`minSellPrice`, `maxSellPrice`) | No | Direct from `high` column, shows `sell_time` below |
| **Margin** | `margin` | `margin` | Y | Y (`minMargin`, `maxMargin`) | Backend | Precomputed: `high - low` |
| **ROI%** | `roi` | `roi_percent` | Y | Y (`minRoi`, `maxRoi`) | Backend | Precomputed percentage |
| **Spread%** | `spread` | `spread_percent` | Y | Y (`minSpread`, `maxSpread`) | Backend | Precomputed percentage |
| **Limit** | `limit` | `limit` | Y | Y (`minLimit`, `maxLimit`) | No | Direct from database |
| **Limit × Buy Price** | `max_investment` | `max_investment` | Y | Y (`minMax_investment`, `maxMax_investment`) | Backend | Precomputed: `limit * low` |
| **Limit × Profit** | `max_profit` | `max_profit` | Y | Y (`minMax_profit`, `maxMax_profit`) | Backend | Precomputed: `limit * margin` |
| **Volume (5m)** | `volume_5m` | `volume_5m` | Y | Y (`minVolume_5m`, `maxVolume_5m`) | Backend | Precomputed aggregate |
| **Volume (1h)** | `volume_1h` | `volume_1h` | Y | Y (`minVolume_1h`, `maxVolume_1h`) | Backend | Precomputed aggregate |
| **Volume (6h)** | `volume_6h` | `volume_6h` | Y | Y (`minVolume_6h`, `maxVolume_6h`) | Backend | Precomputed aggregate |
| **Volume (24h)** | `volume_24h` | `volume_24h` | Y | Y (`minVolume_24h`, `maxVolume_24h`) | Backend | Precomputed aggregate |
| **Volume (7d)** | `volume_7d` | `volume_7d` | Y | Y (`minVolume_7d`, `maxVolume_7d`) | Backend | Precomputed aggregate |
| **Turnover (5m)** | `turnover_5m` | `turnover_5m` | Y | Y (`minTurnover_5m`, `maxTurnover_5m`) | Backend | Precomputed: sum of price × volume |
| **Turnover (1h)** | `turnover_1h` | `turnover_1h` | Y | Y (`minTurnover_1h`, `maxTurnover_1h`) | Backend | Precomputed: sum of price × volume |
| **Turnover (6h)** | `turnover_6h` | `turnover_6h` | Y | Y (`minTurnover_6h`, `maxTurnover_6h`) | Backend | Precomputed: sum of price × volume |
| **Turnover (24h)** | `turnover_24h` | `turnover_24h` | Y | Y (`minTurnover_24h`, `maxTurnover_24h`) | Backend | Precomputed: sum of price × volume |
| **Turnover (7d)** | `turnover_7d` | `turnover_7d` | Y | Y (`minTurnover_7d`, `maxTurnover_7d`) | Backend | Precomputed: sum of price × volume |
| **Turnover (1m)** | `turnover_1m` | `turnover_1m` | Y | Y (`minTurnover_1m`, `maxTurnover_1m`) | Backend | Precomputed: sum of price × volume |
| **Trend (5m)** | `trend_5m` | `trend_5m` | Y | Y (`minTrend_5m`, `maxTrend_5m`) | Backend | Precomputed price change % |
| **Trend (1h)** | `trend_1h` | `trend_1h` | Y | Y (`minTrend_1h`, `maxTrend_1h`) | Backend | Precomputed price change % |
| **Trend (6h)** | `trend_6h` | `trend_6h` | Y | Y (`minTrend_6h`, `maxTrend_6h`) | Backend | Precomputed price change % |
| **Trend (24h)** | `trend_24h` | `trend_24h` | Y | Y (`minTrend_24h`, `maxTrend_24h`) | Backend | Precomputed price change % |
| **Trend (1w)** | `trend_1w` | `trend_1w` | Y | Y (`minTrend_1w`, `maxTrend_1w`) | Backend | Precomputed price change % |
| **Trend (1m)** | `trend_1m` | `trend_1m` | Y | Y (`minTrend_1m`, `maxTrend_1m`) | Backend | Precomputed price change % |
| **Buy/Sell Rate (5m)** | `buy_sell_rate_5m` | `buy_sell_rate_5m` | Y | Y (`minBuy_sell_rate_5m`, `maxBuy_sell_rate_5m`) | Backend | Precomputed ratio |
| **Buy/Sell Rate (1h)** | `buy_sell_rate_1h` | `buy_sell_rate_1h` | Y | Y (`minBuy_sell_rate_1h`, `maxBuy_sell_rate_1h`) | Backend | Precomputed ratio |

### Frontend Display Logic

**Location**: `osrs-flipper-pro/src/components/BrowseTableRow.jsx`

#### Formatting Functions (from `utils/formatting.js`):
- **Price columns** (`buy_price`, `sell_price`): `formatPriceFull()` - shows full price with commas
- **ROI/Trend columns**: `formatRoi()` - shows percentage with +/- sign and color
- **Margin/Max Profit**: `formatColoredNumber()` - shows number with color coding
- **Time columns**: `timeAgo()` - shows relative time (e.g., "2h ago")
- **Other numeric**: `formatCompact()` - shows compact number format

#### Visual Styling:
- **Primary columns** (buy_price, sell_price, margin, roi): Bold, high contrast
- **Secondary columns** (spread, limit, turnover_1h, turnover_24h): Dimmed text
- **Momentum colors** (row background): Based on `trend_1h` and `trend_24h`:
  - Both positive → bright green
  - Both negative → red
  - Mixed → yellow
  - Flat/null → grey

#### Sparkline:
- **Data source**: `item.sparkline` array (embedded in production)
- **Fallback**: Individual fetch from `/api/prices/sparkline/:itemId?days=7` if not embedded
- **Color**: Determined by momentum class (trend_1h + trend_24h)
- **Rendering**: SVG polyline with gaps for missing data points

---

## 3️⃣ Column Enable / Disable System

### Configuration Source
- **File**: `osrs-flipper-pro/src/constants/column.js`
- **Export**: `allColumns` array
- **Structure**: Each column has:
  ```javascript
  {
    id: "column_id",        // Maps to API field name
    label: "Display Name",  // Human-readable label
    visible: true/false,    // Default visibility
    category: "Category"    // For grouping in UI
  }
  ```

### Default Visibility
**Default ON** (visible: true):
- `buy_price`
- `sell_price`
- `margin`
- `roi`
- `limit`

**Default OFF** (visible: false):
- All volume columns
- All turnover columns
- All trend columns
- All buy/sell rate columns
- `spread`, `max_profit`, `max_investment`

### Storage
- **Location**: `localStorage`
- **Key**: `"osrs-flipper-column-settings"`
- **Format**: JSON array of column objects with `visible` property
- **Persistence**: Saved automatically when user toggles columns
- **Merge logic**: On load, merges saved settings with `allColumns` to handle new columns

### User Interface
- **Component**: `ColumnPicker` (`osrs-flipper-pro/src/components/ColumnPicker.jsx`)
- **Access**: "Add Columns" button on Browse Items page
- **Features**:
  - Checkbox for each column
  - Grouped by category
  - "Reset to Defaults" button
  - Import/Export functionality

---

## 4️⃣ Sorting System

### Sortable Columns
All columns listed in the table above with "Sortable? = Y" can be sorted.

### Sorting Implementation
- **Type**: **Backend SQL-based** (NOT frontend)
- **Location**: `routes/browse.js` lines 21-48
- **SQL**: `ORDER BY ${resolvedSort} ${sortOrder} NULLS LAST`

### Sort Column Mapping
Frontend column IDs are mapped to database columns:
```javascript
{
  buy_price: "low",
  sell_price: "high",
  buy_time: "low_timestamp",
  sell_time: "high_timestamp",
  roi: "roi_percent",
  spread: "spread_percent"
}
```

### Valid Sort Columns (Database)
- `margin`, `roi_percent`, `spread_percent`
- `high`, `low`, `high_timestamp`, `low_timestamp`
- `max_profit`, `max_investment`
- `limit`
- `volume_5m`, `volume_1h`, `volume_6h`, `volume_24h`, `volume_7d`
- `turnover_5m`, `turnover_1h`, `turnover_6h`, `turnover_24h`, `turnover_7d`, `turnover_1m`
- `buy_sell_rate_5m`, `buy_sell_rate_1h`
- `trend_5m`, `trend_1h`, `trend_6h`, `trend_24h`, `trend_1w`, `trend_1m`

### Sort Values
- **Raw database values**: Sorting uses the exact database column values
- **No normalization**: Values are sorted as stored (numeric columns sorted numerically)
- **NULL handling**: `NULLS LAST` ensures null values appear at the end

### Frontend Interaction
- **Trigger**: Click on column header
- **Toggle**: Clicking same column toggles ASC/DESC
- **Default**: "margin" DESC
- **URL state**: Sort state stored in URL query params (`sortBy`, `order`)

---

## 5️⃣ Filtering System

### Filterable Fields
All columns with "Filterable? = Y" in the table above can be filtered.

### Filter Implementation
- **Type**: **Backend SQL-based** (NOT frontend)
- **Location**: `routes/browse.js` lines 50-136
- **SQL**: WHERE clauses added to main query

### Filter Mapping
Query parameters are mapped to database columns:
```javascript
{
  minMargin: "margin",
  maxMargin: "margin",
  minRoi: "roi_percent",
  maxRoi: "roi_percent",
  minBuyPrice: "low",
  maxBuyPrice: "low",
  minSellPrice: "high",
  maxSellPrice: "high",
  minVolume_5m: "volume_5m",
  maxVolume_5m: "volume_5m",
  // ... (all volume, turnover, trend, buy_sell_rate columns)
  minLimit: "limit",
  maxLimit: "limit",
  members: "members"  // Boolean filter
}
```

### Filter Types
1. **Range filters** (min/max):
   - Price ranges (buy_price, sell_price)
   - Volume ranges (all time periods)
   - Turnover ranges (all time periods)
   - ROI, Margin, Spread ranges
   - Trend ranges (all time periods)
   - Limit range
   - Max Profit, Max Investment ranges

2. **Boolean filters**:
   - `members` (true/false)

3. **Text search**:
   - `search` parameter filters by item name (case-insensitive LIKE)

### Filter Application
- **SQL WHERE clauses**: Each filter adds a condition:
  - `min*` → `column >= value`
  - `max*` → `column <= value`
  - `members` → `members = true/false`
  - `search` → `LOWER(name) LIKE '%search%'`

### Storage
- **Location**: `localStorage`
- **Key**: `"osrs-flipper-filters"`
- **Format**: JSON object with filter keys and values
- **Persistence**: Saved automatically when filters change

### User Interface
- **Component**: `FilterBuilder` (`osrs-flipper-pro/src/components/FilterBuilder.jsx`)
- **Access**: "Add Filters" button on Browse Items page
- **Features**:
  - Min/Max inputs for each filterable column
  - Grouped by category
  - "Clear All Filters" button
  - Import/Export functionality
  - Human-readable number parsing (e.g., "1.5k" → 1500)

### Filter Interaction with Search
- **Search from SearchBar**: When search originates from top SearchBar, filters are ignored (filterless search)
- **Browse page search**: When typing in Browse page search input, filters are applied

---

## 6️⃣ Performance & Scaling

### Current Architecture
- **Single table query**: All data from `canonical_items` (no JOINs)
- **Precomputed columns**: All aggregates and metrics are precomputed
- **Pagination**: 50 items per page (configurable via `pageSize`)
- **Indexed sorting**: SQL ORDER BY on indexed columns
- **SQL filtering**: WHERE clauses applied at database level

### API Request Count
- **Browse page**: **1 request** (`/api/items/browse`)
  - Includes embedded sparkline data in production
  - Fallback: 1 + N requests (1 browse + N sparkline requests) if sparklines not embedded

### Rendering Performance
- **React.memo**: `BrowseTableRow` is memoized to prevent unnecessary re-renders
- **Virtual scrolling**: Not implemented (all visible rows rendered)
- **Estimated bottleneck**: ~100-200 rows before noticeable slowdown

### Sorting Performance
- **Database-level**: Sorting happens in PostgreSQL
- **Indexed columns**: Should be fast for all sortable columns
- **Estimated bottleneck**: ~10,000+ items before noticeable slowdown (depends on indexes)

### API Response Size
- **Per item**: ~2-3 KB (with embedded sparkline data)
- **Per page (50 items)**: ~100-150 KB
- **Estimated bottleneck**: ~500 KB per page (100+ items) before noticeable slowdown

### Current Bottlenecks
1. **Row rendering**: No virtual scrolling - all rows rendered at once
2. **Sparkline rendering**: SVG generation for each row (mitigated by React.memo)
3. **Large result sets**: No limit on total items (only pagination)

### Recommendations
1. **Virtual scrolling**: Implement for 200+ visible rows
2. **Response compression**: Enable gzip compression for API responses
3. **Column lazy loading**: Only render visible columns (currently all columns rendered, visibility controlled by CSS)
4. **Sparkline optimization**: Consider canvas-based rendering for large tables

---

## 7️⃣ Architecture Pipeline

### Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         DATABASE LAYER                           │
│                                                                   │
│  canonical_items table (PostgreSQL)                              │
│  ├─ Precomputed columns: margin, roi_percent, spread_percent    │
│  ├─ Precomputed aggregates: volume_*, turnover_*, trend_*       │
│  ├─ Latest prices: high, low, high_timestamp, low_timestamp    │
│  └─ Item metadata: name, icon, members, limit                    │
│                                                                   │
│  (Separate table for sparkline data - embedded via JOIN in      │
│   production, fetched separately in development)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API LAYER                                │
│                                                                   │
│  GET /api/items/browse                                           │
│  ├─ Query params: page, pageSize, sortBy, order, search, filters│
│  ├─ Build SQL WHERE clause from filters                          │
│  ├─ Build SQL ORDER BY from sortBy/order                         │
│  ├─ Execute COUNT query for pagination                           │
│  ├─ Execute SELECT query with LIMIT/OFFSET                        │
│  └─ Return: { items: [...], totalPages, totalRows }            │
│                                                                   │
│  (Production: Includes sparkline data embedded)                  │
│  (Development: Sparklines fetched separately)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND PROCESSING                         │
│                                                                   │
│  BrowseItemsPage.jsx                                            │
│  ├─ Load column settings from localStorage                       │
│  ├─ Load filters from localStorage                               │
│  ├─ Build API request with query params                          │
│  ├─ Fetch data from /api/items/browse                           │
│  └─ Pass items to BrowseTable                                    │
│                                                                   │
│  BrowseTable.jsx                                                │
│  ├─ Filter visible columns based on columnSettings               │
│  ├─ Render table header with sort indicators                     │
│  └─ Map items to BrowseTableRow components                       │
│                                                                   │
│  BrowseTableRow.jsx                                             │
│  ├─ Extract item data (name, icon, prices, metrics)             │
│  ├─ Format values using formatting utils                        │
│  ├─ Determine momentum color from trend_1h/trend_24h             │
│  ├─ Render sparkline (use embedded or fetch separately)          │
│  └─ Apply visual styling (primary/secondary columns)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DISPLAY LAYER                            │
│                                                                   │
│  HTML Table                                                      │
│  ├─ Header row: Item, 7d, + visible columns                    │
│  ├─ Data rows: One per item                                      │
│  │   ├─ Item cell: Icon + Name (link)                           │
│  │   ├─ Sparkline cell: SVG graph                               │
│  │   └─ Metric cells: Formatted values with colors              │
│  └─ Pagination controls                                          │
│                                                                   │
│  User Interactions:                                              │
│  ├─ Column header click → Update URL params → Re-fetch          │
│  ├─ Filter change → Update localStorage → Re-fetch              │
│  ├─ Column toggle → Update localStorage → Re-render             │
│  └─ Page change → Update URL params → Re-fetch                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Single Source of Truth**: All data from `canonical_items` table (no mixing sources)
2. **Precomputed Aggregates**: All volume, turnover, trend calculations done offline
3. **Backend Sorting/Filtering**: Reduces data transfer and frontend processing
4. **URL State Management**: Sort/page state in URL for shareability
5. **localStorage Persistence**: Column visibility and filters persist across sessions
6. **Embedded Sparklines**: Production includes sparkline data to reduce requests

---

## Summary

- **Data Source**: Single `canonical_items` table with precomputed columns
- **API**: One endpoint (`/api/items/browse`) returns all row data
- **Sorting**: Backend SQL-based on all numeric/date columns
- **Filtering**: Backend SQL-based with min/max ranges for all metrics
- **Columns**: 40+ available columns, 5 default visible, user-configurable
- **Performance**: Optimized for 50-200 items per page, scales to 1000+ with pagination
- **Sparklines**: Embedded in production (1 request), separate in development (1 + N requests)

