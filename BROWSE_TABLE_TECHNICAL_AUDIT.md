# 📊 Browse Items Table - Technical Audit Report

## 1️⃣ Data Source & Flow

### API Endpoint
- **Endpoint**: `GET /api/items/browse`
- **Location**: `routes/browse.js`
- **Data Source**: `canonical_items` table (PostgreSQL)

### Row Data Fields - Source Breakdown

#### **Buy Price** (`buy_price`)
- **Source**: `canonical_items.low` (aliased as `buy_price`)
- **Origin**: `price_instants` table (type='low')
- **Computation**: **From latest** - Direct from API via `poll-latest.js`
- **Update Frequency**: Every 15 seconds (see Section 2)

#### **Sell Price** (`sell_price`)
- **Source**: `canonical_items.high` (aliased as `sell_price`)
- **Origin**: `price_instants` table (type='high')
- **Computation**: **From latest** - Direct from API via `poll-latest.js`
- **Update Frequency**: Every 15 seconds

#### **Margin** (`margin`)
- **Source**: `canonical_items.margin`
- **Computation**: **Computed in backend** - `high - tax - low`
- **Formula**: `margin = high - (high * 0.02) - low` (2% tax, rounded down)
- **Update Frequency**: Recalculated on canonical update (see Section 2)

#### **ROI** (`roi`)
- **Source**: `canonical_items.roi_percent` (aliased as `roi`)
- **Computation**: **Computed in backend** - `(margin * 100) / low`
- **Update Frequency**: Recalculated on canonical update

#### **Spread** (`spread`)
- **Source**: `canonical_items.spread_percent` (aliased as `spread`)
- **Computation**: **Computed in backend** - Percentage difference between high and low
- **Update Frequency**: Recalculated on canonical update

#### **Limit** (`limit`)
- **Source**: `canonical_items.limit`
- **Origin**: Static from `items` table
- **Computation**: **Static** - Item metadata
- **Update Frequency**: Never changes (item property)

#### **Turnover (1h)** (`turnover_1h`)
- **Source**: `canonical_items.turnover_1h`
- **Computation**: **Computed in backend** - `average_price × volume_1h`
- **Origin**: Aggregated from `price_5m` table
- **Update Frequency**: Recalculated on canonical update (derived from 5m aggregations)

#### **Turnover (24h)** (`turnover_24h`)
- **Source**: `canonical_items.turnover_24h`
- **Computation**: **Computed in backend** - `average_price × volume_24h`
- **Origin**: Aggregated from `price_5m` and `price_1h` tables
- **Update Frequency**: Recalculated on canonical update

### Data Flow Summary

```
OSRS API (every 15s)
    ↓
price_instants table (latest high/low)
    ↓
dirty_items queue (marks items needing update)
    ↓
update-canonical-items.js (processes dirty queue)
    ↓
canonical_items table (precomputed aggregations)
    ↓
/api/items/browse endpoint
    ↓
BrowseItemsPage.jsx (fetches via useEffect)
    ↓
BrowseTable.jsx (renders rows)
```

---

## 2️⃣ Update Frequency

### Polling Mechanism

#### **Latest Prices (Buy/Sell)**
- **Frequency**: Every **15 seconds**
- **Type**: **Pull-based (interval)**
- **Script**: `poller/poll-latest.js`
- **Trigger**: Scheduler runs at `seconds % 15 === 0`
- **Source**: Direct from OSRS API `/latest` endpoint
- **Storage**: `price_instants` table

#### **Canonical Items Table**
- **Frequency**: **Dynamic** (15-60 seconds based on dirty queue size)
  - 0 dirty items: Every 60s
  - ≤200 dirty items: Every 30s
  - ≤1000 dirty items: Every 15s
  - >1000 dirty items: Every 30s (throttled to prevent overload)
- **Type**: **Pull-based (interval)** with dynamic frequency
- **Script**: `poller/update-canonical-items.js`
- **Trigger**: 
  1. Immediately after `poll-latest.js` completes
  2. Periodic check based on dirty queue size
- **Process**: Processes `dirty_items` queue in batches (25-600 items per batch)

#### **Aggregated Data (Volume, Turnover, Trends)**
- **Frequency**: Recalculated during canonical update
- **Type**: **Derived from aggregations**
- **Source Tables**:
  - `price_5m` - 5-minute OHLC candles
  - `price_1h` - 1-hour OHLC candles
  - `price_6h` - 6-hour OHLC candles
  - `price_24h` - 24-hour OHLC candles

### Column-Specific Update Frequencies

