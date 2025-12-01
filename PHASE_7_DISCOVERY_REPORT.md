# Phase 7 Discovery Report: Real Data Integration

## Executive Summary

This report assesses API readiness, data contracts, performance constraints, and integration strategy for Phase 7 (Real Data Integration) of the multi-mode Browse Items system.

---

## 1️⃣ API Readiness Assessment

### ✅ **EXISTING & STABLE ENDPOINTS**

#### **GET `/api/items/browse`** ✅ **READY**
- **Status**: Fully implemented and in production use
- **Location**: `routes/browse.js`
- **Current Usage**: Already wired to `BrowseItemsPage.jsx`
- **Response Format**:
  ```json
  {
    "items": [
      {
        "id": 4151,
        "name": "Abyssal whip",
        "icon": "Abyssal whip.png",
        "members": true,
        "limit": 8,
        "buy_price": 1234567,
        "sell_price": 1234567,
        "buy_time": 1234567890,
        "sell_time": 1234567890,
        "margin": 12345,
        "roi": 1.23,
        "spread": 0.5,
        "max_profit": 98760,
        "max_investment": 9876543,
        "volume_5m": 1234,
        "volume_1h": 5678,
        "volume_6h": 12345,
        "volume_24h": 67890,
        "volume_7d": 456789,
        "turnover_5m": 12345678,
        "turnover_1h": 56789012,
        "turnover_6h": 123456789,
        "turnover_24h": 678901234,
        "turnover_7d": 4567890123,
        "turnover_1m": 12345678901,
        "buy_sell_rate_5m": 1.23,
        "buy_sell_rate_1h": 1.45,
        "trend_5m": 0.5,
        "trend_1h": 1.2,
        "trend_6h": 2.3,
        "trend_24h": 3.4,
        "trend_1w": 4.5,
        "trend_1m": 5.6
      }
    ],
    "totalPages": 10,
    "totalRows": 500
  }
  ```
- **Features**:
  - Pagination (`page`, `pageSize`)
  - Sorting (`sortBy`, `order`)
  - Search (`search` query param)
  - Filtering (min/max for all numeric fields)
  - Returns all columns in single response (no column selection needed)
  - **Sparkline data**: Currently NOT embedded (fetched separately)

#### **GET `/api/prices/sparkline/:itemId?days=7`** ✅ **READY**
- **Status**: Fully implemented
- **Location**: `routes/prices.js` (line 248-290)
- **Current Usage**: Used by `BrowseTableRow.jsx` for sparkline rendering
- **Response Format**:
  ```json
  [
    { "timestamp": 1234567890, "price": 1234567 },
    { "timestamp": 1234567891, "price": 1234568 },
    ...
  ]
  ```
- **Notes**:
  - Returns `null` for missing prices (frontend handles gaps)
  - Limited to 168 points for 7 days (24 hours × 7 days)
  - Uses `price_1h` table with `COALESCE(avg_high, avg_low)`

#### **GET `/api/prices/latest/:id`** ✅ **READY**
- **Status**: Fully implemented
- **Location**: `routes/prices.js` (line 44-105)
- **Current Usage**: Used by `ItemDetailPage.jsx`
- **Response Format**:
  ```json
  {
    "high": 1234567,
    "low": 1234567,
    "margin": 12345,
    "roi": 1.23,
    "ts": 1234567890,
    "lowTs": 1234567890,
    "trend_5m": 0.5,
    "trend_1h": 1.2,
    "trend_6h": 2.3,
    "trend_24h": 3.4,
    "trend_7d": 4.5,
    "trend_1m": 5.6
  }
  ```
- **Use Case**: Real-time price data for side panel / expanded rows

#### **GET `/api/prices/chart/:granularity/:id?since=TIMESTAMP`** ✅ **READY**
- **Status**: Fully implemented
- **Location**: `routes/prices.js` (line 165-216)
- **Current Usage**: Used by `ItemDetailPage.jsx` for Chart.js graphs
- **Supported Granularities**: `4h`, `5m`, `1h`, `6h`, `24h`
- **Response Format**:
  ```json
  [
    {
      "ts": 1234567890,
      "high": 1234567,
      "low": 1234567,
      "volume": 1234  // Only for 5m, 1h, 6h, 24h (not 4h)
    },
    ...
  ]
  ```
