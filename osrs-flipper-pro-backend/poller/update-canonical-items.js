const db = require("../db/db");
const { isBackfillRunning, createLock, removeLock, setupLockCleanup } = require("./lock-utils");

/**
 * Calculate all trends for a batch of items using window-based aggregation
 * Uses a single multi-CTE query for all items in the batch
 * 
 * @param {Array<number>} itemIds - Array of item IDs
 * @param {number} now - Current timestamp
 * @returns {Promise<Map<number, Object>>} - Map of itemId -> {trend_5m, trend_1h, trend_6h, trend_24h, trend_7d, trend_1m}
 */
async function calculateBatchTrends(itemIds, now) {
    if (itemIds.length === 0) return new Map();
    
    const placeholders = itemIds.map((_, i) => `$${i + 1}`).join(',');
    
    // Mid price calculation expression (inline)
    const midExpr = `CASE WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0 WHEN avg_high IS NOT NULL THEN avg_high WHEN avg_low IS NOT NULL THEN avg_low ELSE NULL END`;
    
    // Calculate window boundaries
    const w5m = { currStart: now - 300, currEnd: now, prevStart: now - 600, prevEnd: now - 300 };
    const w1h = { currStart: now - 3600, currEnd: now, prevStart: now - 7200, prevEnd: now - 3600 };
    const w6h = { currStart: now - 21600, currEnd: now, prevStart: now - 43200, prevEnd: now - 21600 };
    const w24h = { currStart: now - 86400, currEnd: now, prevStart: now - 172800, prevEnd: now - 86400 };
    const w7d = { currStart: now - 604800, currEnd: now, prevStart: now - 1209600, prevEnd: now - 604800 };
    const w1m = { currStart: now - 2592000, currEnd: now, prevStart: now - 5184000, prevEnd: now - 2592000 };
    
    // Calculate parameter indices upfront
    let p = itemIds.length + 1;
    const p5m = { currStart: p++, currEnd: p++, prevStart: p++, prevEnd: p++ };
    const p1h = { currStart: p++, currEnd: p++, prevStart: p++, prevEnd: p++ };
    const p6h = { currStart: p++, currEnd: p++, prevStart: p++, prevEnd: p++ };
    const p24h = { currStart: p++, currEnd: p++, prevStart: p++, prevEnd: p++ };
    const p7d = { currStart: p++, currEnd: p++, prevStart: p++, prevEnd: p++ };
    const p1m = { currStart: p++, currEnd: p++, prevStart: p++, prevEnd: p++ };
    
    // Build CTEs for each trend with fallback logic - using edge-only (latest price)
    const query = `
        WITH item_list AS (
            SELECT unnest(ARRAY[${placeholders}]) AS item_id
        ),
        -- trend_5m: Period 300s, price_5m only
        t5m AS (
            SELECT il.item_id,
                (SELECT ${midExpr} FROM price_5m 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p5m.currStart} AND timestamp <= $${p5m.currEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_current,
                (SELECT ${midExpr} FROM price_5m 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p5m.prevStart} AND timestamp <= $${p5m.prevEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_previous
            FROM item_list il
        ),
        trend_5m AS (
            SELECT item_id,
                CASE 
                    WHEN price_previous IS NULL OR price_previous = 0 THEN NULL
                    WHEN price_current IS NULL THEN NULL
                    ELSE ROUND(100.0 * (price_current - price_previous) / price_previous, 2)
                END AS value
            FROM t5m
        ),
        -- trend_1h: Period 3600s, try price_5m then price_1h
        t1h_5m AS (
            SELECT il.item_id,
                (SELECT ${midExpr} FROM price_5m 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p1h.currStart} AND timestamp <= $${p1h.currEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_current,
                (SELECT ${midExpr} FROM price_5m 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p1h.prevStart} AND timestamp <= $${p1h.prevEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_previous
            FROM item_list il
        ),
        t1h_1h AS (
            SELECT il.item_id,
                (SELECT ${midExpr} FROM price_1h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p1h.currStart} AND timestamp <= $${p1h.currEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_current,
                (SELECT ${midExpr} FROM price_1h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p1h.prevStart} AND timestamp <= $${p1h.prevEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_previous
            FROM item_list il
        ),
        trend_1h AS (
            SELECT COALESCE(t5.item_id, t1.item_id) AS item_id,
                COALESCE(
                    CASE WHEN t5.price_previous IS NOT NULL AND t5.price_previous != 0 AND t5.price_current IS NOT NULL 
                        THEN ROUND(100.0 * (t5.price_current - t5.price_previous) / t5.price_previous, 2) END,
                    CASE WHEN t1.price_previous IS NOT NULL AND t1.price_previous != 0 AND t1.price_current IS NOT NULL 
                        THEN ROUND(100.0 * (t1.price_current - t1.price_previous) / t1.price_previous, 2) END
                ) AS value
            FROM t1h_5m t5
            FULL OUTER JOIN t1h_1h t1 ON t5.item_id = t1.item_id
        ),
        -- trend_6h: Period 21600s, try price_1h then price_5m
        t6h_1h AS (
            SELECT il.item_id,
                (SELECT ${midExpr} FROM price_1h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p6h.currStart} AND timestamp <= $${p6h.currEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_current,
                (SELECT ${midExpr} FROM price_1h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p6h.prevStart} AND timestamp <= $${p6h.prevEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_previous
            FROM item_list il
        ),
        t6h_5m AS (
            SELECT il.item_id,
                (SELECT ${midExpr} FROM price_5m 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p6h.currStart} AND timestamp <= $${p6h.currEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_current,
                (SELECT ${midExpr} FROM price_5m 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p6h.prevStart} AND timestamp <= $${p6h.prevEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_previous
            FROM item_list il
        ),
        trend_6h AS (
            SELECT COALESCE(t1.item_id, t5.item_id) AS item_id,
                COALESCE(
                    CASE WHEN t1.price_previous IS NOT NULL AND t1.price_previous != 0 AND t1.price_current IS NOT NULL 
                        THEN ROUND(100.0 * (t1.price_current - t1.price_previous) / t1.price_previous, 2) END,
                    CASE WHEN t5.price_previous IS NOT NULL AND t5.price_previous != 0 AND t5.price_current IS NOT NULL 
                        THEN ROUND(100.0 * (t5.price_current - t5.price_previous) / t5.price_previous, 2) END
                ) AS value
            FROM t6h_1h t1
            FULL OUTER JOIN t6h_5m t5 ON t1.item_id = t5.item_id
        ),
        -- trend_24h: Period 86400s, try price_1h then price_5m then price_6h
        t24h_1h AS (
            SELECT il.item_id,
                (SELECT ${midExpr} FROM price_1h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p24h.currStart} AND timestamp <= $${p24h.currEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_current,
                (SELECT ${midExpr} FROM price_1h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p24h.prevStart} AND timestamp <= $${p24h.prevEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_previous
            FROM item_list il
        ),
        t24h_5m AS (
            SELECT il.item_id,
                (SELECT ${midExpr} FROM price_5m 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p24h.currStart} AND timestamp <= $${p24h.currEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_current,
                (SELECT ${midExpr} FROM price_5m 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p24h.prevStart} AND timestamp <= $${p24h.prevEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_previous
            FROM item_list il
        ),
        t24h_6h AS (
            SELECT il.item_id,
                (SELECT ${midExpr} FROM price_6h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p24h.currStart} AND timestamp <= $${p24h.currEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_current,
                (SELECT ${midExpr} FROM price_6h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p24h.prevStart} AND timestamp <= $${p24h.prevEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_previous
            FROM item_list il
        ),
        trend_24h AS (
            SELECT COALESCE(t1.item_id, t5.item_id, t6.item_id) AS item_id,
                COALESCE(
                    CASE WHEN t1.price_previous IS NOT NULL AND t1.price_previous != 0 AND t1.price_current IS NOT NULL 
                        THEN ROUND(100.0 * (t1.price_current - t1.price_previous) / t1.price_previous, 2) END,
                    CASE WHEN t5.price_previous IS NOT NULL AND t5.price_previous != 0 AND t5.price_current IS NOT NULL 
                        THEN ROUND(100.0 * (t5.price_current - t5.price_previous) / t5.price_previous, 2) END,
                    CASE WHEN t6.price_previous IS NOT NULL AND t6.price_previous != 0 AND t6.price_current IS NOT NULL 
                        THEN ROUND(100.0 * (t6.price_current - t6.price_previous) / t6.price_previous, 2) END
                ) AS value
            FROM t24h_1h t1
            FULL OUTER JOIN t24h_5m t5 ON t1.item_id = t5.item_id
            FULL OUTER JOIN t24h_6h t6 ON COALESCE(t1.item_id, t5.item_id) = t6.item_id
        ),
        -- trend_7d: Period 604800s, try price_6h then price_1h
        t7d_6h AS (
            SELECT il.item_id,
                (SELECT ${midExpr} FROM price_6h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p7d.currStart} AND timestamp <= $${p7d.currEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_current,
                (SELECT ${midExpr} FROM price_6h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p7d.prevStart} AND timestamp <= $${p7d.prevEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_previous
            FROM item_list il
        ),
        t7d_1h AS (
            SELECT il.item_id,
                (SELECT ${midExpr} FROM price_1h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p7d.currStart} AND timestamp <= $${p7d.currEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_current,
                (SELECT ${midExpr} FROM price_1h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p7d.prevStart} AND timestamp <= $${p7d.prevEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_previous
            FROM item_list il
        ),
        trend_7d AS (
            SELECT COALESCE(t6.item_id, t1.item_id) AS item_id,
                COALESCE(
                    CASE WHEN t6.price_previous IS NOT NULL AND t6.price_previous != 0 AND t6.price_current IS NOT NULL 
                        THEN ROUND(100.0 * (t6.price_current - t6.price_previous) / t6.price_previous, 2) END,
                    CASE WHEN t1.price_previous IS NOT NULL AND t1.price_previous != 0 AND t1.price_current IS NOT NULL 
                        THEN ROUND(100.0 * (t1.price_current - t1.price_previous) / t1.price_previous, 2) END
                ) AS value
            FROM t7d_6h t6
            FULL OUTER JOIN t7d_1h t1 ON t6.item_id = t1.item_id
        ),
        -- trend_1m: Period 2592000s, try price_6h then price_1h
        t1m_6h AS (
            SELECT il.item_id,
                (SELECT ${midExpr} FROM price_6h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p1m.currStart} AND timestamp <= $${p1m.currEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_current,
                (SELECT ${midExpr} FROM price_6h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p1m.prevStart} AND timestamp <= $${p1m.prevEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_previous
            FROM item_list il
        ),
        t1m_1h AS (
            SELECT il.item_id,
                (SELECT ${midExpr} FROM price_1h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p1m.currStart} AND timestamp <= $${p1m.currEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_current,
                (SELECT ${midExpr} FROM price_1h 
                 WHERE item_id = il.item_id 
                   AND timestamp > $${p1m.prevStart} AND timestamp <= $${p1m.prevEnd}
                 ORDER BY timestamp DESC LIMIT 1) AS price_previous
            FROM item_list il
        ),
        trend_1m AS (
            SELECT COALESCE(t6.item_id, t1.item_id) AS item_id,
                COALESCE(
                    CASE WHEN t6.price_previous IS NOT NULL AND t6.price_previous != 0 AND t6.price_current IS NOT NULL 
                        THEN ROUND(100.0 * (t6.price_current - t6.price_previous) / t6.price_previous, 2) END,
                    CASE WHEN t1.price_previous IS NOT NULL AND t1.price_previous != 0 AND t1.price_current IS NOT NULL 
                        THEN ROUND(100.0 * (t1.price_current - t1.price_previous) / t1.price_previous, 2) END
                ) AS value
            FROM t1m_6h t6
            FULL OUTER JOIN t1m_1h t1 ON t6.item_id = t1.item_id
        )
        SELECT 
            il.item_id,
            t5.value AS trend_5m,
            t1.value AS trend_1h,
            t6.value AS trend_6h,
            t24.value AS trend_24h,
            t7.value AS trend_7d,
            tm.value AS trend_1m
        FROM item_list il
        LEFT JOIN trend_5m t5 ON il.item_id = t5.item_id
        LEFT JOIN trend_1h t1 ON il.item_id = t1.item_id
        LEFT JOIN trend_6h t6 ON il.item_id = t6.item_id
        LEFT JOIN trend_24h t24 ON il.item_id = t24.item_id
        LEFT JOIN trend_7d t7 ON il.item_id = t7.item_id
        LEFT JOIN trend_1m tm ON il.item_id = tm.item_id
    `;
    
    // Build params array with window boundaries
    const params = [
        ...itemIds,
        w5m.currStart, w5m.currEnd, w5m.prevStart, w5m.prevEnd,
        w1h.currStart, w1h.currEnd, w1h.prevStart, w1h.prevEnd,
        w6h.currStart, w6h.currEnd, w6h.prevStart, w6h.prevEnd,
        w24h.currStart, w24h.currEnd, w24h.prevStart, w24h.prevEnd,
        w7d.currStart, w7d.currEnd, w7d.prevStart, w7d.prevEnd,
        w1m.currStart, w1m.currEnd, w1m.prevStart, w1m.prevEnd
    ];
    
    try {
        const { rows } = await db.query(query, params);
        const trendMap = new Map();
        for (const row of rows) {
            trendMap.set(row.item_id, {
                trend_5m: row.trend_5m,
                trend_1h: row.trend_1h,
                trend_6h: row.trend_6h,
                trend_24h: row.trend_24h,
                trend_7d: row.trend_7d,
                trend_1m: row.trend_1m
            });
        }
        return trendMap;
    } catch (err) {
        console.error("[CANONICAL] Error calculating batch trends:", err);
        // Return empty map on error
        return new Map();
    }
}

