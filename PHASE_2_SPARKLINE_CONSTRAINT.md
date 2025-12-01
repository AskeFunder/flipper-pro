# Phase 2 Sparkline - Technical Constraint

## 🔒 Hard Requirement

**Sparklines must be SVG-based only**

### ❌ Prohibited Technologies
- **No `<canvas>`**
- **No Chart.js**
- **No Recharts**
- **No external chart libraries**

### ✅ Required Implementation

**SVG-based sparklines using:**
- `<svg>` element
- `<polyline>` or `<path>` for line rendering
- **Stroke-only** (no fills) for v1
- Stroke color = **same as row momentum color**:
  - Green (`#2bd97f`) - for momentum-bright-green rows
  - Red (`#ff5c5c`) - for momentum-red rows
  - Yellow (`#f2c94c`) - for momentum-yellow rows
  - Grey (`#9aa4b2`) - for momentum-grey rows

## ✅ Rationale

1. **Performance**: Better performance with 50+ rows
2. **Crisp Rendering**: Works perfectly on all DPIs (no bitmap blur)
3. **Easy Theming**: Inherit row momentum color automatically
4. **React.memo Compatible**: Works perfectly with memoization
5. **No Scaling Issues**: No raster scaling or bitmap blur issues

## 📋 Implementation Notes

- Sparkline component should be a simple functional component
- Accept data array: `{ timestamp: number, price: number }[]`
- Calculate SVG path/polyline points from data
- Use row's momentum class to determine stroke color
- Memoize component with `React.memo`
- Target: 7-day historical data from `price_1h` table (168 data points)

## 🎯 Phase 2 Scope

- Create SVG sparkline component
- Integrate into `BrowseTableRow.jsx`
- Fetch 7-day price data (new endpoint: `/api/prices/sparkline/:itemId?days=7`)
- Match stroke color to row momentum
- Ensure performance with 50+ rows

---

**Status**: Constraint locked for Phase 2 implementation
**Date**: Phase 2 planning