| Column | Update Frequency | Source | Computation |
|--------|-----------------|--------|-------------|
| `buy_price` / `sell_price` | Every 15s | `price_instants` | From latest |
| `buy_time` / `sell_time` | Every 15s | `price_instants` | From latest |
| `margin` | Every 15-60s | Computed | `high - tax - low` |
| `roi` | Every 15-60s | Computed | `(margin * 100) / low` |
| `spread` | Every 15-60s | Computed | Percentage difference |
| `volume_5m` | Every 15-60s | `price_5m` aggregation | Sum of volumes |
| `volume_1h` | Every 15-60s | `price_5m` aggregation | Sum of volumes |
| `volume_24h` | Every 15-60s | `price_5m` + `price_1h` | Sum of volumes |
| `turnover_1h` | Every 15-60s | Computed | `avg_price × volume_1h` |
| `turnover_24h` | Every 15-60s | Computed | `avg_price × volume_24h` |
| `trend_5m` | Every 15-60s | `price_5m` | Percentage change |
| `trend_1h` | Every 15-60s | `price_5m` | Percentage change |
| `trend_24h` | Every 15-60s | `price_5m` + `price_1h` | Percentage change |
| `trend_7d` | Every 15-60s | `price_1h` | Percentage change over 7 days |

---

## 3️⃣ Trend / Mini-Graph Feasibility

### Historical Data Storage

#### **Available Time-Series Tables**

1. **`price_5m`** - 5-minute OHLC candles
   - Columns: `item_id`, `timestamp`, `high`, `low`, `avg_high`, `avg_low`, `volume`
   - **Retention**: ~7 days of data (168 candles)
   - **Suitable for**: 7-day sparklines with 5m granularity

2. **`price_1h`** - 1-hour OHLC candles
   - Columns: `item_id`, `timestamp`, `high`, `low`, `avg_high`, `avg_low`, `volume`
   - **Retention**: ~30+ days of data
   - **Suitable for**: 7-day sparklines with 1h granularity (168 points)

3. **`price_instants`** - Latest prices only
   - **Not suitable** for historical trends (only current snapshot)

4. **`price_instant_log`** - Historical instant prices (if exists)
   - **Unknown retention** - needs verification

### 7-Day Trend Line Feasibility

✅ **YES - Feasible**

**Recommended Approach**:
- Use `price_1h` table for 7-day sparklines
- Query: `SELECT timestamp, avg_high, avg_low FROM price_1h WHERE item_id = ? AND timestamp >= (NOW() - INTERVAL '7 days') ORDER BY timestamp ASC`
- **Data Points**: ~168 points (7 days × 24 hours)
- **Granularity**: 1-hour intervals (smooth enough for sparklines)

**Alternative (Higher Resolution)**:
- Use `price_5m` table for 7-day sparklines
- Query: `SELECT timestamp, avg_high, avg_low FROM price_5m WHERE item_id = ? AND timestamp >= (NOW() - INTERVAL '7 days') ORDER BY timestamp ASC`
- **Data Points**: ~2,016 points (7 days × 24 hours × 12 five-minute intervals)
- **Granularity**: 5-minute intervals (more detailed, but heavier)

### Sparkline Data Endpoint

**Current Status**: ❌ **No dedicated endpoint exists**