async function updateCanonicalItems() {
    const now = Math.floor(Date.now() / 1000);
    
    // Check if another update is already running
    if (isBackfillRunning("canonical")) {
        console.log("[CANONICAL] Update already in progress, skipping...");
        return;
    }
    
    try {
        createLock("canonical");
        setupLockCleanup("canonical");
        console.log("[CANONICAL] Starting update...");
        
        // Get all items
        const { rows: items } = await db.query("SELECT id, name, icon, members, \"limit\" FROM items");
        
        if (items.length === 0) {
            console.log("[CANONICAL] No items found, skipping update");
            return;
        }
        
        let updated = 0;
        
        // Process in batches to avoid memory issues
        // Increased to 200 for better performance with window-based trends
        const batchSize = 200;
        const totalBatches = Math.ceil(items.length / batchSize);
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            console.log(`[CANONICAL] Processing batch ${batchNum}/${totalBatches} (${batch.length} items)...`);
            
            await db.query("BEGIN");
            
            // Calculate trends for entire batch in one query
            const itemIds = batch.map(item => item.id);
            const trendsMap = await calculateBatchTrends(itemIds, now);
            
            try {
                for (const item of batch) {
                    const itemId = item.id;
                    const trends = trendsMap.get(itemId) || {};
                    
                    // Get latest prices from price_instants
                    const { rows: prices } = await db.query(`
                        SELECT price, timestamp, type
                        FROM price_instants
                        WHERE item_id = $1
                    `, [itemId]);
                    
                    const highPrice = prices.find(p => p.type === 'high');
                    const lowPrice = prices.find(p => p.type === 'low');
                    
                    // Skip if no price data
                    if (!highPrice || !lowPrice) {
                        continue;
                    }
                    
                    const high = highPrice.price;
                    const low = lowPrice.price;
                    const highTs = highPrice.timestamp;
                    const lowTs = lowPrice.timestamp;
                    
                    // Calculate derived values
                    const margin = Math.floor(high * 0.98) - low;
                    const roiPercent = low > 0 ? parseFloat(((margin * 100.0) / low).toFixed(2)) : null;
                    const spreadPercent = high > 0 ? parseFloat(((high - low) * 100.0 / high).toFixed(2)) : null;
                    // Use BigInt for large calculations
                    const maxProfit = (BigInt(margin) * BigInt(item.limit || 0)).toString();
                    const maxInvestment = (BigInt(low) * BigInt(item.limit || 0)).toString();
                    
                    // Get volume aggregations from price_5m
                    // For 5m, get the latest volume (or NULL if no data)
                    const { rows: vol5m } = await db.query(`
                        SELECT volume
                        FROM price_5m
                        WHERE item_id = $1
                        ORDER BY timestamp DESC
                        LIMIT 1
                    `, [itemId]);
                    
                    // For 1h, 6h, 24h, 7d: sum volumes from price_5m over the time period
                    // Use COALESCE to return 0 when no data exists (no trading activity = 0)
                    const { rows: vol1h } = await db.query(`
                        SELECT COALESCE(SUM(volume), 0)::BIGINT AS volume
                        FROM price_5m
                        WHERE item_id = $1
                          AND timestamp >= $2
                    `, [itemId, now - 3600]);
                    
                    const { rows: vol6h } = await db.query(`
                        SELECT COALESCE(SUM(volume), 0)::BIGINT AS volume
                        FROM price_5m
                        WHERE item_id = $1
                          AND timestamp >= $2
                    `, [itemId, now - 21600]);
                    
                    const { rows: vol24h } = await db.query(`
                        SELECT COALESCE(SUM(volume), 0)::BIGINT AS volume
                        FROM price_5m
                        WHERE item_id = $1
                          AND timestamp >= $2
                    `, [itemId, now - 86400]);
                    
                    // For 7d, use price_1h table (more efficient for longer time periods)
                    const { rows: vol7d } = await db.query(`
                        SELECT COALESCE(SUM(volume), 0)::BIGINT AS volume
                        FROM price_1h
                        WHERE item_id = $1
                          AND timestamp >= $2
                    `, [itemId, now - 604800]);
                    
                    // Extract volumes (will be 0 if no data, or actual sum if data exists)
                    const volume5m = vol5m[0]?.volume ?? null; // Keep NULL for 5m if no latest data
                    const volume1h = vol1h[0]?.volume ?? 0;
                    const volume6h = vol6h[0]?.volume ?? 0;
                    const volume24h = vol24h[0]?.volume ?? 0;
                    const volume7d = vol7d[0]?.volume ?? 0;
                    
                    // Get prices from aggregated tables
                    const { rows: price5m } = await db.query(`
                        SELECT avg_high, avg_low
                        FROM price_5m
                        WHERE item_id = $1
                        ORDER BY timestamp DESC
                        LIMIT 1
                    `, [itemId]);
                    
                    const { rows: price1h } = await db.query(`
                        SELECT avg_high, avg_low
                        FROM price_1h
                        WHERE item_id = $1
                        ORDER BY timestamp DESC
                        LIMIT 1
                    `, [itemId]);
                    
                    const price5mHigh = price5m[0]?.avg_high || null;
                    const price5mLow = price5m[0]?.avg_low || null;
                    const price1hHigh = price1h[0]?.avg_high || null;
                    const price1hLow = price1h[0]?.avg_low || null;
                    
                    // Calculate turnover (mid_price × volume)
                    // For 5m, use the same SQL-based calculation for consistency
                    // Get the latest 5m row and calculate turnover from it
                    const { rows: turnover5mData } = await db.query(`
                        SELECT 
                            COALESCE(SUM(
                                CASE 
                                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                                    WHEN avg_high IS NOT NULL THEN avg_high
                                    WHEN avg_low IS NOT NULL THEN avg_low
                                    ELSE NULL
                                END * volume
                            ), 0)::NUMERIC(20,0) AS turnover
                        FROM (
                            SELECT avg_high, avg_low, volume
                            FROM price_5m
                            WHERE item_id = $1
                            ORDER BY timestamp DESC
                            LIMIT 1
                        ) latest_5m
                    `, [itemId]);
                    
                    // For 1h and 24h turnover, we need to sum (mid_price × volume) over the period
                    const { rows: turnover1hData } = await db.query(`
                        SELECT 
                            COALESCE(SUM(
                                CASE 
                                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                                    WHEN avg_high IS NOT NULL THEN avg_high
                                    WHEN avg_low IS NOT NULL THEN avg_low
                                    ELSE NULL
                                END * volume
                            ), 0)::NUMERIC(20,0) AS turnover
                        FROM price_5m
                        WHERE item_id = $1
                          AND timestamp >= $2
                    `, [itemId, now - 3600]);
                    
                    const { rows: turnover6hData } = await db.query(`
                        SELECT 
                            COALESCE(SUM(
                                CASE 
                                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                                    WHEN avg_high IS NOT NULL THEN avg_high
                                    WHEN avg_low IS NOT NULL THEN avg_low
                                    ELSE NULL
                                END * volume
                            ), 0)::NUMERIC(20,0) AS turnover
                        FROM price_5m
                        WHERE item_id = $1
                          AND timestamp >= $2
                    `, [itemId, now - 21600]);
                    
                    const { rows: turnover24hData } = await db.query(`
                        SELECT 
                            COALESCE(SUM(
                                CASE 
                                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                                    WHEN avg_high IS NOT NULL THEN avg_high
                                    WHEN avg_low IS NOT NULL THEN avg_low
                                    ELSE NULL
                                END * volume
                            ), 0)::NUMERIC(20,0) AS turnover
                        FROM price_5m
                        WHERE item_id = $1
                          AND timestamp >= $2
                    `, [itemId, now - 86400]);
                    
                    // For 7d, use price_1h table (more efficient for longer time periods)
                    const { rows: turnover7dData } = await db.query(`
                        SELECT 
                            COALESCE(SUM(
                                CASE 
                                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                                    WHEN avg_high IS NOT NULL THEN avg_high
                                    WHEN avg_low IS NOT NULL THEN avg_low
                                    ELSE NULL
                                END * volume
                            ), 0)::NUMERIC(20,0) AS turnover
                        FROM price_1h
                        WHERE item_id = $1
                          AND timestamp >= $2
                    `, [itemId, now - 604800]);
                    
                    // For 1m, use price_6h table (30 days = 2592000 seconds)
                    const { rows: turnover1mData } = await db.query(`
                        SELECT 
                            COALESCE(SUM(
                                CASE 
                                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                                    WHEN avg_high IS NOT NULL THEN avg_high
                                    WHEN avg_low IS NOT NULL THEN avg_low
                                    ELSE NULL
                                END * volume
                            ), 0)::NUMERIC(20,0) AS turnover
                        FROM price_6h
                        WHERE item_id = $1
                          AND timestamp >= $2
                    `, [itemId, now - 2592000]);
                    
                    // Turnover values are already NUMERIC from query, convert to string for NUMERIC
                    // Use != null to explicitly check for null/undefined (allows 0 values)
                    // Always convert to string to ensure we never pass null to PostgreSQL
                    const turnover5m = (turnover5mData[0]?.turnover != null) ? String(turnover5mData[0].turnover) : '0';
                    const turnover1h = (turnover1hData[0]?.turnover != null) ? String(turnover1hData[0].turnover) : '0';
                    const turnover6h = (turnover6hData[0]?.turnover != null) ? String(turnover6hData[0].turnover) : '0';
                    const turnover24h = (turnover24hData[0]?.turnover != null) ? String(turnover24hData[0].turnover) : '0';
                    const turnover7d = (turnover7dData[0]?.turnover != null) ? String(turnover7dData[0].turnover) : '0';
                    const turnover1m = (turnover1mData[0]?.turnover != null) ? String(turnover1mData[0].turnover) : '0';
                    
                    // Calculate buy/sell rate (high_volume / low_volume)
                    const { rows: bsr5m } = await db.query(`
                        SELECT 
                            CASE 
                                WHEN SUM(low_volume) = 0 THEN NULL
                                ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                            END AS ratio
                        FROM price_5m
                        WHERE item_id = $1
                          AND timestamp >= $2
                    `, [itemId, now - 300]);
                    
                    const { rows: bsr1h } = await db.query(`
                        SELECT 
                            CASE 
                                WHEN SUM(low_volume) = 0 THEN NULL
                                ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                            END AS ratio
                        FROM price_5m
                        WHERE item_id = $1
                          AND timestamp >= $2
                    `, [itemId, now - 3600]);
                    
                    const buySellRate5m = bsr5m[0]?.ratio || null;
                    const buySellRate1h = bsr1h[0]?.ratio || null;
                    
                    // Get trends from batch calculation (window-based aggregation with granularity fallback)
                    const trend5m = trends.trend_5m ?? null;
                    const trend1h = trends.trend_1h ?? null;
                    const trend6h = trends.trend_6h ?? null;
                    const trend24h = trends.trend_24h ?? null;
                    const trend7d = trends.trend_7d ?? null;
                    const trend1m = trends.trend_1m ?? null;
                    
                    // Insert or update canonical_items
                    await db.query(`
                        INSERT INTO canonical_items (
                            item_id, name, icon, members, "limit",
                            high, low, high_timestamp, low_timestamp,
                            margin, roi_percent, spread_percent, max_profit, max_investment,
                            volume_5m, volume_1h, volume_6h, volume_24h, volume_7d,
                            price_5m_high, price_5m_low, price_1h_high, price_1h_low,
                            turnover_5m, turnover_1h, turnover_6h, turnover_24h, turnover_7d, turnover_1m,
                            buy_sell_rate_5m, buy_sell_rate_1h,
                            trend_5m, trend_1h, trend_6h, trend_24h, trend_7d, trend_1m,
                            timestamp_updated
                        ) VALUES (
                            $1, $2, $3, $4, $5,
                            $6, $7, $8, $9,
                            $10, $11, $12, $13, $14,
                            $15, $16, $17, $18, $19,
                            $20, $21, $22, $23,
                            $24, $25, $26, $27, $28, $29,
                            $30, $31,
                            $32, $33, $34, $35, $36, $37,
                            $38
                        )
                        ON CONFLICT (item_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            icon = EXCLUDED.icon,
                            members = EXCLUDED.members,
                            "limit" = EXCLUDED."limit",
                            high = EXCLUDED.high,
                            low = EXCLUDED.low,
                            high_timestamp = EXCLUDED.high_timestamp,
                            low_timestamp = EXCLUDED.low_timestamp,
                            margin = EXCLUDED.margin,
                            roi_percent = EXCLUDED.roi_percent,
                            spread_percent = EXCLUDED.spread_percent,
                            max_profit = EXCLUDED.max_profit,
                            max_investment = EXCLUDED.max_investment,
                            volume_5m = EXCLUDED.volume_5m,
                            volume_1h = EXCLUDED.volume_1h,
                            volume_6h = EXCLUDED.volume_6h,
                            volume_24h = EXCLUDED.volume_24h,
                            volume_7d = EXCLUDED.volume_7d,
                            price_5m_high = EXCLUDED.price_5m_high,
                            price_5m_low = EXCLUDED.price_5m_low,
                            price_1h_high = EXCLUDED.price_1h_high,
                            price_1h_low = EXCLUDED.price_1h_low,
                            turnover_5m = EXCLUDED.turnover_5m,
                            turnover_1h = EXCLUDED.turnover_1h,
                            turnover_6h = EXCLUDED.turnover_6h,
                            turnover_24h = EXCLUDED.turnover_24h,
                            turnover_7d = EXCLUDED.turnover_7d,
                            turnover_1m = EXCLUDED.turnover_1m,
                            buy_sell_rate_5m = EXCLUDED.buy_sell_rate_5m,
                            buy_sell_rate_1h = EXCLUDED.buy_sell_rate_1h,
                            trend_5m = EXCLUDED.trend_5m,
                            trend_1h = EXCLUDED.trend_1h,
                            trend_6h = EXCLUDED.trend_6h,
                            trend_24h = EXCLUDED.trend_24h,
                            trend_7d = EXCLUDED.trend_7d,
                            trend_1m = EXCLUDED.trend_1m,
                            timestamp_updated = EXCLUDED.timestamp_updated
                    `, [
                        itemId, item.name, item.icon, item.members, item.limit,
                        high, low, highTs, lowTs,
                        margin, roiPercent, spreadPercent, maxProfit, maxInvestment,
                        volume5m, volume1h, volume6h, volume24h, volume7d,
                        price5mHigh, price5mLow, price1hHigh, price1hLow,
                        turnover5m, turnover1h, turnover6h, turnover24h, turnover7d, turnover1m,
                        buySellRate5m, buySellRate1h,
                        trend5m, trend1h, trend6h, trend24h, trend7d, trend1m,
                        now
                    ]);
                    
                    updated++;
                }
                
                await db.query("COMMIT");
                console.log(`[CANONICAL] Batch ${batchNum}/${totalBatches} completed (${updated} items updated so far)`);
            } catch (err) {
                await db.query("ROLLBACK");
                throw err;
            }
        }
        
        console.log(`[CANONICAL] Updated ${updated} items`);
    } catch (err) {
        console.error("[CANONICAL] Error updating canonical items:", err);
        throw err;
    } finally {
        removeLock("canonical");
    }
}

// Run if called directly
if (require.main === module) {
    updateCanonicalItems()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = updateCanonicalItems;

