const express = require("express");
const router = express.Router();
const db = require("../db/db");
const selectColumns = require("../queries/selectColumns");
const buildFilters = require("../queries/buildFilters");
const buildJoins = require("../queries/buildJoins");

// Test endpoint to verify routing works
router.get("/test", (req, res) => {
    res.json({ message: "Items router is working" });
});

// GET /api/items/all - Returns all items with id, name, and icon for search
router.get("/all", async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT item_id AS id, name, icon
            FROM canonical_items
            ORDER BY name ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error("[GET /items/all] Error:", err);
        res.status(500).json({ error: "Database error", detail: err.message });
    }
});

// GET /api/items/canonical/:id - Must be before other routes to avoid conflicts
router.get("/canonical/:id", async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    console.log(`[GET /items/canonical/${itemId}] Request received`);
    
    if (isNaN(itemId)) {
        console.log(`[GET /items/canonical/${req.params.id}] Invalid item ID`);
        return res.status(400).json({ error: "Invalid item ID" });
    }

    try {
        const { rows } = await db.query(`
            SELECT * FROM canonical_items WHERE item_id = $1
        `, [itemId]);

        console.log(`[GET /items/canonical/${itemId}] Found ${rows.length} rows`);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Item not found" });
        }

        return res.json(rows[0]);
    } catch (err) {
        console.error(`[GET /items/canonical/${itemId}] Error:`, err);
        return res.status(500).json({ error: "Database error", detail: err.message });
    }
});

// GET /api/items/latest-table
router.get("/latest-table", async (req, res) => {
    try {
        // Destructure and normalize query params
        const {
            page = 1,
            pageSize = 50,
            sortBy = "margin",
            order = "desc",
            search,
            columns,
            ...queryFilters
        } = req.query;

        const pageNum = Math.max(parseInt(page, 10), 1);
        const limit = Math.max(parseInt(pageSize, 10), 1);
        const offset = (pageNum - 1) * limit;

        // Validate sort column against allowed set
        const validSorts = new Set([
            "margin", "roi", "spread",
            "buy_price", "sell_price", "buy_time", "sell_time",
            "max_profit", "max_investment",
            "limit", "limit_x_buy_price",
            // volume
            "volume_5m", "volume_1h", "volume_6h", "volume_24h", "volume_7d",
            // trend
            "trend_5m", "trend_1h", "trend_6h", "trend_24h", "trend_7d", "trend_1m",
            // turnover
            "turnover_5m", "turnover_1h", "turnover_6h", "turnover_24h", "turnover_7d", "turnover_1m",
            // buy/sell rate
            "buy_sell_rate_5m", "buy_sell_rate_1h", "buy_sell_rate_6h", "buy_sell_rate_24h", "buy_sell_rate_7d"
        ]);

        const sortColumnMap = {
            buy_price: "low.price",
            sell_price: "high.price",
            buy_time: "low.timestamp",
            sell_time: "high.timestamp",
            limit: "i.limit",
            limit_x_buy_price: "COALESCE(i.limit, 0) * COALESCE(low.price, 0)"
        };

        const resolvedSort = validSorts.has(sortBy)
            ? (sortColumnMap[sortBy] || sortBy)
            : "margin";

        const sortOrder = order.toLowerCase() === "asc" ? "ASC" : "DESC";
        const nullsPosition = "NULLS LAST";

        // Parse requested columns list
        const requestedColumns = typeof columns === "string"
            ? columns.split(",").map(c => c.trim()).filter(Boolean)
            : [];

        // Build filters clause and parameter list
        const { filters, params, paramIndex } = buildFilters({ search, ...queryFilters });

        // Count active filters to warn about performance
        const activeFilterCount = Object.keys(queryFilters).filter(k => 
            queryFilters[k] !== undefined && queryFilters[k] !== '' && queryFilters[k] !== null
        ).length;
        
        // Warn (but don't block) if too many filters - it will be slow
        if (activeFilterCount > 12) {
            console.warn(`⚠️  Performance warning: ${activeFilterCount} active filters - query will be slow`);
        }

        // Build dynamic JOINs (volume, trend, etc.) based on requestedColumns and queryFilters
        const joins = buildJoins(requestedColumns, queryFilters, sortBy);

        // Build SELECT list for requested columns
        const { select } = selectColumns(requestedColumns);

        // Append pagination params
        params.push(limit, offset);

        // Main data query
        const dataSql = `
      SELECT ${select}
      FROM items i
      ${joins}
      WHERE ${filters}
      ORDER BY ${resolvedSort} ${sortOrder} ${nullsPosition}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;

        // Count query for pagination
        const countSql = `
      SELECT COUNT(*) AS total
      FROM items i
      ${joins}
      WHERE ${filters}`;

        // Debug logging
        console.log("\n===== COUNT QUERY =====");
        console.log(countSql);
        console.log("COUNT PARAMS:", params.slice(0, -2));

        console.log("\n===== MAIN QUERY =====");
        console.log("Requested Columns:", requestedColumns);
        console.log(dataSql);
        console.log("MAIN PARAMS:", params);

        // Execute queries with timeout (15 seconds max - increased for complex queries)
        const queryTimeout = 15000; // 15 seconds
        
        const countPromise = db.query(countSql, params.slice(0, -2));
        const dataPromise = db.query(dataSql, params);

        // Race against timeout
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Query timeout')), queryTimeout)
        );

        try {
            const [countResult, dataResult] = await Promise.race([
                Promise.all([countPromise, dataPromise]),
                timeoutPromise
            ]);

        const totalRows = parseInt(countResult.rows[0].total, 10);
        const totalPages = Math.ceil(totalRows / limit);

            // Add performance warning in response if many filters
            const response = { items: dataResult.rows, totalPages };
            if (activeFilterCount > 12) {
                response.warning = `Query executed with ${activeFilterCount} filters. Consider reducing filters for faster results.`;
            }

            res.json(response);
        } catch (err) {
            if (err.message === 'Query timeout') {
                console.warn('Query timeout - too many filters/joins');
                return res.status(504).json({ 
                    error: 'Query timeout - too many filters. Please reduce the number of active filters.' 
                });
            }
            throw err;
        }

    } catch (err) {
        console.error("DB ERROR:", err);
        res.status(500).json({
            error: "Failed to fetch data",
            detail: err.message
        });
    }
});

module.exports = router;
