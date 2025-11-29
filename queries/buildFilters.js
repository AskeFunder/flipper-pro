// /queries/buildFilters.js

const columnConfig = require("./columnConfig");

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

module.exports = function buildFilters(query, paramStartIndex = 1) {
    const params = [];
    // Only require prices if explicitly filtering by price-related fields
    const hasPriceFilter = query.minBuyPrice || query.maxBuyPrice || query.minSellPrice || query.maxSellPrice || 
                           query.minMargin || query.maxMargin || query.minRoi || query.maxRoi;
    let filters = hasPriceFilter ? `high.price IS NOT NULL AND low.price IS NOT NULL` : `1=1`;
    let paramIndex = paramStartIndex;

    // 🔍 Name search
    if (query.search) {
        filters += ` AND LOWER(i.name) LIKE $${paramIndex++}`;
        params.push(`%${query.search.toLowerCase()}%`);
    }

    // 🎯 Numeric filters (minX, maxX)
    for (const col of columnConfig) {
        if (!col.filterExpr) continue;

        const minKey = `min${capitalize(col.id)}`;
        const maxKey = `max${capitalize(col.id)}`;

        if (query[minKey] !== undefined) {
            filters += ` AND ${col.filterExpr} >= $${paramIndex++}`;
            params.push(parseFloat(query[minKey]));
        }

        if (query[maxKey] !== undefined) {
            filters += ` AND ${col.filterExpr} <= $${paramIndex++}`;
            params.push(parseFloat(query[maxKey]));
        }
    }

    // ⏱ Timestamp-specific filters
    const timeFilters = {
        buy_time: "low.timestamp",
        sell_time: "high.timestamp",
    };

    for (const [field, expr] of Object.entries(timeFilters)) {
        const minKey = `min${capitalize(field)}`;
        const maxKey = `max${capitalize(field)}`;

        if (query[minKey] !== undefined) {
            filters += ` AND ${expr} >= $${paramIndex++}`;
            params.push(parseInt(query[minKey], 10));
        }

        if (query[maxKey] !== undefined) {
            filters += ` AND ${expr} <= $${paramIndex++}`;
            params.push(parseInt(query[maxKey], 10));
        }
    }

    return { filters, params, paramIndex };
};