**Recommendation**: Create new endpoint:
- `GET /api/prices/sparkline/:itemId?days=7`
- Returns: `{ timestamps: number[], prices: number[] }`
- Cache for 1-5 minutes (data doesn't change frequently)

---

## 4️⃣ Frontend Architecture

### Component Hierarchy

```
App.js
  └─ BrowseItemsPage.jsx (Page Component)
       ├─ ColumnPicker.jsx (Column visibility)
       ├─ FilterBuilder.jsx (Filter UI)
       └─ BrowseTable.jsx (Table Component)
            └─ <tr> elements (Row Components - inline)
```

### Row Rendering

- **Component**: `BrowseTable.jsx` - Renders rows inline (no separate Row component)
- **Virtualization**: ❌ **No virtualization** - All rows rendered in DOM
- **Current Row Count**: 50 rows per page (configurable via `pageSize`)

### State Management

#### **BrowseItemsPage.jsx**
- **State Type**: **Controlled component** (URL params as source of truth)
- **State Sources**:
  - `useSearchParams()` - Sort, order, page, search query
  - `useState()` - Items array, loading, filters, column settings
  - `localStorage` - Persisted filters and column visibility

#### **Data Fetching**
- **Trigger**: `useEffect` with dependencies: `[searchQuery, sortBy, order, filters, currentPage, isSearchFromSearchBar]`
- **Method**: `apiFetchJson()` - Wrapper around `fetch()`
- **Abort**: Uses `AbortController` for cleanup

#### **Memoization**
- ❌ **No memoization** - No `useMemo` or `React.memo` used
- **Re-render Triggers**:
  - URL param changes
  - Filter changes
  - Column visibility changes
  - Loading state changes

### Table Rendering Details

**BrowseTable.jsx**:
- Uses native `<table>` element
- Inline styles (no CSS modules)
- Row click handler for navigation
- Conditional rendering based on column type
- Formatting functions: `formatPriceFull`, `formatColoredNumber`, `formatRoi`, `formatCompact`

---

## 5️⃣ Performance Safeguards

### Current Performance Metrics

#### **Row Count**
- **Average Rendered**: 50 rows per page (default `pageSize: 50`)
- **Maximum**: Configurable, but typically 50-100 rows visible

#### **Render Cost**
- **No virtualization**: All 50 rows rendered in DOM simultaneously
- **Re-render Frequency**: On every filter/sort/page change
- **Estimated DOM Nodes**: ~50 rows × ~10-15 columns = 500-750 DOM nodes per page

#### **Current Optimizations**
- ✅ AbortController for request cancellation
- ✅ Pagination (limits rendered rows)
- ✅ URL-based state (shareable/bookmarkable)
- ❌ No React.memo on rows
- ❌ No useMemo for expensive computations
- ❌ No virtualization

### Sparkline Implementation Recommendations

#### **Option 1: SVG (Recommended)**
- **Pros**: 
  - Lightweight (~1-2KB per sparkline)
  - Scalable (vector)
  - Easy to style with CSS
  - Good browser support
- **Cons**: 
  - Slight overhead per row
- **Performance Impact**: ~50 SVGs = ~50-100KB total
- **Render Cost**: Low (SVG is efficient)

#### **Option 2: Canvas**
- **Pros**: 
  - Very performant for many charts
  - Single canvas can render all sparklines
- **Cons**: 
  - More complex implementation
  - Harder to style
  - Requires manual coordinate management
- **Performance Impact**: Minimal (single canvas element)
- **Render Cost**: Very low (batched rendering)

#### **Option 3: Lightweight Chart Library**
- **Libraries**: `recharts-sparkline`, `victory-sparkline`, `react-sparklines`
- **Pros**: 
  - Easy to implement
  - Pre-built features
- **Cons**: 
  - Bundle size increase (~10-50KB)
  - May be overkill for simple lines
- **Performance Impact**: Moderate (library overhead)

### Recommended Approach

**For 7-Day Sparklines**:

1. **Use SVG** (per-row sparkline)
   - Create `<Sparkline>` component
   - Accept `data: { timestamp: number, price: number }[]`
   - Render simple `<path>` element
   - Memoize with `React.memo` to prevent unnecessary re-renders

2. **Data Fetching Strategy**:
   - **Option A**: Fetch sparkline data with browse endpoint (add to response)
     - Pros: Single request, no additional latency
     - Cons: Larger response payload (~50KB for 50 items)
   - **Option B**: Lazy load on row hover/visible
     - Pros: Smaller initial payload
     - Cons: Additional requests, slight delay

3. **Performance Optimizations**:
   - ✅ Memoize sparkline component: `React.memo(Sparkline)`
   - ✅ Memoize sparkline data: `useMemo(() => processSparklineData(raw), [raw])`
   - ✅ Consider virtualization if row count increases: `react-window` or `react-virtualized`
   - ✅ Debounce sparkline data fetching if lazy loading

### Estimated Performance Impact

**With SVG Sparklines (50 rows)**:
- **Additional DOM Nodes**: ~50 SVG elements (~1-2KB each)
- **Total Size**: ~50-100KB
- **Render Time**: +5-10ms (negligible)
- **Memory**: +~100KB

**Risk Assessment**: ✅ **Low Risk** - SVG sparklines are lightweight and won't significantly impact performance at 50 rows/page.

---

## 6️⃣ Summary & Recommendations

### Key Findings

1. **Data Source**: All data comes from `canonical_items` table (precomputed)
2. **Update Frequency**: Latest prices every 15s, aggregations every 15-60s
3. **Historical Data**: ✅ Available in `price_5m` and `price_1h` tables
4. **Frontend**: No virtualization, 50 rows/page, no memoization
5. **Performance**: Current setup can handle sparklines without issues

### Recommendations for Dark Crypto-Style Redesign

1. **Sparkline Implementation**:
   - Use SVG per-row sparklines
   - Fetch data from `price_1h` table (7 days = 168 points)
   - Create new endpoint: `/api/prices/sparkline/:itemId?days=7`
   - Memoize sparkline components

2. **Performance Optimizations**:
   - Add `React.memo` to row rendering
   - Consider `react-window` if row count increases beyond 100
   - Memoize expensive formatting functions

3. **Dark Theme**:
   - Update CSS in `browse.css`
   - Use CSS variables for theming
   - Ensure sparklines use theme colors

4. **Dense Layout**:
   - Reduce padding in `tdStyle` (currently `14px 16px`)
   - Reduce font size (currently `16px`)
   - Compact row height

5. **Color-Coded Momentum**:
   - Use `trend_24h` or `trend_7d` for color coding
   - Green = positive trend, Red = negative trend
   - Apply to row background or sparkline color

### Next Steps

1. ✅ Create sparkline data endpoint
2. ✅ Build `<Sparkline>` component
3. ✅ Integrate into `BrowseTable.jsx`
4. ✅ Apply dark theme styling
5. ✅ Add performance optimizations (memoization)
6. ✅ Test with 50+ rows

---

**Report Generated**: Technical audit of Browse Items table system
**Status**: Ready for dark crypto-style redesign implementation