- **Use Case**: Chart data for expanded rows (2/3 graph) and side panel

#### **GET `/api/prices/recent/:id`** ✅ **READY**
- **Status**: Fully implemented
- **Location**: `routes/prices.js` (line 218-246)
- **Current Usage**: Used by `ItemDetailPage.jsx` for recent trades
- **Response Format**:
  ```json
  [
    { "ts": 1234567890, "type": "buy", "price": 1234567 },
    { "ts": 1234567891, "type": "sell", "price": 1234568 },
    ...
  ]
  ```
- **Notes**:
  - Returns last 20 trades
  - Type normalized: `"low"` → `"buy"`, `"high"` → `"sell"`
  - Uses `price_instant_log` table

#### **GET `/api/items/trend-details/:id`** ✅ **READY**
- **Status**: Fully implemented
- **Location**: `routes/trend-details.js` + `routes/items.js` (line 316-331)
- **Current Usage**: Used by `ItemDetailPage.jsx` for advanced trend analysis
- **Response Format**: Complex nested object with trend calculations
- **Use Case**: Advanced metrics for side panel / expanded rows

#### **GET `/api/items/canonical/:id`** ✅ **READY**
- **Status**: Fully implemented
- **Location**: `routes/items.js` (line 29-165)
- **Current Usage**: Used by `ItemDetailPage.jsx` to get item metadata
- **Response Format**: Full `canonical_items` row (id, name, icon, limit, etc.)

---

### ⚠️ **ENDPOINTS THAT NEED ENHANCEMENT**

#### **GET `/api/items/browse`** - Sparkline Embedding
- **Current State**: Returns all item data EXCEPT sparklines
- **Enhancement Needed**: Embed sparkline data in browse response
- **Rationale**: 
  - Currently: 50+ separate sparkline requests per page load
  - With embedding: 1 request for all data
  - Reduces rate limiting issues
- **Proposed Change**: Add `sparkline` array to each item in response
- **Implementation**: Backend already has `/api/prices/sparkline/:id` - can aggregate in browse query

---

### ❌ **ENDPOINTS THAT DO NOT EXIST**

#### **GET `/api/items/:id`** ❌ **DOES NOT EXIST**
- **Status**: Not found
- **Alternative**: Use `/api/items/canonical/:id` (already exists)
- **Recommendation**: Use existing canonical endpoint

#### **GET `/api/items/:id/advanced`** ❌ **DOES NOT EXIST**
- **Status**: Not found
- **Alternative**: Use `/api/items/trend-details/:id` (already exists)
- **Recommendation**: Use existing trend-details endpoint

#### **GET `/api/items/:id/timeseries`** ❌ **DOES NOT EXIST**
- **Status**: Not found
- **Alternative**: Use `/api/prices/chart/:granularity/:id` (already exists)
- **Recommendation**: Use existing chart endpoint

#### **GET `/api/items/:id/trades`** ❌ **DOES NOT EXIST**
- **Status**: Not found
- **Alternative**: Use `/api/prices/recent/:id` (already exists)
- **Recommendation**: Use existing recent endpoint

---

## 2️⃣ Data Shape & Contract Analysis

### **Browse Endpoint (`/api/items/browse`)**

#### **Field Naming Convention**
- **Frontend expects**: `buy_price`, `sell_price`, `buy_time`, `sell_time`, `roi`, `spread`
- **Backend returns**: `buy_price`, `sell_price`, `buy_time`, `sell_time`, `roi`, `spread`
- **Status**: ✅ **ALIGNED** - No mapping needed

#### **Time Granularity**
- **Timestamps**: Unix seconds (integer)
- **Time fields**: `buy_time`, `sell_time` (Unix seconds)
- **Chart data**: `ts` (Unix seconds)

