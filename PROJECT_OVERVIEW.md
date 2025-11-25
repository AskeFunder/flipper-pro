# OSRS FlipperPro - Project Overview & MVP Status

## 🎯 Project Description
A comprehensive OSRS (Old School RuneScape) item flipping tool that tracks real-time prices, calculates profit margins, and helps players identify profitable trading opportunities.

---

## ✅ IMPLEMENTED FEATURES

### 🗄️ **Backend Infrastructure**

#### **Database Schema** (PostgreSQL)
- ✅ `items` table - 4,500+ items with metadata (id, name, members, examine, limit, value, highalch, lowalch, icon)
- ✅ `price_instants` table - Real-time buy/sell prices (updated every 15 seconds)
- ✅ `price_instant_log` table - Historical log of all price updates
- ✅ `price_5m` table - 5-minute aggregated price data (24h retention)
- ✅ `price_1h` table - 1-hour aggregated price data (7d retention)
- ✅ `price_6h` table - 6-hour aggregated price data (30d retention)
- ✅ `price_24h` table - 24-hour aggregated price data (365d retention)

#### **Data Polling System**
- ✅ **Scheduler** (`poller/scheduler.js`) - Orchestrates all polling tasks
- ✅ **Latest Price Poller** (`poller/poll-latest.js`) - Polls `/latest` every 15 seconds
- ✅ **Granularity Poller** (`poller/poll-granularities.js`) - Polls 5m/1h/6h/24h endpoints
  - 5m: Every 5 minutes at :30 seconds
  - 1h: Every hour at :00:30
  - 6h: Every 6 hours at :00:30
  - 24h: Daily at 02:00:30
- ✅ **Backfill System** (`poller/backfill-timeseries.js`) - Fills missing historical data
  - 5m: Every 5 minutes at :02
  - 1h: Every 2 hours at :02:00
  - 6h: Every 6 hours at :02:00
  - 24h: Daily at 02:02:00
- ✅ **Cleanup System** (`poller/cleanup-timeseries.js`) - Removes old data beyond retention
- ✅ **Lock System** (`poller/lock-utils.js`) - Prevents conflicts between backfills and polls
- ✅ **Item Mappings** (`scripts/fetch-item-mappings.js`) - Fetches all OSRS items from API

#### **API Endpoints**

**Items API** (`/api/items`)
- ✅ `GET /api/items/latest-table` - Browse/search items with advanced filtering
  - Pagination (page, pageSize)
  - Sorting (any column, asc/desc)
  - Search by item name
  - Dynamic column selection
  - Advanced filters (min/max for all numeric columns)

**Prices API** (`/api/prices`)
- ✅ `GET /api/prices/latest/:id` - Latest price data for single item
  - Returns: high, low, margin, roi, timestamps, trends (5m, 1h, 6h, 24h, 7d, 1m)
- ✅ `GET /api/prices/latest?ids=1,2,3` - Batch latest prices for multiple items
- ✅ `GET /api/prices/chart/:granularity/:id` - Historical price chart data
  - Granularities: 5m, 1h, 6h, 24h, 4h (from instant log)
  - Returns: [{ ts, high, low }]
- ✅ `GET /api/prices/recent/:id` - Last 20 recent trades for an item
  - Returns: [{ ts, type: 'buy'|'sell', price }]

#### **Query System**
- ✅ **Dynamic Column Selection** (`queries/selectColumns.js`) - Builds SELECT clauses based on requested columns
- ✅ **Dynamic JOINs** (`queries/buildJoins.js`) - Automatically joins tables based on requested columns/filters
- ✅ **Advanced Filtering** (`queries/buildFilters.js`) - Supports min/max filters for all numeric columns
- ✅ **Column Config** (`queries/columnConfig/`) - Centralized column definitions
  - Core: buy_price, sell_price, margin, roi, spread, limit
  - Volume: volume_5m, volume_1h, volume_6h, volume_24h, volume_7d
  - Turnover: turnover_5m, turnover_1h, turnover_6h, turnover_24h, turnover_7d, turnover_1m
  - Trend: trend_5m, trend_1h, trend_6h, trend_24h, trend_7d, trend_1m
  - Buy/Sell Rate: buy_sell_rate_5m, buy_sell_rate_1h, buy_sell_rate_6h, buy_sell_rate_24h, buy_sell_rate_7d

### 🎨 **Frontend Features**

