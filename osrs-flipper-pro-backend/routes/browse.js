const express = require("express");
const router = express.Router();
const db = require("../db/db");

// GET /api/items/browse - Fast precomputed browse endpoint
router.get("/browse", async (req, res) => {
    try {
        const {
            page = 1,
            pageSize = 50,
            sortBy = "margin",
            order = "desc",
            search,
            ...queryFilters
        } = req.query;

        const pageNum = Math.max(parseInt(page, 10), 1);
        const limit = Math.max(parseInt(pageSize, 10), 1);
        const offset = (pageNum - 1) * limit;

        // Valid sort columns (all from canonical_items table)
        const validSorts = new Set([
            "margin", "roi_percent", "spread_percent",
            "high", "low", "high_timestamp", "low_timestamp",
            "max_profit", "max_investment",
            "limit",
            "volume_5m", "volume_1h", "volume_6h", "volume_24h", "volume_7d",
            "turnover_5m", "turnover_1h", "turnover_6h", "turnover_24h", "turnover_7d", "turnover_1m",
            "buy_sell_rate_5m", "buy_sell_rate_1h",
            "trend_5m", "trend_1h", "trend_6h", "trend_24h", "trend_7d", "trend_1m"
        ]);

        // Map frontend column names to database column names
        const sortColumnMap = {
            buy_price: "low",
            sell_price: "high",
            buy_time: "low_timestamp",
            sell_time: "high_timestamp",
            roi: "roi_percent",
            spread: "spread_percent"
        };

        const resolvedSort = validSorts.has(sortBy)
            ? sortBy
            : (sortColumnMap[sortBy] || "margin");

        const sortOrder = order.toLowerCase() === "asc" ? "ASC" : "DESC";
        const nullsPosition = "NULLS LAST";

        // Build WHERE clause
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        // Search by name
        if (search) {
            conditions.push(`LOWER(name) LIKE $${paramIndex++}`);
            params.push(`%${search.toLowerCase()}%`);
        }

        // Build filters from query params
        const filterMap = {
            minMargin: "margin",
            maxMargin: "margin",
            minRoi: "roi_percent",
            maxRoi: "roi_percent",
            minSpread: "spread_percent",
            maxSpread: "spread_percent",
            minBuyPrice: "low",
            maxBuyPrice: "low",
            minSellPrice: "high",
            maxSellPrice: "high",
            minVolume_5m: "volume_5m",
            maxVolume_5m: "volume_5m",
            minVolume_1h: "volume_1h",
            maxVolume_1h: "volume_1h",
            minVolume_6h: "volume_6h",
            maxVolume_6h: "volume_6h",
            minVolume_24h: "volume_24h",
            maxVolume_24h: "volume_24h",
            minVolume_7d: "volume_7d",
            maxVolume_7d: "volume_7d",
            minTurnover_5m: "turnover_5m",
            maxTurnover_5m: "turnover_5m",
            minTurnover_1h: "turnover_1h",
            maxTurnover_1h: "turnover_1h",
            minTurnover_6h: "turnover_6h",
            maxTurnover_6h: "turnover_6h",
            minTurnover_24h: "turnover_24h",
            maxTurnover_24h: "turnover_24h",
            minTurnover_7d: "turnover_7d",
            maxTurnover_7d: "turnover_7d",
            minTurnover_1m: "turnover_1m",
            maxTurnover_1m: "turnover_1m",
            minBuy_sell_rate_5m: "buy_sell_rate_5m",
            maxBuy_sell_rate_5m: "buy_sell_rate_5m",
            minBuy_sell_rate_1h: "buy_sell_rate_1h",
            maxBuy_sell_rate_1h: "buy_sell_rate_1h",
            minTrend_5m: "trend_5m",
            maxTrend_5m: "trend_5m",
            minTrend_1h: "trend_1h",
            maxTrend_1h: "trend_1h",
            minTrend_6h: "trend_6h",
            maxTrend_6h: "trend_6h",
            minTrend_24h: "trend_24h",
            maxTrend_24h: "trend_24h",
            minTrend_7d: "trend_7d",
            maxTrend_7d: "trend_7d",
            minTrend_1m: "trend_1m",
            maxTrend_1m: "trend_1m",
            minLimit: "limit",
            maxLimit: "limit",
            minMax_profit: "max_profit",
            maxMax_profit: "max_profit",
            minMax_investment: "max_investment",
            maxMax_investment: "max_investment",
            minBuyTime: "low_timestamp",
            maxBuyTime: "low_timestamp",
            minSellTime: "high_timestamp",
            maxSellTime: "high_timestamp"
        };

        for (const [queryKey, dbColumn] of Object.entries(filterMap)) {
            const value = queryFilters[queryKey];
            if (value !== undefined && value !== '' && value !== null) {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    if (queryKey.startsWith('min')) {
                        conditions.push(`${dbColumn} >= $${paramIndex++}`);
                    } else {
                        conditions.push(`${dbColumn} <= $${paramIndex++}`);
                    }
                    params.push(numValue);
                }
            }
        }

        // Members filter
        if (queryFilters.members !== undefined) {
            conditions.push(`members = $${paramIndex++}`);
            params.push(queryFilters.members === 'true' || queryFilters.members === true);
        }

        const whereClause = conditions.length > 0 
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

        // Build SELECT - always include essential columns, add requested ones
        const selectColumns = [
            "item_id AS id",
            "name",
            "icon",
            "members",
            "\"limit\"",
            "high AS sell_price",
            "low AS buy_price",
            "high_timestamp AS sell_time",
            "low_timestamp AS buy_time",
            "margin",
            "roi_percent AS roi",
            "spread_percent AS spread",
            "max_profit",
            "max_investment",
            "volume_5m",
            "volume_1h",
            "volume_6h",
            "volume_24h",
            "volume_7d",
            "turnover_5m",
            "turnover_1h",
            "turnover_6h",
            "turnover_24h",
            "turnover_7d",
            "turnover_1m",
            "buy_sell_rate_5m",
            "buy_sell_rate_1h",
            "trend_5m",
            "trend_1h",
            "trend_6h",
            "trend_24h",
            "trend_7d",
            "trend_1m"
        ];

        // Count query
        const countSql = `
            SELECT COUNT(*) AS total
            FROM canonical_items
            ${whereClause}
        `;

        // Main data query
        const dataSql = `
            SELECT ${selectColumns.join(", ")}
            FROM canonical_items
            ${whereClause}
            ORDER BY ${resolvedSort} ${sortOrder} ${nullsPosition}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        params.push(limit, offset);

        // Execute queries
        const countResult = await db.query(countSql, params.slice(0, -2));
        const totalRows = parseInt(countResult.rows[0].total, 10);
        const totalPages = Math.ceil(totalRows / limit);

        const dataResult = await db.query(dataSql, params);

        res.json({ 
            items: dataResult.rows, 
            totalPages,
            totalRows
        });

    } catch (err) {
        console.error("DB ERROR:", err);
        res.status(500).json({
            error: "Failed to fetch data",
            detail: err.message
        });
    }
});

module.exports = router;