#### **Volume / Turnover Resolution**
- **Available resolutions**: `5m`, `1h`, `6h`, `24h`, `7d`, `1m` (for turnover)
- **Field naming**: `volume_{resolution}`, `turnover_{resolution}`
- **Data type**: Integer (count/amount)

#### **Trade Tape Format**
- **Endpoint**: `/api/prices/recent/:id`
- **Format**: Array of `{ ts, type, price }`
- **Type values**: `"buy"` or `"sell"`
- **Limit**: 20 trades
- **Order**: DESC (newest first)

---

## 3️⃣ Performance Constraints

### **Rate Limits**
- **Current Issue**: 429 errors observed on BrowseItemsPage
- **Root Cause**: 50+ individual sparkline requests per page load
- **Mitigation**: Embed sparklines in browse response (see enhancement above)

### **Caching Strategy**
- **Frontend**: Sparkline cache implemented (5-minute TTL) in `BrowseTableRow.jsx`
- **Backend**: No explicit caching headers observed
- **Recommendation**: 
  - Add `Cache-Control` headers for static/aggregated data
  - Consider Redis caching for expensive queries (trend calculations)

### **Expected Payload Size**

#### **Browse Endpoint**
- **Per item**: ~500-800 bytes (all columns included)
- **Per page (50 items)**: ~25-40 KB
- **With sparklines (168 points × 8 bytes)**: +67 KB per item = **~3.4 MB per page**
- **⚠️ RISK**: Sparkline embedding will significantly increase payload size

#### **Chart Endpoint**
- **5m granularity (7 days)**: ~2,016 points × 24 bytes = ~48 KB
- **1h granularity (7 days)**: ~168 points × 24 bytes = ~4 KB
- **Recommendation**: Use `since` parameter to limit data range

#### **Recent Trades**
- **20 trades × 24 bytes**: ~480 bytes
- **Status**: ✅ **LOW RISK**

### **Expensive Endpoints**

#### **⚠️ `/api/items/browse`** - **MODERATE COST**
- **Complexity**: Single query with all columns from `canonical_items`
- **Performance**: Fast (precomputed table)
- **Risk**: Adding sparklines will increase query time
- **Mitigation**: 
  - Consider pagination limit (currently 50 items/page)
  - Add query timeout (currently none observed)

#### **⚠️ `/api/items/trend-details/:id`** - **HIGH COST**
- **Complexity**: Multiple queries per trend window
- **Performance**: Slow (8 trend calculations × multiple queries each)
- **Risk**: Should only be called when side panel/expanded row is visible
- **Mitigation**: ✅ Already lazy-mounted (Phase 5)

#### **✅ `/api/prices/chart/:granularity/:id`** - **LOW COST**
- **Complexity**: Single query on aggregated table
- **Performance**: Fast (indexed by item_id, timestamp)
- **Status**: ✅ **SAFE**

#### **✅ `/api/prices/recent/:id`** - **LOW COST**
- **Complexity**: Single query with LIMIT 20
- **Performance**: Fast
- **Status**: ✅ **SAFE**

---

## 4️⃣ Recommended Integration Order

### **Phase 7A: Table Rows (Foundation)** ⭐ **START HERE**
- **Priority**: **HIGHEST**
- **Endpoints**: `/api/items/browse` (already wired)
- **Enhancement**: Embed sparklines in browse response
- **Effort**: **LOW** (mostly backend change)
- **Risk**: **LOW**
- **Impact**: **HIGH** (eliminates 50+ requests per page)

### **Phase 7B: Side Panel - Basic Data**
- **Priority**: **HIGH**
- **Endpoints**: 
  - `/api/prices/latest/:id` (real-time prices)
  - `/api/items/canonical/:id` (item metadata)
- **Effort**: **LOW**
- **Risk**: **LOW**
- **Impact**: **MEDIUM**