#### **Navigation & Layout**
- ✅ Sidebar navigation with 7 menu items
- ✅ Dark theme sidebar (#1e1e1e)
- ✅ Responsive layout

#### **Pages**

**1. Oathplate Dashboard** (`components/OathplateDashboard.js`) ✅
- ✅ Hardcoded dashboard for "Oathplate Shard" (item ID: 30765)
- ✅ Real-time price display (buy/sell)
- ✅ Price chart with multiple time ranges (4H, 12H, 1D, 1W, 1M, 3M, 1Y, All)
- ✅ Component tracking (Shale, Chest, Helm, Legs)
- ✅ Profit calculation for oathplate parts
- ✅ Recent trades table (last 20)
- ✅ Auto-refresh every 15 seconds

**2. Browse Items Page** (`pages/BrowseItemsPage.jsx`) ✅
- ✅ Search by item name
- ✅ Sortable table (any column, asc/desc)
- ✅ Column picker - Show/hide columns dynamically
- ✅ Filter builder - Add min/max filters for any numeric column
- ✅ Pagination (50 items per page)
- ✅ Loading states with shimmer effect
- ✅ Item icons from OSRS wiki
- ✅ Available columns:
  - Core: Buy Price, Sell Price, Margin, ROI%, Spread%, Limit
  - Volume: 5m, 1h, 6h, 24h, 7d
  - Turnover: 5m, 1h, 6h, 24h, 7d, 1m
  - Trend: 5m, 1h, 6h, 24h, 7d, 1m
  - Buy/Sell Rate: 5m, 1h, 6h, 24h, 7d

**3. Method Calculators** ❌
- ❌ Placeholder only - "coming soon"

**4. Day Trading Mode** ❌
- ❌ Placeholder only - "coming soon"

**5. Favorites** ❌
- ❌ Placeholder only - "coming soon"

**6. Settings** ❌
- ❌ Placeholder only - "coming soon"

**7. Changelog** ❌
- ❌ Placeholder only - "coming soon"

#### **Components**
- ✅ `BrowseTable` - Main data table with sorting, formatting
- ✅ `ColumnPicker` - Modal to show/hide columns
- ✅ `FilterBuilder` - Modal to add/remove filters
- ✅ `ShimmerRow` - Loading skeleton component
- ✅ `ItemTable` - (Legacy component, may not be used)

#### **Utilities**
- ✅ `formatting.js` - Number/price formatting utilities
  - formatCompact, formatPriceFull, formatColoredNumber, formatRoi, timeAgo, parseHumanNumber

### 🛠️ **DevOps & Setup**
- ✅ Root `package.json` with `npm run dev` - Runs all services concurrently
- ✅ Backend `package.json` with start/scheduler scripts
- ✅ Frontend `package.json` with React scripts
- ✅ PostgreSQL database setup
- ✅ Environment variable support (.env)
- ✅ Lock file system to prevent polling conflicts
- ✅ Error handling and logging

---

## ❌ MISSING FEATURES (MVP Requirements)

### 🔴 **Critical for MVP**

#### **1. General Item Dashboard** (Not just Oathplate)
- ❌ Make dashboard dynamic - allow selecting any item
- ❌ Item search/selector in dashboard
- ❌ Save selected item to favorites/localStorage
- ❌ Multiple item comparison view

#### **2. Method Calculators**
- ❌ Implement profit calculators for:
  - High Alchemy profit calculator
  - Disassembly/component calculators
  - Crafting profit calculators
  - Other common flipping methods

#### **3. Favorites System**
- ❌ Database table for user favorites (or localStorage)
- ❌ Add/remove favorites from browse page
- ❌ Favorites page showing all favorited items
- ❌ Quick access from sidebar

#### **4. Settings Page**
- ❌ User preferences (theme, default columns, etc.)
- ❌ API rate limiting settings
- ❌ Notification preferences
- ❌ Data refresh intervals

#### **5. Day Trading Mode**
- ❌ Real-time price alerts
- ❌ Watchlist functionality
- ❌ Price change notifications
- ❌ Quick buy/sell price tracking

### 🟡 **Nice to Have (Post-MVP)**

#### **6. Changelog**
- ❌ Version history
- ❌ Feature updates
- ❌ Bug fixes log

#### **7. Additional Features**
- ❌ Price alerts/notifications
- ❌ Historical price analysis
- ❌ Profit tracking over time
- ❌ Export data (CSV, JSON)
- ❌ User accounts/authentication
- ❌ Portfolio tracking
- ❌ Trade history logging

---

## 📊 **Data Flow**

```
OSRS Wiki API
    ↓
Scheduler (poller/scheduler.js)
    ├─→ poll-latest.js (every 15s) → price_instants, price_instant_log
    ├─→ poll-granularities.js (5m/1h/6h/24h) → price_5m, price_1h, price_6h, price_24h
    ├─→ backfill-timeseries.js (fills gaps) → price_* tables
    └─→ cleanup-timeseries.js (removes old data)
    ↓
PostgreSQL Database
    ↓
Express API (server.js)
    ├─→ /api/items/latest-table
    └─→ /api/prices/*
    ↓
React Frontend
    ├─→ BrowseItemsPage
    └─→ OathplateDashboard
```

---

## 🎯 **MVP Completion Checklist**

### Backend ✅
- [x] Database schema
- [x] Data polling system
- [x] API endpoints
- [x] Query system
- [x] Lock system

### Frontend - Core ✅
- [x] Navigation
- [x] Browse Items page
- [x] Oathplate Dashboard (hardcoded)

### Frontend - MVP Required ❌
- [ ] **Dynamic Dashboard** - Allow selecting any item
- [ ] **Method Calculators** - At least 2-3 common calculators
- [ ] **Favorites** - Basic add/remove functionality
- [ ] **Settings** - Basic user preferences

### Frontend - Post-MVP ❌
- [ ] Day Trading Mode
- [ ] Changelog
- [ ] Advanced features

---

## 🚀 **How to Run**

```bash
# Install dependencies (first time only)
npm install
cd osrs-flipper-pro && npm install
cd ../osrs-flipper-pro-backend && npm install

# Populate items database (first time only)
cd osrs-flipper-pro-backend
node scripts/fetch-item-mappings.js

# Run everything
cd ../..
npm run dev
```

This starts:
- Backend API on http://localhost:3001
- Scheduler (polling service)
- Frontend on http://localhost:3000

---

## 📝 **Notes**

- **Oathplate Dashboard** is currently hardcoded to item ID 30765. This needs to be made dynamic.
- **Browse Items** page works but requires price data to show items (filter requires prices unless modified).
- **Lock system** prevents conflicts between backfills and polls.
- **4,500+ items** are loaded from OSRS Wiki API.
- All price data comes from `https://prices.runescape.wiki/api/v1/osrs/`

---

## 🔧 **Technical Stack**

- **Frontend**: React 19, Material-UI, Chart.js
- **Backend**: Node.js, Express, PostgreSQL
- **Data Source**: OSRS Wiki Price API
- **Polling**: Custom scheduler with lock system




