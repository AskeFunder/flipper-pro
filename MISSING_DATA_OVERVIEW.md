# Missing Data Overview: ItemDetailPage vs Browse Table / Side Panel / Expandable Rows

## Summary

This document outlines all data fields and metrics shown in **ItemDetailPage** that are **NOT** currently displayed in:
- Browse Table (Side Panel & Expandable Rows modes)
- Side Panel
- Expandable Rows

**Note:** Old Horizontal mode can show everything via the Column Picker.

---

## 1️⃣ Basic (Live Market Data) Section

### ✅ **Currently Shown in Side Panel / Expandable Rows:**
- ✅ Buy Price (Low)
- ✅ Sell Price (High)
- ✅ Margin
- ✅ ROI %

### ❌ **Missing from Side Panel / Expandable Rows:**

| Field | ItemDetailPage Label | Description |
|-------|---------------------|-------------|
| **Spread %** | `Spread %` | Percentage difference between high and low prices |
| **High Timestamp** | `High Timestamp` | Time ago for when high price was recorded |
| **Low Timestamp** | `Low Timestamp` | Time ago for when low price was recorded |
| **Max Profit** | `Max Profit` | Margin × Limit (maximum profit if buying at limit) |
| **Max Investment** | `Limit × Buy Price` | Low × Limit (maximum investment required) |

**Note:** `Limit` is shown in the header, but `Max Profit` and `Max Investment` are not shown.

---

## 2️⃣ Advanced (Granularity-Based) Section

### ✅ **Currently Shown in Side Panel / Expandable Rows:**
- ✅ Trend values (5m, 1h, 6h, 24h, 1w, 1m) - **static display only**

### ❌ **Missing from Side Panel / Expandable Rows:**

#### **Granularity Selector**
- ❌ **Granularity selector buttons** (5m, 1h, 6h, 24h, 1w, 1m, 3m, 1y)
- Currently: Trends are shown for all granularities at once (static)
- ItemDetailPage: User can select one granularity and see all metrics for that granularity

#### **Per-Granularity Metrics (when granularity is selected):**

| Metric | Available Granularities | Description |
|--------|------------------------|-------------|
| **Volume** | 5m, 1h, 6h, 24h, 1w, 1m, 3m, 1y | Trading volume for selected granularity |
| **Turnover** | 5m, 1h, 6h, 24h, 1w, 1m, 3m, 1y | Total turnover (volume × price) for selected granularity |
| **Buy/Sell Rate** | 5m, 1h, 6h, 24h, 1w, 1m, 3m, 1y | Ratio of buy to sell orders (color-coded: <1 = red, ≥1 = green) |
| **Price High** | 5m, 1h, 6h, 24h, 1w, 1m, 3m, 1y | Highest price in the selected granularity period |
| **Price Low** | 5m, 1h, 6h, 24h, 1w, 1m, 3m, 1y | Lowest price in the selected granularity period |

**Current State:**
- Side Panel / Expandable Rows show trends for multiple granularities simultaneously
- ItemDetailPage allows selecting one granularity and seeing all metrics (Volume, Turnover, Trend, Buy/Sell Rate, Price High, Price Low) for that granularity

---

## 3️⃣ Chart Section

### ✅ **Currently Shown:**
- ✅ Interactive price chart with time range selector (4H, 12H, 1D, 1W, 1M, 3M, 1Y)
- ✅ High/Low price lines
- ✅ Volume bars (when available)
- ✅ Drag-to-zoom (in ItemDetailPage, but not implemented in Side Panel/Expandable Rows)

### ❌ **Missing:**
- ❌ **Drag-to-zoom functionality** (ItemDetailPage has this, Side Panel/Expandable Rows do not)
- ❌ **Reset zoom button** (ItemDetailPage shows this when zoomed)

---

## 4️⃣ Recent Trades Section

### ✅ **Currently Shown:**
- ✅ Recent trades list (last 20 trades)
- ✅ Trade type (BUY/SELL)
- ✅ Trade price
- ✅ Time ago

### ✅ **Complete** - No missing fields

---

## 5️⃣ Trend Details Tooltip

### ✅ **Currently Shown:**
- ✅ Trend values (5m, 1h, 6h, 24h, 1w, 1m)

### ❌ **Missing:**
- ❌ **Hover tooltip on trend values** (ItemDetailPage shows detailed calculation breakdown on hover)
  - Current price (mid, high, low)
  - Previous price (mid, high, low)
  - Timestamps
  - Source table
  - Calculated vs stored trend values

---

## 📊 Summary Table

| Category | ItemDetailPage | Side Panel | Expandable Row | Browse Table (Side/Row modes) |
|----------|---------------|-----------|----------------|-------------------------------|
| **Basic Metrics** | | | | |
| Buy/Sell/Margin/ROI | ✅ | ✅ | ✅ | ✅ (scan columns) |
| Spread % | ✅ | ❌ | ❌ | ❌ |
| High/Low Timestamps | ✅ | ❌ | ❌ | ❌ |
| Max Profit | ✅ | ❌ | ❌ | ❌ |
| Max Investment | ✅ | ❌ | ❌ | ❌ |
| **Advanced Metrics** | | | | |
| Granularity Selector | ✅ | ❌ | ❌ | N/A |
| Volume (per granularity) | ✅ | ❌ | ❌ | ❌ |
| Turnover (per granularity) | ✅ | ❌ | ❌ | ❌ |
| Trend (per granularity) | ✅ | ✅ (all at once) | ✅ (all at once) | ❌ |
| Buy/Sell Rate (per granularity) | ✅ | ❌ | ❌ | ❌ |
| Price High/Low (per granularity) | ✅ | ❌ | ❌ | ❌ |
| **Chart** | | | | |
| Interactive Chart | ✅ | ✅ | ✅ | N/A |
| Drag-to-zoom | ✅ | ❌ | ❌ | N/A |
| Reset zoom | ✅ | ❌ | ❌ | N/A |
| **Recent Trades** | ✅ | ✅ | ✅ | N/A |
| **Trend Tooltips** | ✅ | ❌ | ❌ | N/A |

---

## 🎯 Key Differences

### **1. Granularity-Based Analysis**
- **ItemDetailPage:** User selects one granularity (5m, 1h, 6h, 24h, 1w, 1m, 3m, 1y) and sees all metrics for that granularity
- **Side Panel / Expandable Rows:** Shows trends for all granularities at once (static), no granularity selector, no volume/turnover/buy-sell-rate/price-high-low per granularity

### **2. Basic Metrics Completeness**
- **ItemDetailPage:** Shows 10 fields (High, Low, Margin, ROI, Spread, High TS, Low TS, Limit, Max Profit, Max Investment)
- **Side Panel / Expandable Rows:** Shows 4 fields (Buy, Sell, Margin, ROI)

### **3. Chart Interactivity**
- **ItemDetailPage:** Full drag-to-zoom with reset button
- **Side Panel / Expandable Rows:** Basic chart only, no zoom functionality

### **4. Trend Details**
- **ItemDetailPage:** Hover tooltips show detailed calculation breakdown
- **Side Panel / Expandable Rows:** Just the trend percentage value

---

## 📝 Notes

- **Old Horizontal Mode:** Can show all columns via Column Picker (no restrictions)
- **Side Panel & Expandable Rows:** Intentionally restricted to "scan columns" in the table, with deep data in the panel/expansion
- **Missing fields are by design** for Side Panel/Expandable Rows (they focus on scan + deep dive, not full analytics)
- **ItemDetailPage** is the full analytics view with all metrics and granularity analysis