### **Phase 7C: Side Panel - Chart**
- **Priority**: **MEDIUM**
- **Endpoints**: `/api/prices/chart/:granularity/:id`
- **Effort**: **MEDIUM** (Chart.js integration)
- **Risk**: **LOW**
- **Impact**: **HIGH** (core feature)

### **Phase 7D: Side Panel - Recent Trades**
- **Priority**: **MEDIUM**
- **Endpoints**: `/api/prices/recent/:id`
- **Effort**: **LOW**
- **Risk**: **LOW**
- **Impact**: **MEDIUM**

### **Phase 7E: Side Panel - Advanced Metrics**
- **Priority**: **LOW**
- **Endpoints**: `/api/items/trend-details/:id`
- **Effort**: **MEDIUM** (complex data structure)
- **Risk**: **MEDIUM** (expensive endpoint)
- **Impact**: **MEDIUM**

### **Phase 7F: Expanded Rows - Same as Side Panel**
- **Priority**: **MEDIUM**
- **Endpoints**: Same as Phase 7B-7E
- **Effort**: **LOW** (reuse side panel components)
- **Risk**: **LOW**
- **Impact**: **HIGH**

---

## 5️⃣ Risk Assessment

### **🔴 HIGH RISK**

#### **1. Sparkline Embedding Payload Size**
- **Risk**: 3.4 MB per page (50 items × 67 KB sparklines)
- **Impact**: Slow initial load, potential memory issues
- **Mitigation**:
  - Option A: Limit sparkline points (e.g., 24 hours = 24 points instead of 168)
  - Option B: Make sparklines optional query param (`?includeSparklines=true`)
  - Option C: Use separate lightweight endpoint for sparklines only
- **Recommendation**: **Option B** - Make sparklines optional, default to false for initial load

#### **2. Trend Details Endpoint Performance**
- **Risk**: 8 trend calculations × multiple queries = slow response
- **Impact**: Side panel/expanded row feels laggy
- **Mitigation**: ✅ Already lazy-mounted, but consider:
  - Add loading state
  - Cache trend details (5-minute TTL)
  - Consider pagination or lazy-loading individual trends
- **Recommendation**: Add caching layer

### **🟡 MEDIUM RISK**

#### **3. Browse Endpoint Query Complexity**
- **Risk**: Adding sparklines to browse query may slow it down
- **Impact**: Slower page loads
- **Mitigation**: 
  - Test query performance with sparkline aggregation
  - Consider separate endpoint for sparklines batch (`/api/prices/sparklines?ids=1,2,3`)
- **Recommendation**: Test performance before committing to embedding

#### **4. Frontend Data Shape Assumptions**
- **Risk**: Frontend expects certain field names that may not match backend
- **Impact**: Display errors, missing data
- **Mitigation**: 
  - ✅ Already verified: Field names are aligned
  - Add runtime validation/logging for unexpected shapes
- **Recommendation**: Add data validation layer

### **🟢 LOW RISK**

#### **5. Chart Data Granularity**
- **Risk**: Frontend may request unsupported granularities
- **Impact**: 400 errors
- **Mitigation**: ✅ Backend validates granularity (line 171-174 in `routes/prices.js`)
- **Status**: ✅ **HANDLED**

#### **6. Missing Data Handling**
- **Risk**: Null/undefined values in responses
- **Impact**: UI errors
- **Mitigation**: ✅ Frontend already handles nulls (see `BrowseTableRow.jsx` formatting)
- **Status**: ✅ **HANDLED**

---

## 6️⃣ Unknowns & Assumptions

### **Unknowns**

1. **Sparkline Aggregation Performance**
   - **Question**: How fast is aggregating 50 sparklines in browse query?
   - **Action**: Need to benchmark before Phase 7A

2. **Trend Details Caching**
   - **Question**: Is there existing caching infrastructure?
   - **Action**: Check backend for Redis/cache setup

3. **Rate Limit Thresholds**
   - **Question**: What are the actual rate limits?
   - **Action**: Document from backend/API gateway

4. **Database Indexes**
   - **Question**: Are `item_id` and `timestamp` indexed on price tables?
   - **Action**: Verify for performance

### **Frontend Assumptions That Could Break**

1. **Field Names**: ✅ **VERIFIED** - All aligned
2. **Timestamp Format**: ✅ **VERIFIED** - Unix seconds (integer)
3. **Null Handling**: ✅ **VERIFIED** - Frontend handles nulls
4. **Array Ordering**: ⚠️ **ASSUME** - Chart/recent trades are ordered (ASC/DESC)
5. **Pagination**: ✅ **VERIFIED** - `totalPages` and `totalRows` included

---

## 7️⃣ Recommended Implementation Plan

### **Phase 7A: Sparkline Embedding (Critical Path)**
1. **Backend**: Add optional `sparkline` field to browse response
2. **Backend**: Make it optional query param (`?includeSparklines=false` by default)
3. **Frontend**: Update `BrowseTableRow.jsx` to use embedded sparklines when available
4. **Frontend**: Fallback to separate fetch if not embedded
5. **Testing**: Verify payload size and performance

### **Phase 7B: Side Panel - Real Data**
1. **Wire** `/api/prices/latest/:id` for real-time prices
2. **Wire** `/api/items/canonical/:id` for item metadata
3. **Update** `SidePanel.jsx` to display real data
4. **Add** loading states

### **Phase 7C: Side Panel - Chart Integration**
1. **Wire** `/api/prices/chart/:granularity/:id`
2. **Integrate** Chart.js (reuse from `ItemDetailPage.jsx`)
3. **Add** granularity selector
4. **Add** drag-to-zoom (reuse plugin from `ItemDetailPage.jsx`)

### **Phase 7D: Side Panel - Recent Trades**
1. **Wire** `/api/prices/recent/:id`
2. **Display** trades in list format
3. **Add** timestamp formatting

### **Phase 7E: Side Panel - Advanced Metrics**
1. **Wire** `/api/items/trend-details/:id`
2. **Parse** complex nested structure
3. **Display** in AdvancedPanel component
4. **Add** caching (5-minute TTL)

### **Phase 7F: Expanded Rows - Same Components**
1. **Reuse** all side panel components
2. **Layout**: 2/3 chart, 1/3 trades, metrics below
3. **Ensure** lazy mounting still works

---

## 8️⃣ Backend Constraints to Respect

### **Query Timeouts**
- **Browse endpoint**: 15-second timeout observed (line 271 in `routes/browse.js`)
- **Action**: Ensure sparkline aggregation doesn't exceed this

### **Filter Complexity**
- **Warning**: >12 filters triggers performance warning (line 231-233 in `routes/browse.js`)
- **Action**: Document this limit in frontend

### **Pagination Limits**
- **Current**: 50 items per page (configurable via `pageSize`)
- **Action**: Keep default at 50, allow user to increase if needed

### **Rate Limiting**
- **Current**: 429 errors observed
- **Action**: Implement request batching and exponential backoff

---

## 9️⃣ Summary & Next Steps

### **✅ What Exists**
- All required endpoints exist (with different names)
- Data contracts are aligned
- Frontend already handles nulls and edge cases

### **⚠️ What Needs Enhancement**
- Sparkline embedding in browse endpoint (optional)
- Caching for trend details
- Performance testing for sparkline aggregation

### **❌ What Needs Building**
- Nothing critical - all endpoints exist
- Optional: Batch sparkline endpoint as alternative to embedding

### **🎯 Recommended Next Steps**
1. **PO Decision**: Approve sparkline embedding approach (optional vs required)
2. **Backend**: Benchmark sparkline aggregation performance
3. **Backend**: Implement optional sparkline embedding
4. **Frontend**: Begin Phase 7A (sparkline embedding integration)
5. **Frontend**: Proceed with Phase 7B-7F in order

---

## ✅ Ready for Phase 7 Implementation

All endpoints exist, data contracts are aligned, and the integration path is clear. The main decision point is sparkline embedding strategy (optional vs required, payload size tradeoff).

