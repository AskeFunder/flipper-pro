const db = require("../db/db");
const { isBackfillRunning, createLock, removeLock, setupLockCleanup } = require("./lock-utils");
const taxExemptItems = require("../config/tax-exempt-items");

/**
 * Find price data for a target timestamp using multi-granularity fallback with tolerance scanning
 * Implements the deterministic seek strategy: T, T-step, T+step, T-2*step, T+2*step...
 * 
 * @param {string} tableName - Table to search (price_5m, price_1h, price_6h, price_24h)
 * @param {string} targetParam - Parameter placeholder for target timestamp
 * @param {string} toleranceParam - Parameter placeholder for tolerance in seconds
 * @param {boolean} exactOnly - If true, only exact matches allowed (for 5m granularity)
 * @param {string} windowStartParam - Parameter for window start (for EIS and strict 1y)
 * @param {string} windowEndParam - Parameter for window end (for EIS and strict 1y)
 * @param {boolean} strictWindow - If true, must stay strictly inside window (for 1y)
 * @returns {string} SQL expression that returns mid_price or NULL
 */
function buildPriceSeekExpression(tableName, targetParam, toleranceParam, exactOnly, windowStartParam, windowEndParam, strictWindow) {
    const midExpr = `CASE 
        WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
        WHEN avg_high IS NOT NULL THEN avg_high
        WHEN avg_low IS NOT NULL THEN avg_low
        ELSE NULL
    END`;
    
    // Priority: both > high only > low only
    const priorityExpr = `CASE 
        WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN 1
        WHEN avg_high IS NOT NULL THEN 2
        WHEN avg_low IS NOT NULL THEN 3
        ELSE NULL
    END`;
    
    if (exactOnly) {
        // For 5m granularity, exact match only
        return `(
            SELECT ${midExpr}
            FROM ${tableName}
            WHERE item_id = il.item_id
              AND timestamp = $${targetParam}
              AND ${priorityExpr} IS NOT NULL
            ORDER BY ${priorityExpr} ASC, timestamp DESC
            LIMIT 1
        )`;
    }
    
    // For other granularities, use tolerance scanning
    // Generate scan sequence: T, T-step, T+step, T-2*step, T+2*step...
    // We'll use a subquery with UNION ALL to create the scan sequence
    const stepSeconds = 300; // 5 minutes
    
    // Build scan offsets: 0, -300, +300, -600, +600, -900, +900...
    // We'll generate up to tolerance/step steps
    // Actually, this is complex in SQL. Let me use a simpler approach:
    // Use ABS(timestamp - target) <= tolerance and order by priority, then distance
    
    if (strictWindow) {
        // For 1y, must stay strictly inside window
        return `(
            SELECT ${midExpr}
            FROM ${tableName}
            WHERE item_id = il.item_id
              AND timestamp >= $${windowStartParam}
              AND timestamp <= $${windowEndParam}
              AND ABS(timestamp - $${targetParam}) <= $${toleranceParam}
              AND ${priorityExpr} IS NOT NULL
            ORDER BY ${priorityExpr} ASC, ABS(timestamp - $${targetParam}) ASC, timestamp DESC
            LIMIT 1
        )`;
    } else {
        // For other trends, can go outside window with tolerance
        return `(
            SELECT ${midExpr}
            FROM ${tableName}
            WHERE item_id = il.item_id
              AND ABS(timestamp - $${targetParam}) <= $${toleranceParam}
              AND ${priorityExpr} IS NOT NULL
            ORDER BY ${priorityExpr} ASC, ABS(timestamp - $${targetParam}) ASC, timestamp DESC
            LIMIT 1
        )`;
    }
}

/**
 * Build Extended In-Window Search expression
 * Searches within window for closest timestamp to target, within maxExtendedDistance
 */
function buildEISExpression(tableName, targetParam, windowStartParam, windowEndParam, maxExtendedParam, strictWindow) {
    const midExpr = `CASE 
        WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
        WHEN avg_high IS NOT NULL THEN avg_high
        WHEN avg_low IS NOT NULL THEN avg_low
        ELSE NULL
    END`;
    
    const priorityExpr = `CASE 
        WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN 1
        WHEN avg_high IS NOT NULL THEN 2
        WHEN avg_low IS NOT NULL THEN 3
        ELSE NULL
    END`;
    
    if (strictWindow) {
        // For 1y, must stay strictly inside window
        return `(
            SELECT ${midExpr}
            FROM ${tableName}
            WHERE item_id = il.item_id
              AND timestamp >= $${windowStartParam}
              AND timestamp <= $${windowEndParam}
              AND ABS(timestamp - $${targetParam}) <= $${maxExtendedParam}
              AND ${priorityExpr} IS NOT NULL
            ORDER BY ${priorityExpr} ASC, ABS(timestamp - $${targetParam}) ASC, timestamp DESC
            LIMIT 1
        )`;
    } else {
        // For other trends, search within window
        return `(
            SELECT ${midExpr}
            FROM ${tableName}
            WHERE item_id = il.item_id
              AND timestamp >= $${windowStartParam}
              AND timestamp <= $${windowEndParam}
              AND ABS(timestamp - $${targetParam}) <= $${maxExtendedParam}
              AND ${priorityExpr} IS NOT NULL
            ORDER BY ${priorityExpr} ASC, ABS(timestamp - $${targetParam}) ASC, timestamp DESC
            LIMIT 1
        )`;
    }
}

/**
 * Audit log function for trend anomalies (PHASE 5B)
 * Only logs when status is stale, unavailable, or guard triggers
 * 
 * NOTE: Audit logging is disabled in production to avoid console spam.
 * To enable for testing, set ENABLE_TREND_AUDIT_LOGS=true in .env
 */
function auditTrendAnomaly(itemId, trendType, status, nowTimestamp, targetTimestamp, matchedTimestamp, source, reason) {
    // Only log anomalies, not valid trends
    if (status === "valid") return;
    
    // Only log if explicitly enabled via environment variable
    if (process.env.ENABLE_TREND_AUDIT_LOGS !== 'true') return;
    
    console.log(`[TREND-AUDIT] ${trendType} anomaly for item ${itemId}:`, {
        itemId,
        trendType,
        status,
        nowTimestamp: nowTimestamp ? new Date(nowTimestamp * 1000).toISOString() : null,
        targetTimestamp: targetTimestamp ? new Date(targetTimestamp * 1000).toISOString() : null,
        matchedTimestamp: matchedTimestamp ? new Date(matchedTimestamp * 1000).toISOString() : null,
        source: source || "unknown",
        reason: reason || "unknown"
    });
}

/**
 * Pure function to calculate trend from candles following strict rules (PHASE 5A - with guards)
 * 
 * @param {Array<Object>} candles - Array of candle objects with {timestamp, avg_high, avg_low}
 * @param {number} periodSeconds - Period in seconds (e.g., 60 * 60 for 1H)
 * @param {number} toleranceSeconds - Tolerance in seconds (e.g., 5 * 60 for ±5 min)
 * @param {Object} auditContext - Optional: {itemId, trendType, source} for audit logging
 * @returns {Object} - {value: number | null, status: "valid" | "unavailable", nowTimestamp, targetTimestamp, matchedTimestamp}
 */
function calculateTrendFromCandles(candles, periodSeconds, toleranceSeconds, auditContext = null) {
    if (!candles || candles.length === 0) {
        return {
            value: null,
            status: "unavailable",
            nowTimestamp: null,
            targetTimestamp: null,
            matchedTimestamp: null
        };
    }
    
    // Calculate mid price helper
    const getMidPrice = (candle) => {
        if (candle.avg_high != null && candle.avg_low != null) {
            return (candle.avg_high + candle.avg_low) / 2.0;
        }
        if (candle.avg_high != null) {
            return candle.avg_high;
        }
        if (candle.avg_low != null) {
            return candle.avg_low;
        }
        return null;
    };
    
    // Find latest candle timestamp (not system time)
    const sortedCandles = candles
        .filter(c => c.timestamp != null)
        .sort((a, b) => b.timestamp - a.timestamp);
    
    if (sortedCandles.length === 0) {
        return {
            value: null,
            status: "unavailable",
            nowTimestamp: null,
            targetTimestamp: null,
            matchedTimestamp: null
        };
    }
    
    const nowTimestamp = sortedCandles[0].timestamp; // Latest candle timestamp
    const targetTimestamp = nowTimestamp - periodSeconds; // Target time (60 min ago)
    
    // PHASE 5A - Hard guard: targetTimestamp must not be in the future
    const systemNow = Math.floor(Date.now() / 1000);
    if (targetTimestamp > systemNow) {
        const reason = `targetTimestamp (${new Date(targetTimestamp * 1000).toISOString()}) is in the future (system: ${new Date(systemNow * 1000).toISOString()})`;
        if (auditContext) {
            auditTrendAnomaly(auditContext.itemId, auditContext.trendType, "unavailable", nowTimestamp, targetTimestamp, null, auditContext.source, reason);
        }
        return {
            value: null,
            status: "unavailable",
            nowTimestamp,
            targetTimestamp,
            matchedTimestamp: null
        };
    }
    
    // Precompute tolerance bounds for performance (PHASE 5C)
    const toleranceLower = targetTimestamp - toleranceSeconds;
    const toleranceUpper = targetTimestamp + toleranceSeconds;
    
    // Find candle within tolerance
    let matchedCandle = null;
    let minDistance = Infinity;
    
    for (const candle of sortedCandles) {
        // Skip candles outside tolerance bounds (performance optimization)
        if (candle.timestamp < toleranceLower || candle.timestamp > toleranceUpper) {
            continue;
        }
        
        const distance = Math.abs(candle.timestamp - targetTimestamp);
        if (distance < minDistance) {
            minDistance = distance;
            matchedCandle = candle;
        }
    }
    
    // If no candle found within tolerance, return unavailable
    if (!matchedCandle) {
        const reason = `No candle found within tolerance (${toleranceSeconds}s) of target`;
        if (auditContext) {
            auditTrendAnomaly(auditContext.itemId, auditContext.trendType, "unavailable", nowTimestamp, targetTimestamp, null, auditContext.source, reason);
        }
        return {
            value: null,
            status: "unavailable",
            nowTimestamp,
            targetTimestamp,
            matchedTimestamp: null
        };
    }
    
    const matchedTimestamp = matchedCandle.timestamp;
    
    // PHASE 5A - Hard guard: matchedTimestamp must not be after nowTimestamp
    if (matchedTimestamp > nowTimestamp) {
        const reason = `matchedTimestamp (${new Date(matchedTimestamp * 1000).toISOString()}) is after nowTimestamp (${new Date(nowTimestamp * 1000).toISOString()})`;
        if (auditContext) {
            auditTrendAnomaly(auditContext.itemId, auditContext.trendType, "unavailable", nowTimestamp, targetTimestamp, matchedTimestamp, auditContext.source, reason);
        }
        return {
            value: null,
            status: "unavailable",
            nowTimestamp,
            targetTimestamp,
            matchedTimestamp: null
        };
    }
    
    // PHASE 5A - Hard guard: matchedTimestamp must be within tolerance
    const actualDistance = Math.abs(matchedTimestamp - targetTimestamp);
    if (actualDistance > toleranceSeconds) {
        const reason = `matchedTimestamp distance (${actualDistance}s) exceeds tolerance (${toleranceSeconds}s)`;
        if (auditContext) {
            auditTrendAnomaly(auditContext.itemId, auditContext.trendType, "unavailable", nowTimestamp, targetTimestamp, matchedTimestamp, auditContext.source, reason);
        }
        return {
            value: null,
            status: "unavailable",
            nowTimestamp,
            targetTimestamp,
            matchedTimestamp: null
        };
    }
    
    // Calculate prices
    const priceNow = getMidPrice(sortedCandles[0]);
    const priceThen = getMidPrice(matchedCandle);
    
    // If either price is null, return unavailable
    if (priceNow == null || priceThen == null || priceThen === 0) {
        const reason = priceNow == null ? "priceNow is null" : (priceThen == null ? "priceThen is null" : "priceThen is zero");
        if (auditContext) {
            auditTrendAnomaly(auditContext.itemId, auditContext.trendType, "unavailable", nowTimestamp, targetTimestamp, matchedTimestamp, auditContext.source, reason);
        }
        return {
            value: null,
            status: "unavailable",
            nowTimestamp,
            targetTimestamp,
            matchedTimestamp
        };
    }
    
    // Safeguard 1: If price_then < 10, force unavailable (prevents extreme trends from very low prices)
    if (priceThen < 10) {
        const reason = "price-too-low";
        if (auditContext) {
            auditTrendAnomaly(auditContext.itemId, auditContext.trendType, "unavailable", nowTimestamp, targetTimestamp, matchedTimestamp, auditContext.source, reason);
        }
        return {
            value: null,
            status: "unavailable",
            nowTimestamp,
            targetTimestamp,
            matchedTimestamp
        };
    }
    
    // Calculate trend
    const trend = ((priceNow - priceThen) / priceThen) * 100;
    
    // Safeguard 2: Cap trend values to MAX_TREND = 100000 (±100,000%)
    const MAX_TREND = 100000;
    const cappedTrend = Math.max(-MAX_TREND, Math.min(MAX_TREND, trend));
    
    // Log if capping occurred (this is a safeguard, not an anomaly, but worth logging)
    // Only log if explicitly enabled via environment variable
    if (cappedTrend !== trend && auditContext && process.env.ENABLE_TREND_AUDIT_LOGS === 'true') {
        console.log(`[TREND-CAP] ${auditContext.trendType} for item ${auditContext.itemId}: ${trend.toFixed(2)}% capped to ${cappedTrend.toFixed(2)}%`);
    }
    
    return {
        value: cappedTrend,
        status: "valid",
        nowTimestamp,
        targetTimestamp,
        matchedTimestamp
    };
}

/**
 * Calculate 1H trend using ONLY 5-minute candles (PHASE 1)
 * 
 * @param {Array<number>} itemIds - Array of item IDs
 * @param {number} now - Current system timestamp (for query bounds)
 * @returns {Promise<Map<number, number | null>>} - Map of itemId -> trend_1h value or null
 */
async function calculate1HTrendFrom5mCandles(itemIds, now) {
    if (itemIds.length === 0) return new Map();
    
    const periodSeconds = 60 * 60; // 1 hour in seconds
    const toleranceSeconds = 5 * 60; // ±5 minutes in seconds
    
    // Fetch all 5m candles for these items within a reasonable window
    // We need candles from (now - 2 hours) to now to ensure we have latest + target
    const windowStart = now - (2 * 60 * 60); // 2 hours ago
    const windowEnd = now;
    
    const result = await db.query(`
        SELECT 
            item_id,
            timestamp,
            avg_high,
            avg_low
        FROM price_5m
        WHERE item_id = ANY($1)
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY item_id, timestamp DESC
    `, [itemIds, windowStart, windowEnd]);
    
    // Group candles by item_id
    const candlesByItem = new Map();
    for (const row of result.rows) {
        if (!candlesByItem.has(row.item_id)) {
            candlesByItem.set(row.item_id, []);
        }
        candlesByItem.get(row.item_id).push({
            timestamp: row.timestamp, // Keep in seconds (database format)
            avg_high: row.avg_high,
            avg_low: row.avg_low
        });
    }
    
    // Calculate trend for each item (PHASE 5C - cache timestamps per batch)
    const trendMap = new Map();
    for (const itemId of itemIds) {
        const candles = candlesByItem.get(itemId) || [];
        const auditContext = { itemId, trendType: "1H", source: "5m" };
        const trendResult = calculateTrendFromCandles(candles, periodSeconds, toleranceSeconds, auditContext);
        
        // Audit log for unavailable status
        if (trendResult.status === "unavailable" && auditContext) {
            auditTrendAnomaly(auditContext.itemId, auditContext.trendType, "unavailable", 
                trendResult.nowTimestamp, trendResult.targetTimestamp, trendResult.matchedTimestamp, 
                auditContext.source, "No valid trend calculated");
        }
        
        trendMap.set(itemId, trendResult.status === "valid" ? trendResult.value : null);
    }
    
    return trendMap;
}

/**
 * Calculate 6H trend using ONLY 5-minute candles (PHASE 2)
 * 
 * @param {Array<number>} itemIds - Array of item IDs
 * @param {number} now - Current system timestamp (for query bounds)
 * @returns {Promise<Map<number, number | null>>} - Map of itemId -> trend_6h value or null
 */
async function calculate6HTrendFrom5mCandles(itemIds, now) {
    if (itemIds.length === 0) return new Map();
    
    const periodSeconds = 6 * 60 * 60; // 6 hours in seconds
    const toleranceSeconds = 20 * 60; // ±20 minutes in seconds
    
    // Fetch all 5m candles for these items within a reasonable window
    // We need candles from (now - 8 hours) to now to ensure we have latest + target
    const windowStart = now - (8 * 60 * 60); // 8 hours ago
    const windowEnd = now;
    
    const result = await db.query(`
        SELECT 
            item_id,
            timestamp,
            avg_high,
            avg_low
        FROM price_5m
        WHERE item_id = ANY($1)
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY item_id, timestamp DESC
    `, [itemIds, windowStart, windowEnd]);
    
    // Group candles by item_id
    const candlesByItem = new Map();
    for (const row of result.rows) {
        if (!candlesByItem.has(row.item_id)) {
            candlesByItem.set(row.item_id, []);
        }
        candlesByItem.get(row.item_id).push({
            timestamp: row.timestamp, // Keep in seconds (database format)
            avg_high: row.avg_high,
            avg_low: row.avg_low
        });
    }
    
    // Calculate trend for each item (PHASE 5C - cache timestamps per batch)
    const trendMap = new Map();
    for (const itemId of itemIds) {
        const candles = candlesByItem.get(itemId) || [];
        const auditContext = { itemId, trendType: "6H", source: "5m" };
        const trendResult = calculateTrendFromCandles(candles, periodSeconds, toleranceSeconds, auditContext);
        
        // Audit log for unavailable status
        if (trendResult.status === "unavailable" && auditContext) {
            auditTrendAnomaly(auditContext.itemId, auditContext.trendType, "unavailable", 
                trendResult.nowTimestamp, trendResult.targetTimestamp, trendResult.matchedTimestamp, 
                auditContext.source, "No valid trend calculated");
        }
        
        trendMap.set(itemId, trendResult.status === "valid" ? trendResult.value : null);
    }
    
    return trendMap;
}

/**
 * Calculate 24H trend with controlled fallback (PHASE 3 + PHASE 4)
 * Primary: 5m candles (status: "valid"), Fallback: 1h candles (status: "stale")
 * 
 * @param {Array<number>} itemIds - Array of item IDs
 * @param {number} now - Current system timestamp (for query bounds)
 * @returns {Promise<Map<number, {value: number | null, status: string}>>} - Map of itemId -> {value, status}
 */
async function calculate24HTrendWithFallback(itemIds, now) {
    if (itemIds.length === 0) return new Map();
    
    const periodSeconds = 24 * 60 * 60; // 24 hours in seconds
    const toleranceSeconds = 60 * 60; // ±1 hour in seconds
    
    // Fetch all 5m candles for these items (primary attempt)
    const windowStart5m = now - (26 * 60 * 60); // 26 hours ago (24h + 2h buffer)
    const windowEnd = now;
    
    const result5m = await db.query(`
        SELECT 
            item_id,
            timestamp,
            avg_high,
            avg_low
        FROM price_5m
        WHERE item_id = ANY($1)
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY item_id, timestamp DESC
    `, [itemIds, windowStart5m, windowEnd]);
    
    // Group 5m candles by item_id
    const candles5mByItem = new Map();
    for (const row of result5m.rows) {
        if (!candles5mByItem.has(row.item_id)) {
            candles5mByItem.set(row.item_id, []);
        }
        candles5mByItem.get(row.item_id).push({
            timestamp: row.timestamp,
            avg_high: row.avg_high,
            avg_low: row.avg_low
        });
    }
    
    // Try primary (5m) for each item
    const trendMap = new Map();
    const itemsNeedingFallback = [];
    
    for (const itemId of itemIds) {
        const candles5m = candles5mByItem.get(itemId) || [];
        const auditContext = { itemId, trendType: "24H", source: "5m" };
        const trendResult = calculateTrendFromCandles(candles5m, periodSeconds, toleranceSeconds, auditContext);
        
        if (trendResult.status === "valid") {
            // Found via 5m candles → status: "valid"
            trendMap.set(itemId, { value: trendResult.value, status: "valid" });
        } else {
            // Mark for fallback
            itemsNeedingFallback.push(itemId);
            trendMap.set(itemId, { value: null, status: "unavailable" }); // Temporary, will be overwritten if fallback succeeds
        }
    }
    
    // Fallback: Try 1h candles for items that failed primary
    if (itemsNeedingFallback.length > 0) {
        const windowStart1h = now - (26 * 60 * 60); // 26 hours ago
        const result1h = await db.query(`
            SELECT 
                item_id,
                timestamp,
                avg_high,
                avg_low
            FROM price_1h
            WHERE item_id = ANY($1)
              AND timestamp >= $2
              AND timestamp <= $3
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        `, [itemsNeedingFallback, windowStart1h, windowEnd]);
        
        // Group 1h candles by item_id
        const candles1hByItem = new Map();
        for (const row of result1h.rows) {
            if (!candles1hByItem.has(row.item_id)) {
                candles1hByItem.set(row.item_id, []);
            }
            candles1hByItem.get(row.item_id).push({
                timestamp: row.timestamp,
                avg_high: row.avg_high,
                avg_low: row.avg_low
            });
        }
        
        // Try fallback (1h) for items that failed primary
        for (const itemId of itemsNeedingFallback) {
            const candles1h = candles1hByItem.get(itemId) || [];
            const auditContext = { itemId, trendType: "24H", source: "1h (fallback)" };
            const trendResult = calculateTrendFromCandles(candles1h, periodSeconds, toleranceSeconds, auditContext);
            
            if (trendResult.status === "valid") {
                // Found via 1h fallback → status: "stale"
                trendMap.set(itemId, { value: trendResult.value, status: "stale" });
                // Audit log for stale status (PHASE 5B)
                auditTrendAnomaly(auditContext.itemId, auditContext.trendType, "stale", 
                    trendResult.nowTimestamp, trendResult.targetTimestamp, trendResult.matchedTimestamp, 
                    auditContext.source, "Fallback to 1h candles used");
            } else {
                // Still unavailable
                trendMap.set(itemId, { value: null, status: "unavailable" });
                // Audit log already handled in calculateTrendFromCandles
            }
        }
    }
    
    return trendMap;
}

/**
 * Calculate all trends for a batch of items using optimized bulk queries
 * Uses bulk queries per granularity instead of per-item LATERAL joins for massive performance gains
 * 
 * @param {Array<number>} itemIds - Array of item IDs
 * @param {number} now - Current timestamp
 * @returns {Promise<Map<number, Object>>} - Map of itemId -> {trend_5m, trend_1h, trend_6h, trend_24h, trend_1w, trend_1m, trend_3m, trend_1y}
 */
/**
 * Strategy 2: Latest Timestamp Caching
 * Cache latest timestamps once and reuse in LATERAL joins to avoid redundant DISTINCT ON queries
 */
async function calculateBatchTrendsWithCaching(itemIds, now) {
    const startTime = Date.now();
    if (itemIds.length === 0) return new Map();
    
    const fiveMinutesAgo = now - 300;
    const oneHourAgo = now - 3600;
    const sixHoursAgo = now - 21600;
    const twentyFourHoursAgo = now - 86400;
    const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
    const ninetyDaysInSeconds = 90 * 24 * 60 * 60;
    const oneYearInSeconds = 365 * 24 * 60 * 60;
    const oneWeekInSeconds = 7 * 24 * 60 * 60;
    
    // Step 1: Fetch all latest timestamps ONCE and cache them
    const latestTimestamps = await db.query(`
        SELECT 'latest_5m' AS type, item_id, timestamp AS latest_ts, (avg_high + avg_low) / 2.0 AS mid
        FROM (
            SELECT DISTINCT ON (item_id) item_id, timestamp, avg_high, avg_low
            FROM price_5m
            WHERE item_id = ANY($1) AND timestamp >= $2 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        ) t
        UNION ALL
        SELECT 'latest_6h' AS type, item_id, timestamp AS latest_ts, (avg_high + avg_low) / 2.0 AS mid
        FROM (
            SELECT DISTINCT ON (item_id) item_id, timestamp, avg_high, avg_low
            FROM price_6h
            WHERE item_id = ANY($1) AND timestamp >= $3 AND timestamp <= $4 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        ) t
        UNION ALL
        SELECT 'first_1h' AS type, item_id, timestamp AS first_ts, (avg_high + avg_low) / 2.0 AS mid
        FROM (
            SELECT DISTINCT ON (item_id) item_id, timestamp, avg_high, avg_low
            FROM price_1h
            WHERE item_id = ANY($1) AND timestamp >= $5 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp ASC
        ) t
        UNION ALL
        SELECT 'latest_24h' AS type, item_id, timestamp AS latest_ts, (avg_high + avg_low) / 2.0 AS mid
        FROM (
            SELECT DISTINCT ON (item_id) item_id, timestamp, avg_high, avg_low
            FROM price_24h
            WHERE item_id = ANY($1) AND timestamp >= $6 AND timestamp <= $4 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        ) t
    `, [itemIds, fiveMinutesAgo, sixHoursAgo, now, oneHourAgo, twentyFourHoursAgo]);
    
    // Cache latest timestamps and mid prices
    const latest5mMap = new Map();
    const latest6hMap = new Map();
    const first1hMap = new Map();
    const latest24hMap = new Map();
    const latest5mTimestamps = new Map();
    const latest6hTimestamps = new Map();
    const first1hTimestamps = new Map();
    const latest24hTimestamps = new Map();
    
    for (const row of latestTimestamps.rows) {
        const data = { timestamp: row.latest_ts || row.first_ts, mid: parseFloat(row.mid) };
        if (row.type === 'latest_5m') {
            latest5mMap.set(row.item_id, data);
            latest5mTimestamps.set(row.item_id, row.latest_ts);
        } else if (row.type === 'latest_6h') {
            latest6hMap.set(row.item_id, data);
            latest6hTimestamps.set(row.item_id, row.latest_ts);
        } else if (row.type === 'first_1h') {
            first1hMap.set(row.item_id, data);
            first1hTimestamps.set(row.item_id, row.first_ts);
        } else if (row.type === 'latest_24h') {
            latest24hMap.set(row.item_id, data);
            latest24hTimestamps.set(row.item_id, row.latest_ts);
        }
    }
    
    // Step 2: Query for previous points
    // Note: We still need to do DISTINCT ON in CTEs, but the indexes should make this fast
    // The optimization here is that we've already fetched latest points once, reducing overall query count
    const allPreviousData = await db.query(`
        WITH latest_5m AS (
            SELECT DISTINCT ON (item_id) item_id, timestamp AS latest_ts
            FROM price_5m
            WHERE item_id = ANY($1) AND timestamp >= $2 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        ),
        latest_6h AS (
            SELECT DISTINCT ON (item_id) item_id, timestamp AS latest_ts
            FROM price_6h
            WHERE item_id = ANY($1) AND timestamp >= $3 AND timestamp <= $4 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        ),
        first_1h AS (
            SELECT DISTINCT ON (item_id) item_id, timestamp AS first_ts
            FROM price_1h
            WHERE item_id = ANY($1) AND timestamp >= $5 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp ASC
        ),
        latest_24h AS (
            SELECT DISTINCT ON (item_id) item_id, timestamp AS latest_ts
            FROM price_24h
            WHERE item_id = ANY($1) AND timestamp >= $6 AND timestamp <= $4 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        )
        SELECT 'prev_5m' AS type, l.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM latest_5m l
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_5m
            WHERE item_id = l.item_id AND timestamp <= l.latest_ts - 300 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC LIMIT 1
        ) p
        UNION ALL
        SELECT 'prev_1h' AS type, l.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM latest_5m l
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_5m
            WHERE item_id = l.item_id AND timestamp <= l.latest_ts - 3600 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC LIMIT 1
        ) p
        UNION ALL
        SELECT 'prev_6h' AS type, l.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM latest_5m l
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_5m
            WHERE item_id = l.item_id AND timestamp <= l.latest_ts - 21600 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC LIMIT 1
        ) p
        UNION ALL
        SELECT 'prev_24h' AS type, l.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM latest_5m l
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_5m
            WHERE item_id = l.item_id AND timestamp <= l.latest_ts - 86400 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC LIMIT 1
        ) p
        UNION ALL
        SELECT 'prev_1m' AS type, l.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM latest_6h l
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_6h
            WHERE item_id = l.item_id AND ABS(timestamp - (l.latest_ts - $7)) <= 21600 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY ABS(timestamp - (l.latest_ts - $7)) ASC, timestamp DESC LIMIT 1
        ) p
        UNION ALL
        SELECT 'prev_1w' AS type, f.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM first_1h f
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_1h
            WHERE item_id = f.item_id AND ABS(timestamp - (f.first_ts - $8)) <= 3600 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY ABS(timestamp - (f.first_ts - $8)) ASC, timestamp DESC LIMIT 1
        ) p
        UNION ALL
        SELECT 'prev_3m' AS type, l.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM latest_24h l
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_24h
            WHERE item_id = l.item_id AND ABS(timestamp - (l.latest_ts - $9)) <= 86400 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY ABS(timestamp - (l.latest_ts - $9)) ASC, timestamp DESC LIMIT 1
        ) p
        UNION ALL
        SELECT 'prev_1y' AS type, l.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM latest_24h l
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_24h
            WHERE item_id = l.item_id AND ABS(timestamp - (l.latest_ts - $10)) <= 86400 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY ABS(timestamp - (l.latest_ts - $10)) ASC, timestamp DESC LIMIT 1
        ) p
    `, [itemIds, fiveMinutesAgo, sixHoursAgo, now, oneHourAgo, twentyFourHoursAgo, thirtyDaysInSeconds, oneWeekInSeconds, ninetyDaysInSeconds, oneYearInSeconds]);
    
    // Organize previous points
    const prev5mMap = new Map();
    const prev1hMap = new Map();
    const prev6hMap = new Map();
    const prev24hMap = new Map();
    const prev1mMap = new Map();
    const prev1wMap = new Map();
    const prev3mMap = new Map();
    const prev1yMap = new Map();
    
    for (const row of allPreviousData.rows) {
        const mid = parseFloat(row.mid);
        if (row.type === 'prev_5m') prev5mMap.set(row.item_id, { mid });
        else if (row.type === 'prev_1h') prev1hMap.set(row.item_id, { mid });
        else if (row.type === 'prev_6h') prev6hMap.set(row.item_id, { mid });
        else if (row.type === 'prev_24h') prev24hMap.set(row.item_id, { mid });
        else if (row.type === 'prev_1m') prev1mMap.set(row.item_id, { mid });
        else if (row.type === 'prev_1w') prev1wMap.set(row.item_id, { mid });
        else if (row.type === 'prev_3m') prev3mMap.set(row.item_id, { mid });
        else if (row.type === 'prev_1y') prev1yMap.set(row.item_id, { mid });
    }
    
    // Calculate trends (same as baseline)
    const trendMap = new Map();
    const windows = {
        '5m': { length: 300, strict: false },
        '1h': { length: 3600, strict: false },
        '6h': { length: 21600, strict: false },
        '24h': { length: 86400, strict: false },
        '1w': { length: 604800, strict: false },
        '1m': { length: 2592000, strict: false },
        '3m': { length: 7776000, strict: false },
        '1y': { length: 31536000, strict: true }
    };
    
    for (const itemId of itemIds) {
        const trends = {};
        
        for (const trendName of Object.keys(windows)) {
            if (trendName === '5m') {
                const latest = latest5mMap.get(itemId);
                const prev = prev5mMap.get(itemId);
                if (latest && prev && prev.mid !== 0) {
                    trends.trend_5m = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_5m = null;
                }
            } else if (trendName === '1h') {
                const latest = latest5mMap.get(itemId);
                const prev = prev1hMap.get(itemId);
                if (latest && prev && prev.mid !== 0) {
                    trends.trend_1h = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_1h = null;
                }
            } else if (trendName === '6h') {
                const latest = latest5mMap.get(itemId);
                const prev = prev6hMap.get(itemId);
                if (latest && prev && prev.mid !== 0) {
                    trends.trend_6h = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_6h = null;
                }
            } else if (trendName === '24h') {
                const latest = latest5mMap.get(itemId);
                const prev = prev24hMap.get(itemId);
                if (latest && prev && prev.mid !== 0) {
                    trends.trend_24h = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_24h = null;
                }
            } else if (trendName === '1m') {
                const latest = latest6hMap.get(itemId);
                const prev = prev1mMap.get(itemId);
                if (latest && prev && prev.mid !== 0) {
                    trends.trend_1m = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_1m = null;
                }
            } else if (trendName === '1w') {
                const first = first1hMap.get(itemId);
                const prev = prev1wMap.get(itemId);
                if (first && prev && prev.mid !== 0) {
                    trends.trend_1w = parseFloat((100.0 * (first.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_1w = null;
                }
            } else if (trendName === '3m') {
                const latest = latest24hMap.get(itemId);
                const prev = prev3mMap.get(itemId);
                if (latest && prev && prev.mid !== 0) {
                    trends.trend_3m = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_3m = null;
                }
            } else if (trendName === '1y') {
                const latest = latest24hMap.get(itemId);
                const prev = prev1yMap.get(itemId);
                if (latest && prev && prev.mid !== 0) {
                    trends.trend_1y = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_1y = null;
                }
            }
        }
        trendMap.set(itemId, trends);
    }
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const itemCount = itemIds.length;
    const itemsPerSec = (itemCount / parseFloat(elapsedTime)).toFixed(0);
    console.log(`[PERF] calculateBatchTrends (cached): ${itemCount} items in ${elapsedTime}s → ${itemsPerSec}/sec`);
    
    return trendMap;
}

async function calculateBatchTrends(itemIds, now) {
    const startTime = Date.now();
    if (itemIds.length === 0) return new Map();
    
    // Note: trend_1h is now calculated using first vs last point in 1h window (same as graph)
    // No longer using calculate1HTrendFrom5mCandles to ensure consistency with graph display
    
    // Trend window definitions (in seconds)
    // NOTE: '1h' and '1w' are excluded from this loop as they're calculated separately above
    // NOTE: '6h' and '24h' are now calculated in the loop like '5m' and '1h' for consistency
    const windows = {
        '5m': { length: 300, strict: false },
        '1h': { length: 3600, strict: false }, // Used for first vs last point calculation
        '6h': { length: 21600, strict: false }, // Used for first vs last point calculation
        // '24h': { length: 86400, strict: false }, // Calculated separately using calculate24HTrendWithFallback
        // '7d': { length: 604800, strict: false }, // Calculated separately using calculate7DTrendFrom1hCandles
        '24h': { length: 86400, strict: false },
        '1w': { length: 604800, strict: false }, // 1 week in seconds (calculated separately)
        '1m': { length: 2592000, strict: false },
        '3m': { length: 7776000, strict: false },
        '1y': { length: 31536000, strict: true }
    };
    
    // Granularity-specific tolerances
    const granularityTolerances = {
        '5m': 0,
        '1h': 300,
        '6h': 900,
        '24h': 3600
    };
    
    // Fallback tolerances for longer trends
    const fallbackTolerances = {
        '7d': 7200,
        '1m': 21600,
        '3m': 64800,
        '1y': 86400
    };
    
    // Calculate all target timestamps we need
    const targets = [];
    for (const [trendName, window] of Object.entries(windows)) {
        targets.push({
            trendName,
            type: 'end',
            timestamp: now,
            window
        });
        targets.push({
            trendName,
            type: 'start',
            timestamp: now - window.length,
            window
        });
    }
    
    // Common expressions
    const midExpr = `CASE 
        WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
        WHEN avg_high IS NOT NULL THEN avg_high
        WHEN avg_low IS NOT NULL THEN avg_low
        ELSE NULL
    END AS mid_price`;
    
    const priorityExpr = `CASE 
        WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN 1
        WHEN avg_high IS NOT NULL THEN 2
        WHEN avg_low IS NOT NULL THEN 3
        ELSE NULL
    END AS priority`;
    
    // Fetch prices in bulk for each granularity and target combination
    // This is much faster than per-item LATERAL joins
    // Process targets in parallel within each granularity for maximum throughput
    // Process granularities sequentially (finer first) to ensure proper precedence
    const priceMap = new Map(); // Map<`${itemId}_${trendName}_${type}`, price>
    
    const granularities = [
        { name: 'price_5m', tolerance: granularityTolerances['5m'] },
        { name: 'price_1h', tolerance: granularityTolerances['1h'] },
        { name: 'price_6h', tolerance: granularityTolerances['6h'] },
        { name: 'price_24h', tolerance: granularityTolerances['24h'] }
    ];
    
    // Process each granularity sequentially (finer granularities take precedence)
    // But process all targets for each granularity in parallel
    for (const gran of granularities) {
        // Process all targets for this granularity
        const queryPromises = targets.map(async (target) => {
            const isLongTrend = ['7d', '1m', '3m', '1y'].includes(target.trendName);
            const tolerance = isLongTrend && gran.name !== 'price_5m' 
                ? fallbackTolerances[target.trendName] 
                : gran.tolerance;
            
            const is5m = gran.name === 'price_5m';
            const isStrict = target.window.strict;
            const isExact = is5m && target.trendName === '5m';
            
            // Build query to fetch prices for all items at once
            let query;
            let params;
            
            if (isExact) {
                // Exact match for 5m
                // For 'start' type, use ASC to get first point; for 'end' type, use DESC to get latest
                const timestampOrder = target.type === 'start' ? 'ASC' : 'DESC';
                query = `
                    SELECT DISTINCT ON (item_id)
                        item_id,
                        ${midExpr},
                        ${priorityExpr},
                        timestamp
                    FROM ${gran.name}
                    WHERE item_id = ANY($1)
                      AND timestamp = $2
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY item_id, priority ASC, timestamp ${timestampOrder}
                `;
                params = [itemIds, target.timestamp];
            } else if (isStrict) {
                // Strict window (1y only)
                const windowStart = now - target.window.length;
                const windowEnd = now;
                // For 'start' type, use ASC to get first point in window; for 'end' type, use DESC to get latest
                const timestampOrder = target.type === 'start' ? 'ASC' : 'DESC';
                query = `
                    SELECT DISTINCT ON (item_id)
                        item_id,
                        ${midExpr},
                        ${priorityExpr},
                        timestamp
                    FROM ${gran.name}
                    WHERE item_id = ANY($1)
                      AND timestamp >= $2
                      AND timestamp <= $3
                      AND ABS(timestamp - $4) <= $5
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY item_id, priority ASC, ABS(timestamp - $4) ASC, timestamp ${timestampOrder}
                `;
                params = [itemIds, windowStart, windowEnd, target.timestamp, tolerance];
            } else {
                // Tolerance-based search
                // For 'start' type, use ASC to get first point in window; for 'end' type, use DESC to get latest
                const timestampOrder = target.type === 'start' ? 'ASC' : 'DESC';
                query = `
                    SELECT DISTINCT ON (item_id)
                        item_id,
                        ${midExpr},
                        ${priorityExpr},
                        timestamp
                    FROM ${gran.name}
                    WHERE item_id = ANY($1)
                      AND ABS(timestamp - $2) <= $3
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY item_id, priority ASC, ABS(timestamp - $2) ASC, timestamp ${timestampOrder}
                `;
                params = [itemIds, target.timestamp, tolerance];
            }
            
            try {
                const { rows } = await db.query(query, params);
                const results = [];
                for (const row of rows) {
                    const key = `${row.item_id}_${target.trendName}_${target.type}`;
                    results.push({ key, price: row.mid_price });
                }
                return results;
            } catch (err) {
                // Continue on error, price will remain NULL
                return [];
            }
        });
        
        // Wait for all queries for this granularity to complete
        const allResults = await Promise.all(queryPromises);
        
        // Merge results into priceMap (finer granularities take precedence)
        for (const results of allResults) {
            for (const { key, price } of results) {
                if (!priceMap.has(key)) {
                    priceMap.set(key, price);
                }
            }
        }
        
        // Now do EIS queries for missing prices (in parallel)
        const eisPromises = targets.map(async (target) => {
            const isLongTrend = ['7d', '1m', '3m', '1y'].includes(target.trendName);
            // Skip EIS for fine granularities on long trends (except 7d)
            if (isLongTrend && target.trendName !== '7d' && (gran.name === 'price_5m' || gran.name === 'price_1h')) {
                return [];
            }
            
            // Check which items still need prices
            const missingIds = itemIds.filter(id => {
                const key = `${id}_${target.trendName}_${target.type}`;
                return !priceMap.has(key);
            });
            
            if (missingIds.length === 0) return [];
            
            const windowStart = now - target.window.length;
            const windowEnd = now;
            const maxExtended = Math.floor(target.window.length * 0.20);
            
            // For 'start' type, use ASC to get first point in window; for 'end' type, use DESC to get latest
            const timestampOrder = target.type === 'start' ? 'ASC' : 'DESC';
            const eisQuery = `
                SELECT DISTINCT ON (item_id)
                    item_id,
                    ${midExpr},
                    ${priorityExpr},
                    timestamp
                FROM ${gran.name}
                WHERE item_id = ANY($1)
                  AND timestamp >= $2
                  AND timestamp <= $3
                  AND ABS(timestamp - $4) <= $5
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY item_id, priority ASC, ABS(timestamp - $4) ASC, timestamp ${timestampOrder}
            `;
            const eisParams = [missingIds, windowStart, windowEnd, target.timestamp, maxExtended];
            
            try {
                const { rows } = await db.query(eisQuery, eisParams);
                const results = [];
                for (const row of rows) {
                    const key = `${row.item_id}_${target.trendName}_${target.type}`;
                    results.push({ key, price: row.mid_price });
                }
                return results;
            } catch (err) {
                return [];
            }
        });
        
        // Wait for all EIS queries and merge results
        const allEisResults = await Promise.all(eisPromises);
        for (const results of allEisResults) {
            for (const { key, price } of results) {
                if (!priceMap.has(key)) {
                    priceMap.set(key, price);
                }
            }
        }
    }
    
    // OPTIMIZED: Efficient LATERAL joins - proven to be fastest approach
    // Uses 3 queries total: 1 for latest points, 2 parallel for previous points
    // LATERAL joins are actually very efficient when properly indexed
    
    const fiveMinutesAgo = now - 300;
    const oneHourAgo = now - 3600;
    const sixHoursAgo = now - 21600;
    const twentyFourHoursAgo = now - 86400;
    const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
    const ninetyDaysInSeconds = 90 * 24 * 60 * 60;
    const oneYearInSeconds = 365 * 24 * 60 * 60;
    const oneWeekInSeconds = 7 * 24 * 60 * 60;
    
    // Query 1: Fetch all latest/first points in one efficient UNION ALL query
    const allLatestData = await db.query(`
        SELECT 'latest_5m' AS type, item_id, timestamp, (avg_high + avg_low) / 2.0 AS mid
        FROM (
            SELECT DISTINCT ON (item_id) item_id, timestamp, avg_high, avg_low
            FROM price_5m
            WHERE item_id = ANY($1) AND timestamp >= $2 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        ) t
        UNION ALL
        SELECT 'latest_6h' AS type, item_id, timestamp, (avg_high + avg_low) / 2.0 AS mid
        FROM (
            SELECT DISTINCT ON (item_id) item_id, timestamp, avg_high, avg_low
            FROM price_6h
            WHERE item_id = ANY($1) AND timestamp >= $3 AND timestamp <= $4 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        ) t
        UNION ALL
        SELECT 'first_1h' AS type, item_id, timestamp, (avg_high + avg_low) / 2.0 AS mid
        FROM (
            SELECT DISTINCT ON (item_id) item_id, timestamp, avg_high, avg_low
            FROM price_1h
            WHERE item_id = ANY($1) AND timestamp >= $5 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp ASC
        ) t
        UNION ALL
        SELECT 'latest_24h' AS type, item_id, timestamp, (avg_high + avg_low) / 2.0 AS mid
        FROM (
            SELECT DISTINCT ON (item_id) item_id, timestamp, avg_high, avg_low
            FROM price_24h
            WHERE item_id = ANY($1) AND timestamp >= $6 AND timestamp <= $4 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        ) t
    `, [itemIds, fiveMinutesAgo, sixHoursAgo, now, oneHourAgo, twentyFourHoursAgo]);
    
    // Organize latest points
    const latest5mMap = new Map();
    const latest6hMap = new Map();
    const first1hMap = new Map();
    const latest24hMap = new Map();
    
    for (const row of allLatestData.rows) {
        const data = { timestamp: row.timestamp, mid: parseFloat(row.mid) };
        if (row.type === 'latest_5m') latest5mMap.set(row.item_id, data);
        else if (row.type === 'latest_6h') latest6hMap.set(row.item_id, data);
        else if (row.type === 'first_1h') first1hMap.set(row.item_id, data);
        else if (row.type === 'latest_24h') latest24hMap.set(row.item_id, data);
    }
    
    // Query 2: Single optimized query for ALL previous points - reduces to 2 queries total
    // Removed timestamp from SELECT (only need mid price) and optimized LATERAL joins
    const allPreviousData = await db.query(`
        WITH latest_5m AS (
            SELECT DISTINCT ON (item_id) item_id, timestamp AS latest_ts
            FROM price_5m
            WHERE item_id = ANY($1) AND timestamp >= $2 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        ),
        latest_6h AS (
            SELECT DISTINCT ON (item_id) item_id, timestamp AS latest_ts
            FROM price_6h
            WHERE item_id = ANY($1) AND timestamp >= $3 AND timestamp <= $4 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        ),
        first_1h AS (
            SELECT DISTINCT ON (item_id) item_id, timestamp AS first_ts
            FROM price_1h
            WHERE item_id = ANY($1) AND timestamp >= $5 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp ASC
        ),
        latest_24h AS (
            SELECT DISTINCT ON (item_id) item_id, timestamp AS latest_ts
            FROM price_24h
            WHERE item_id = ANY($1) AND timestamp >= $6 AND timestamp <= $4 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY item_id, timestamp DESC
        )
        SELECT 'prev_5m' AS type, l.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM latest_5m l
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_5m
            WHERE item_id = l.item_id AND timestamp <= l.latest_ts - 300 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC LIMIT 1
        ) p
        UNION ALL
        SELECT 'prev_1h' AS type, l.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM latest_5m l
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_5m
            WHERE item_id = l.item_id AND timestamp <= l.latest_ts - 3600 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC LIMIT 1
        ) p
        UNION ALL
        SELECT 'prev_6h' AS type, l.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM latest_5m l
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_5m
            WHERE item_id = l.item_id AND timestamp <= l.latest_ts - 21600 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC LIMIT 1
        ) p
        UNION ALL
        SELECT 'prev_24h' AS type, l.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM latest_5m l
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_5m
            WHERE item_id = l.item_id AND timestamp <= l.latest_ts - 86400 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC LIMIT 1
        ) p
        UNION ALL
        SELECT 'prev_1m' AS type, l.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM latest_6h l
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_6h
            WHERE item_id = l.item_id AND ABS(timestamp - (l.latest_ts - $7)) <= 21600 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY ABS(timestamp - (l.latest_ts - $7)) ASC, timestamp DESC LIMIT 1
        ) p
        UNION ALL
        SELECT 'prev_1w' AS type, f.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM first_1h f
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_1h
            WHERE item_id = f.item_id AND ABS(timestamp - (f.first_ts - $8)) <= 3600 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY ABS(timestamp - (f.first_ts - $8)) ASC, timestamp DESC LIMIT 1
        ) p
        UNION ALL
        SELECT 'prev_3m' AS type, l.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM latest_24h l
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_24h
            WHERE item_id = l.item_id AND ABS(timestamp - (l.latest_ts - $9)) <= 86400 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY ABS(timestamp - (l.latest_ts - $9)) ASC, timestamp DESC LIMIT 1
        ) p
        UNION ALL
        SELECT 'prev_1y' AS type, l.item_id, (p.avg_high + p.avg_low) / 2.0 AS mid
        FROM latest_24h l
        CROSS JOIN LATERAL (
            SELECT avg_high, avg_low FROM price_24h
            WHERE item_id = l.item_id AND ABS(timestamp - (l.latest_ts - $10)) <= 86400 AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY ABS(timestamp - (l.latest_ts - $10)) ASC, timestamp DESC LIMIT 1
        ) p
    `, [itemIds, fiveMinutesAgo, sixHoursAgo, now, oneHourAgo, twentyFourHoursAgo, thirtyDaysInSeconds, oneWeekInSeconds, ninetyDaysInSeconds, oneYearInSeconds]);
    
    // Organize previous points - optimized: only store mid price, no timestamp needed
    const prev5mMap = new Map();
    const prev1hMap = new Map();
    const prev6hMap = new Map();
    const prev24hMap = new Map();
    const prev1mMap = new Map();
    const prev1wMap = new Map();
    const prev3mMap = new Map();
    const prev1yMap = new Map();
    
    for (const row of allPreviousData.rows) {
        const mid = parseFloat(row.mid);
        if (row.type === 'prev_5m') prev5mMap.set(row.item_id, { mid });
        else if (row.type === 'prev_1h') prev1hMap.set(row.item_id, { mid });
        else if (row.type === 'prev_6h') prev6hMap.set(row.item_id, { mid });
        else if (row.type === 'prev_24h') prev24hMap.set(row.item_id, { mid });
        else if (row.type === 'prev_1m') prev1mMap.set(row.item_id, { mid });
        else if (row.type === 'prev_1w') prev1wMap.set(row.item_id, { mid });
        else if (row.type === 'prev_3m') prev3mMap.set(row.item_id, { mid });
        else if (row.type === 'prev_1y') prev1yMap.set(row.item_id, { mid });
    }
    
    // Calculate trends from the batched data
    const trendMap = new Map();
    for (const itemId of itemIds) {
        const trends = {};
        
        // Calculate trends using first vs last point in window (like the graph shows)
        // This ensures consistency between what's displayed in the graph and what's stored in canonical_items
        for (const trendName of Object.keys(windows)) {
            if (trendName === '5m') {
                // Use batched data: latest 5m point and previous 5m point (5 minutes before)
                const latest = latest5mMap.get(itemId);
                const prev = prev5mMap.get(itemId);
                if (latest && prev && prev.mid !== 0) {
                    trends.trend_5m = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_5m = null;
                }
            } else if (trendName === '1h') {
                // Use batched data: latest 5m point and previous 5m point (1 hour before)
                const latest = latest5mMap.get(itemId);
                const prev = prev1hMap.get(itemId);
                if (latest && prev && prev.mid !== 0) {
                    trends.trend_1h = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_1h = null;
                }
            } else if (trendName === '6h') {
                // Use batched data: latest 5m point and previous 5m point (6 hours before)
                const latest = latest5mMap.get(itemId);
                const prev = prev6hMap.get(itemId);
                if (latest && prev && prev.mid !== 0) {
                    trends.trend_6h = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_6h = null;
                }
            } else if (trendName === '24h') {
                // Use batched data: latest 5m point and previous 5m point (24 hours before)
                const latest = latest5mMap.get(itemId);
                const prev = prev24hMap.get(itemId);
                if (latest && prev && prev.mid !== 0) {
                    trends.trend_24h = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_24h = null;
                }
            } else if (trendName === '1m') {
                // Use batched data: latest 6h point and previous 6h point (30 days before)
                const latest = latest6hMap.get(itemId);
                const prev = prev1mMap.get(itemId);
                if (latest && prev && prev.mid !== 0) {
                    trends.trend_1m = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_1m = null;
                }
            } else if (trendName === '1w') {
                // Use batched data: first 1h point and previous 1h point (1 week before)
                const first = first1hMap.get(itemId);
                const prev = prev1wMap.get(itemId);
                if (first && prev && prev.mid !== 0) {
                    trends.trend_1w = parseFloat((100.0 * (first.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_1w = null;
                }
            } else if (trendName === '3m') {
                // Use batched data: latest 24h point and previous 24h point (90 days before)
                const latest = latest24hMap.get(itemId);
                const prev = prev3mMap.get(itemId);
                if (latest && prev && prev.mid !== 0) {
                    trends.trend_3m = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_3m = null;
                }
            } else if (trendName === '1y') {
                // Use batched data: latest 24h point and previous 24h point (365 days before)
                const latest = latest24hMap.get(itemId);
                const prev = prev1yMap.get(itemId);
                if (latest && prev && prev.mid !== 0) {
                    trends.trend_1y = parseFloat((100.0 * (latest.mid - prev.mid) / prev.mid).toFixed(2));
                } else {
                    trends.trend_1y = null;
                }
            } else {
                // For other trends, use the old method (start vs end with tolerance)
                const startKey = `${itemId}_${trendName}_start`;
                const endKey = `${itemId}_${trendName}_end`;
                const startPrice = priceMap.get(startKey);
                const endPrice = priceMap.get(endKey);
                
                if (startPrice == null || startPrice === 0 || endPrice == null) {
                    trends[`trend_${trendName}`] = null;
                } else {
                    trends[`trend_${trendName}`] = parseFloat((100.0 * (endPrice - startPrice) / startPrice).toFixed(2));
                }
            }
        }
        trendMap.set(itemId, trends);
    }
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const itemCount = itemIds.length;
    const itemsPerSec = (itemCount / parseFloat(elapsedTime)).toFixed(0);
    console.log(`[PERF] calculateBatchTrends: ${itemCount} items in ${elapsedTime}s → ${itemsPerSec}/sec`);
    
    return trendMap;
}

/**
 * Process a single batch of items and update canonical_items table
 * @param {Array} batch - Array of item objects
 * @param {number} batchNum - Batch number for logging
 * @param {number} totalBatches - Total number of batches
 * @param {number} now - Current timestamp
 * @returns {Promise<number>} - Number of items updated
 */
async function processBatch(batch, batchNum, totalBatches, now) {
    const itemIds = batch.map(item => item.id);
    
    await db.query("BEGIN");
    
    try {
        // Calculate trends for entire batch in one query
        const trendsMap = await calculateBatchTrendsWithCaching(itemIds, now);
        
        // BULK FETCH ALL DATA FOR THE BATCH - OPTIMIZED: Parallel queries for maximum throughput
        
        // Fetch all data in parallel: prices, volumes, aggregated prices, turnovers, buy/sell rates
        const [
                    allPricesResult,
                    vol5mRows,
                    volCombined5mRows,
                    vol7dRows,
                    vol1mRows,
                    volCombined24hRows,
                    price5mRows,
                    price1hRows,
                    price6hRows,
                    price24hRows,
                    price1wRows,
                    price1mRows,
                    priceCombined24hRows
                ] = await Promise.all([
                    // 1. Fetch latest price_instants for the batch
                    db.query(`
                        SELECT DISTINCT ON (item_id, type) item_id, price, timestamp, type
                        FROM price_instants
                        WHERE item_id = ANY($1)
                        ORDER BY item_id, type, timestamp DESC
                    `, [itemIds]),
                    // 2. Fetch all volumes for the batch - OPTIMIZED: Combined queries to reduce round trips
                    // Volume 5m (latest)
                    db.query(`
                        SELECT DISTINCT ON (item_id) item_id, volume
                        FROM price_5m
                        WHERE item_id = ANY($1)
                        ORDER BY item_id, timestamp DESC
                    `, [itemIds]),
                    // Combined: Volumes 1h, 6h, 24h from price_5m (single query with conditional aggregation)
                    db.query(`
                        SELECT 
                            item_id,
                            COALESCE(SUM(CASE WHEN timestamp >= $2 THEN volume ELSE 0 END), 0)::BIGINT AS vol_1h,
                            COALESCE(SUM(CASE WHEN timestamp >= $3 THEN volume ELSE 0 END), 0)::BIGINT AS vol_6h,
                            COALESCE(SUM(CASE WHEN timestamp >= $4 THEN volume ELSE 0 END), 0)::BIGINT AS vol_24h
                        FROM price_5m
                        WHERE item_id = ANY($1) AND timestamp >= $4
                        GROUP BY item_id
                    `, [itemIds, now - 3600, now - 21600, now - 86400]),
                    // Volume 7d (1w)
                    db.query(`
                        SELECT item_id, COALESCE(SUM(volume), 0)::BIGINT AS volume
                        FROM price_1h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 604800]),
                    // Volume 1m
                    db.query(`
                        SELECT item_id, COALESCE(SUM(volume), 0)::BIGINT AS volume
                        FROM price_6h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 2592000]),
                    // Combined: Volumes 3m, 1y from price_24h (single query with conditional aggregation)
                    db.query(`
                        SELECT 
                            item_id,
                            COALESCE(SUM(CASE WHEN timestamp >= $2 THEN volume ELSE 0 END), 0)::BIGINT AS vol_3m,
                            COALESCE(SUM(CASE WHEN timestamp >= $3 THEN volume ELSE 0 END), 0)::BIGINT AS vol_1y
                        FROM price_24h
                        WHERE item_id = ANY($1) AND timestamp >= $3
                        GROUP BY item_id
                    `, [itemIds, now - 7776000, now - 31536000]),
                    // 3. Fetch all prices from aggregated tables - OPTIMIZED: Combined queries where possible
                    // 5m: latest from price_5m
                    db.query(`
                        SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
                        FROM price_5m
                        WHERE item_id = ANY($1)
                        ORDER BY item_id, timestamp DESC
                    `, [itemIds]),
                    // 1h: latest from price_1h
                    db.query(`
                        SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
                        FROM price_1h
                        WHERE item_id = ANY($1)
                        ORDER BY item_id, timestamp DESC
                    `, [itemIds]),
                    // 6h: latest from price_6h (aggregated from 5m)
                    db.query(`
                        SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
                        FROM price_6h
                        WHERE item_id = ANY($1)
                        ORDER BY item_id, timestamp DESC
                    `, [itemIds]),
                    // 24h: latest from price_24h (aggregated from 5m)
                    db.query(`
                        SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
                        FROM price_24h
                        WHERE item_id = ANY($1)
                        ORDER BY item_id, timestamp DESC
                    `, [itemIds]),
                    // 1w (7d): latest from price_1h (aggregated from 1h)
                    db.query(`
                        SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
                        FROM price_1h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        ORDER BY item_id, timestamp DESC
                    `, [itemIds, now - 604800]),
                    // 1m: latest from price_6h (aggregated from 6h)
                    db.query(`
                        SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
                        FROM price_6h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        ORDER BY item_id, timestamp DESC
                    `, [itemIds, now - 2592000]),
                    // Combined: 3m, 1y from price_24h - use subqueries with UNION ALL
                    db.query(`
                        SELECT '3m' AS period, item_id, avg_high, avg_low
                        FROM (
                            SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
                            FROM price_24h
                            WHERE item_id = ANY($1) AND timestamp >= $2
                            ORDER BY item_id, timestamp DESC
                        ) AS t3m
                        UNION ALL
                        SELECT '1y' AS period, item_id, avg_high, avg_low
                        FROM (
                            SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
                            FROM price_24h
                            WHERE item_id = ANY($1) AND timestamp >= $3
                            ORDER BY item_id, timestamp DESC
                        ) AS t1y
                    `, [itemIds, now - 7776000, now - 31536000])
        ]);
        
        // OPTIMIZED: Pre-allocate Map and single-pass processing for prices
        const pricesByItem = new Map();
        for (const itemId of itemIds) {
            pricesByItem.set(itemId, {});
        }
        // Single-pass updates (no has() checks needed)
        for (const price of allPricesResult.rows) {
            const entry = pricesByItem.get(price.item_id);
            if (entry) {
                entry[price.type] = price;
            }
        }
        
        // OPTIMIZED: Organize volumes by item_id - single-pass processing from combined results
        const volumesByItem = new Map();
        // Pre-allocate entries for all itemIds
        for (const itemId of itemIds) {
            volumesByItem.set(itemId, {
                vol5m: 0,
                vol1h: 0,
                vol6h: 0,
                vol24h: 0,
                vol7d: 0,
                vol1m: 0,
                vol3m: 0,
                vol1y: 0
            });
        }
        // Single-pass updates from all volume sources (optimized: no intermediate arrays)
        for (const row of vol5mRows.rows) {
            const entry = volumesByItem.get(row.item_id);
            if (entry) entry.vol5m = row.volume;
        }
        for (const row of volCombined5mRows.rows) {
            const entry = volumesByItem.get(row.item_id);
            if (entry) {
                entry.vol1h = row.vol_1h || 0;
                entry.vol6h = row.vol_6h || 0;
                entry.vol24h = row.vol_24h || 0;
            }
        }
        for (const row of vol7dRows.rows) {
            const entry = volumesByItem.get(row.item_id);
            if (entry) entry.vol7d = row.volume || 0;
        }
        for (const row of vol1mRows.rows) {
            const entry = volumesByItem.get(row.item_id);
            if (entry) entry.vol1m = row.volume || 0;
        }
        for (const row of volCombined24hRows.rows) {
            const entry = volumesByItem.get(row.item_id);
            if (entry) {
                entry.vol3m = row.vol_3m || 0;
                entry.vol1y = row.vol_1y || 0;
            }
        }
        
        // OPTIMIZED: Pre-allocate Map and single-pass processing (no intermediate filter/map operations)
        const pricesAggByItem = new Map();
        for (const itemId of itemIds) {
            pricesAggByItem.set(itemId, {
                price5mHigh: null,
                price5mLow: null,
                price1hHigh: null,
                price1hLow: null,
                price6hHigh: null,
                price6hLow: null,
                price24hHigh: null,
                price24hLow: null,
                price1wHigh: null,
                price1wLow: null,
                price1mHigh: null,
                price1mLow: null,
                price3mHigh: null,
                price3mLow: null,
                price1yHigh: null,
                price1yLow: null
            });
        }
        // Single-pass updates (optimized: direct access, no intermediate arrays)
        for (const row of price5mRows.rows) {
            const entry = pricesAggByItem.get(row.item_id);
            if (entry) {
                entry.price5mHigh = row.avg_high || null;
                entry.price5mLow = row.avg_low || null;
            }
        }
        for (const row of price1hRows.rows) {
            const entry = pricesAggByItem.get(row.item_id);
            if (entry) {
                entry.price1hHigh = row.avg_high || null;
                entry.price1hLow = row.avg_low || null;
            }
        }
        for (const row of price6hRows.rows) {
            const entry = pricesAggByItem.get(row.item_id);
            if (entry) {
                entry.price6hHigh = row.avg_high || null;
                entry.price6hLow = row.avg_low || null;
            }
        }
        for (const row of price24hRows.rows) {
            const entry = pricesAggByItem.get(row.item_id);
            if (entry) {
                entry.price24hHigh = row.avg_high || null;
                entry.price24hLow = row.avg_low || null;
            }
        }
        for (const row of price1wRows.rows) {
            const entry = pricesAggByItem.get(row.item_id);
            if (entry) {
                entry.price1wHigh = row.avg_high || null;
                entry.price1wLow = row.avg_low || null;
            }
        }
        for (const row of price1mRows.rows) {
            const entry = pricesAggByItem.get(row.item_id);
            if (entry) {
                entry.price1mHigh = row.avg_high || null;
                entry.price1mLow = row.avg_low || null;
            }
        }
        // Process combined 3m/1y prices in single pass
        for (const row of priceCombined24hRows.rows) {
            const entry = pricesAggByItem.get(row.item_id);
            if (entry) {
                if (row.period === '3m') {
                    entry.price3mHigh = row.avg_high || null;
                    entry.price3mLow = row.avg_low || null;
                } else if (row.period === '1y') {
                    entry.price1yHigh = row.avg_high || null;
                    entry.price1yLow = row.avg_low || null;
                }
            }
        }
        
        // 4. Fetch all turnovers and buy/sell rates for the batch - OPTIMIZED: Combined queries to reduce round trips
        const midPriceExpr = `CASE 
            WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
            WHEN avg_high IS NOT NULL THEN avg_high
            WHEN avg_low IS NOT NULL THEN avg_low
            ELSE NULL
        END`;
        
        // Aggregation rules:
        // 5m, 1h, 6h, 24h: from price_5m (aggregated from 5m)
        // 7d (1w): from price_1h (aggregated from 1h)
        // 1m: from price_6h (aggregated from 6h)
        // 3m, 1y: from price_24h (aggregated from 24h)
        const [
            turnover5mRows,
            turnoverCombined5mRows,  // Combined: 1h, 6h, 24h from price_5m
            turnover7dRows,
            turnover1mRows,
            turnoverCombined24hRows,  // Combined: 3m, 1y from price_24h
            bsrCombined5mRows,  // Combined: 5m, 1h, 6h, 24h from price_5m
            bsr1wRows,
            bsr1mRows,
            bsrCombined24hRows  // Combined: 3m, 1y from price_24h
        ] = await Promise.all([
                    // Turnover 5m
                    db.query(`
                        SELECT DISTINCT ON (item_id) item_id,
                            COALESCE((${midPriceExpr} * volume), 0)::NUMERIC(20,0) AS turnover
                        FROM price_5m
                        WHERE item_id = ANY($1)
                        ORDER BY item_id, timestamp DESC
                    `, [itemIds]),
                    // Combined: Turnovers 1h, 6h, 24h from price_5m (single query with conditional aggregation)
                    db.query(`
                        SELECT 
                            item_id,
                            COALESCE(SUM(CASE WHEN timestamp >= $2 THEN ${midPriceExpr} * volume ELSE 0 END), 0)::NUMERIC(20,0) AS turnover_1h,
                            COALESCE(SUM(CASE WHEN timestamp >= $3 THEN ${midPriceExpr} * volume ELSE 0 END), 0)::NUMERIC(20,0) AS turnover_6h,
                            COALESCE(SUM(CASE WHEN timestamp >= $4 THEN ${midPriceExpr} * volume ELSE 0 END), 0)::NUMERIC(20,0) AS turnover_24h
                        FROM price_5m
                        WHERE item_id = ANY($1) AND timestamp >= $4
                        GROUP BY item_id
                    `, [itemIds, now - 3600, now - 21600, now - 86400]),
                    // Turnover 7d (1w)
                    db.query(`
                        SELECT item_id,
                            COALESCE(SUM(${midPriceExpr} * volume), 0)::NUMERIC(20,0) AS turnover
                        FROM price_1h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 604800]),
                    // Turnover 1m
                    db.query(`
                        SELECT item_id,
                            COALESCE(SUM(${midPriceExpr} * volume), 0)::NUMERIC(20,0) AS turnover
                        FROM price_6h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 2592000]),
                    // Combined: Turnovers 3m, 1y from price_24h (single query with conditional aggregation)
                    db.query(`
                        SELECT 
                            item_id,
                            COALESCE(SUM(CASE WHEN timestamp >= $2 THEN ${midPriceExpr} * volume ELSE 0 END), 0)::NUMERIC(20,0) AS turnover_3m,
                            COALESCE(SUM(CASE WHEN timestamp >= $3 THEN ${midPriceExpr} * volume ELSE 0 END), 0)::NUMERIC(20,0) AS turnover_1y
                        FROM price_24h
                        WHERE item_id = ANY($1) AND timestamp >= $3
                        GROUP BY item_id
                    `, [itemIds, now - 7776000, now - 31536000]),
                    // 5. Combined: Buy/sell rates 5m, 1h, 6h, 24h from price_5m (single query with conditional aggregation)
                    db.query(`
                        SELECT 
                            item_id,
                            CASE 
                                WHEN SUM(CASE WHEN timestamp >= $2 THEN low_volume ELSE 0 END) = 0 THEN NULL
                                ELSE ROUND(SUM(CASE WHEN timestamp >= $2 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= $2 THEN low_volume ELSE 0 END), 0), 2)
                            END AS ratio_5m,
                            CASE 
                                WHEN SUM(CASE WHEN timestamp >= $3 THEN low_volume ELSE 0 END) = 0 THEN NULL
                                ELSE ROUND(SUM(CASE WHEN timestamp >= $3 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= $3 THEN low_volume ELSE 0 END), 0), 2)
                            END AS ratio_1h,
                            CASE 
                                WHEN SUM(CASE WHEN timestamp >= $4 THEN low_volume ELSE 0 END) = 0 THEN NULL
                                ELSE ROUND(SUM(CASE WHEN timestamp >= $4 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= $4 THEN low_volume ELSE 0 END), 0), 2)
                            END AS ratio_6h,
                            CASE 
                                WHEN SUM(CASE WHEN timestamp >= $5 THEN low_volume ELSE 0 END) = 0 THEN NULL
                                ELSE ROUND(SUM(CASE WHEN timestamp >= $5 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= $5 THEN low_volume ELSE 0 END), 0), 2)
                            END AS ratio_24h
                        FROM price_5m
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 300, now - 3600, now - 21600, now - 86400]),
                    // 1w: from price_1h (last 7 days)
                    db.query(`
                        SELECT item_id,
                            CASE 
                                WHEN SUM(low_volume) = 0 THEN NULL
                                ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                            END AS ratio
                        FROM price_1h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 604800]),
                    // 1m: from price_6h (last 30 days)
                    db.query(`
                        SELECT item_id,
                            CASE 
                                WHEN SUM(low_volume) = 0 THEN NULL
                                ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                            END AS ratio
                        FROM price_6h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 2592000]),
                    // Combined: Buy/sell rates 3m, 1y from price_24h (single query with conditional aggregation)
                    db.query(`
                        SELECT 
                            item_id,
                            CASE 
                                WHEN SUM(CASE WHEN timestamp >= $2 THEN low_volume ELSE 0 END) = 0 THEN NULL
                                ELSE ROUND(SUM(CASE WHEN timestamp >= $2 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= $2 THEN low_volume ELSE 0 END), 0), 2)
                            END AS ratio_3m,
                            CASE 
                                WHEN SUM(CASE WHEN timestamp >= $3 THEN low_volume ELSE 0 END) = 0 THEN NULL
                                ELSE ROUND(SUM(CASE WHEN timestamp >= $3 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= $3 THEN low_volume ELSE 0 END), 0), 2)
                            END AS ratio_1y
                        FROM price_24h
                        WHERE item_id = ANY($1) AND timestamp >= $3
                        GROUP BY item_id
            `, [itemIds, now - 7776000, now - 31536000])
        ]);
        
        // Extract turnovers from combined results
        const turnover1hRows = { rows: turnoverCombined5mRows.rows.map(r => ({ item_id: r.item_id, turnover: r.turnover_1h })) };
        const turnover6hRows = { rows: turnoverCombined5mRows.rows.map(r => ({ item_id: r.item_id, turnover: r.turnover_6h })) };
        const turnover24hRows = { rows: turnoverCombined5mRows.rows.map(r => ({ item_id: r.item_id, turnover: r.turnover_24h })) };
        const turnover3mRows = { rows: turnoverCombined24hRows.rows.map(r => ({ item_id: r.item_id, turnover: r.turnover_3m })) };
        const turnover1yRows = { rows: turnoverCombined24hRows.rows.map(r => ({ item_id: r.item_id, turnover: r.turnover_1y })) };
        
        // OPTIMIZED: Pre-allocate Map and single-pass processing
        const turnoversByItem = new Map();
        for (const itemId of itemIds) {
            turnoversByItem.set(itemId, {
                turnover5m: '0',
                turnover1h: '0',
                turnover6h: '0',
                turnover24h: '0',
                turnover7d: '0',
                turnover1m: '0',
                turnover3m: '0',
                turnover1y: '0'
            });
        }
        // Single-pass updates (no has() checks needed)
        for (const row of turnover5mRows.rows) {
            const entry = turnoversByItem.get(row.item_id);
            if (entry) entry.turnover5m = row.turnover != null ? String(row.turnover) : '0';
        }
        for (const row of turnover1hRows.rows) {
            const entry = turnoversByItem.get(row.item_id);
            if (entry) entry.turnover1h = row.turnover != null ? String(row.turnover) : '0';
        }
        for (const row of turnover6hRows.rows) {
            const entry = turnoversByItem.get(row.item_id);
            if (entry) entry.turnover6h = row.turnover != null ? String(row.turnover) : '0';
        }
        for (const row of turnover24hRows.rows) {
            const entry = turnoversByItem.get(row.item_id);
            if (entry) entry.turnover24h = row.turnover != null ? String(row.turnover) : '0';
        }
        for (const row of turnover7dRows.rows) {
            const entry = turnoversByItem.get(row.item_id);
            if (entry) entry.turnover7d = row.turnover != null ? String(row.turnover) : '0';
        }
        for (const row of turnover1mRows.rows) {
            const entry = turnoversByItem.get(row.item_id);
            if (entry) entry.turnover1m = row.turnover != null ? String(row.turnover) : '0';
        }
        for (const row of turnover3mRows.rows) {
            const entry = turnoversByItem.get(row.item_id);
            if (entry) entry.turnover3m = row.turnover != null ? String(row.turnover) : '0';
        }
        for (const row of turnover1yRows.rows) {
            const entry = turnoversByItem.get(row.item_id);
            if (entry) entry.turnover1y = row.turnover != null ? String(row.turnover) : '0';
        }
        
        // Extract buy/sell rates from combined results
        const bsr5mRows = { rows: bsrCombined5mRows.rows.map(r => ({ item_id: r.item_id, ratio: r.ratio_5m })) };
        const bsr1hRows = { rows: bsrCombined5mRows.rows.map(r => ({ item_id: r.item_id, ratio: r.ratio_1h })) };
        const bsr6hRows = { rows: bsrCombined5mRows.rows.map(r => ({ item_id: r.item_id, ratio: r.ratio_6h })) };
        const bsr24hRows = { rows: bsrCombined5mRows.rows.map(r => ({ item_id: r.item_id, ratio: r.ratio_24h })) };
        const bsr3mRows = { rows: bsrCombined24hRows.rows.map(r => ({ item_id: r.item_id, ratio: r.ratio_3m })) };
        const bsr1yRows = { rows: bsrCombined24hRows.rows.map(r => ({ item_id: r.item_id, ratio: r.ratio_1y })) };
        
        // OPTIMIZED: Pre-allocate Map and single-pass processing
        const buySellRatesByItem = new Map();
        for (const itemId of itemIds) {
            buySellRatesByItem.set(itemId, {
                bsr5m: null,
                bsr1h: null,
                bsr6h: null,
                bsr24h: null,
                bsr1w: null,
                bsr1m: null,
                bsr3m: null,
                bsr1y: null
            });
        }
        // Single-pass updates (no has() checks needed)
        for (const row of bsr5mRows.rows) {
            const entry = buySellRatesByItem.get(row.item_id);
            if (entry) entry.bsr5m = row.ratio || null;
        }
        for (const row of bsr1hRows.rows) {
            const entry = buySellRatesByItem.get(row.item_id);
            if (entry) entry.bsr1h = row.ratio || null;
        }
        for (const row of bsr6hRows.rows) {
            const entry = buySellRatesByItem.get(row.item_id);
            if (entry) entry.bsr6h = row.ratio || null;
        }
        for (const row of bsr24hRows.rows) {
            const entry = buySellRatesByItem.get(row.item_id);
            if (entry) entry.bsr24h = row.ratio || null;
        }
        for (const row of bsr1wRows.rows) {
            const entry = buySellRatesByItem.get(row.item_id);
            if (entry) entry.bsr1w = row.ratio || null;
        }
        for (const row of bsr1mRows.rows) {
            const entry = buySellRatesByItem.get(row.item_id);
            if (entry) entry.bsr1m = row.ratio || null;
        }
        for (const row of bsr3mRows.rows) {
            const entry = buySellRatesByItem.get(row.item_id);
            if (entry) entry.bsr3m = row.ratio || null;
        }
        for (const row of bsr1yRows.rows) {
            const entry = buySellRatesByItem.get(row.item_id);
            if (entry) entry.bsr1y = row.ratio || null;
        }
        
        // 6. Build bulk INSERT/UPDATE query
        const values = [];
        const itemMap = new Map(batch.map(item => [item.id, item]));
        
        for (const itemId of itemIds) {
            const item = itemMap.get(itemId);
            const prices = pricesByItem.get(itemId);
            
            // Skip if no price data
            if (!prices || !prices.high || !prices.low) {
                continue;
            }
            
            const high = prices.high.price;
            const low = prices.low.price;
            const highTs = prices.high.timestamp;
            const lowTs = prices.low.timestamp;
            
            // Calculate derived values
            // Tax is 2% of high price, rounded down to nearest whole number (unless item is tax-exempt)
            const isTaxExempt = item.name && taxExemptItems.has(item.name);
            const tax = isTaxExempt ? 0 : Math.floor(high * 0.02);
            const margin = high - tax - low;
            const roiPercent = low > 0 ? parseFloat(((margin * 100.0) / low).toFixed(2)) : null;
            const spreadPercent = high > 0 ? parseFloat(((high - low) * 100.0 / high).toFixed(2)) : null;
            const maxProfit = (BigInt(margin) * BigInt(item.limit || 0)).toString();
            const maxInvestment = (BigInt(low) * BigInt(item.limit || 0)).toString();
            
            // Get data from maps
            const vols = volumesByItem.get(itemId) || {};
            const pricesAgg = pricesAggByItem.get(itemId) || {};
            const turnovers = turnoversByItem.get(itemId) || {};
            const bsr = buySellRatesByItem.get(itemId) || {};
            const trends = trendsMap.get(itemId) || {};
            
            values.push([
                itemId, item.name, item.icon, item.members, item.limit,
                high, low, highTs, lowTs,
                margin, roiPercent, spreadPercent, maxProfit, maxInvestment,
                vols.vol5m ?? null, vols.vol1h ?? 0, vols.vol6h ?? 0, vols.vol24h ?? 0, vols.vol7d ?? 0, vols.vol1m ?? 0, vols.vol3m ?? 0, vols.vol1y ?? 0,
                pricesAgg.price5mHigh ?? null, pricesAgg.price5mLow ?? null, 
                pricesAgg.price1hHigh ?? null, pricesAgg.price1hLow ?? null,
                pricesAgg.price6hHigh ?? null, pricesAgg.price6hLow ?? null,
                pricesAgg.price24hHigh ?? null, pricesAgg.price24hLow ?? null,
                pricesAgg.price1wHigh ?? null, pricesAgg.price1wLow ?? null,
                pricesAgg.price1mHigh ?? null, pricesAgg.price1mLow ?? null,
                pricesAgg.price3mHigh ?? null, pricesAgg.price3mLow ?? null,
                pricesAgg.price1yHigh ?? null, pricesAgg.price1yLow ?? null,
                turnovers.turnover5m ?? '0', turnovers.turnover1h ?? '0', turnovers.turnover6h ?? '0', turnovers.turnover24h ?? '0', turnovers.turnover7d ?? '0', turnovers.turnover1m ?? '0', turnovers.turnover3m ?? '0', turnovers.turnover1y ?? '0',
                bsr.bsr5m ?? null, bsr.bsr1h ?? null, bsr.bsr6h ?? null, bsr.bsr24h ?? null, bsr.bsr1w ?? null, bsr.bsr1m ?? null, bsr.bsr3m ?? null, bsr.bsr1y ?? null,
                trends.trend_5m ?? null, trends.trend_1h ?? null, trends.trend_6h ?? null, trends.trend_24h ?? null,
                trends.trend_1w ?? null, trends.trend_1m ?? null, trends.trend_3m ?? null, trends.trend_1y ?? null,
                now
            ]);
        }
        
        if (values.length === 0) {
            await db.query("COMMIT");
            
            // Clear dirty_items for batch even if no values to update
            await db.query(`
                DELETE FROM dirty_items
                WHERE item_id = ANY($1)
            `, [itemIds]);
            
            return 0;
        }
        
        // Bulk INSERT/UPDATE using unnest (PostgreSQL efficient bulk operation)
        // Total columns: 5 (metadata) + 4 (prices) + 5 (calculated) + 8 (volumes) + 16 (price high/low: 8 granularities × 2) + 8 (turnovers) + 8 (buy/sell rates) + 8 (trends) + 1 (timestamp) = 63
        const placeholders = values.map((_, i) => {
            const base = i * 63;
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20}, $${base + 21}, $${base + 22}, $${base + 23}, $${base + 24}, $${base + 25}, $${base + 26}, $${base + 27}, $${base + 28}, $${base + 29}, $${base + 30}, $${base + 31}, $${base + 32}, $${base + 33}, $${base + 34}, $${base + 35}, $${base + 36}, $${base + 37}, $${base + 38}, $${base + 39}, $${base + 40}, $${base + 41}, $${base + 42}, $${base + 43}, $${base + 44}, $${base + 45}, $${base + 46}, $${base + 47}, $${base + 48}, $${base + 49}, $${base + 50}, $${base + 51}, $${base + 52}, $${base + 53}, $${base + 54}, $${base + 55}, $${base + 56}, $${base + 57}, $${base + 58}, $${base + 59}, $${base + 60}, $${base + 61}, $${base + 62}, $${base + 63})`;
        }).join(', ');
        
        const flatParams = values.flat();
        
        await db.query(`
                    INSERT INTO canonical_items (
                        item_id, name, icon, members, "limit",
                        high, low, high_timestamp, low_timestamp,
                        margin, roi_percent, spread_percent, max_profit, max_investment,
                        volume_5m, volume_1h, volume_6h, volume_24h, volume_7d, volume_1m, volume_3m, volume_1y,
                        price_5m_high, price_5m_low, 
                        price_1h_high, price_1h_low,
                        price_6h_high, price_6h_low,
                        price_24h_high, price_24h_low,
                        price_1w_high, price_1w_low,
                        price_1m_high, price_1m_low,
                        price_3m_high, price_3m_low,
                        price_1y_high, price_1y_low,
                        turnover_5m, turnover_1h, turnover_6h, turnover_24h, turnover_7d, turnover_1m, turnover_3m, turnover_1y,
                        buy_sell_rate_5m, buy_sell_rate_1h, buy_sell_rate_6h, buy_sell_rate_24h, buy_sell_rate_1w, buy_sell_rate_1m, buy_sell_rate_3m, buy_sell_rate_1y,
                        trend_5m, trend_1h, trend_6h, trend_24h, trend_1w, trend_1m, trend_3m, trend_1y,
                        timestamp_updated
                    ) VALUES ${placeholders}
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
                        volume_1m = EXCLUDED.volume_1m,
                        volume_3m = EXCLUDED.volume_3m,
                        volume_1y = EXCLUDED.volume_1y,
                        price_5m_high = EXCLUDED.price_5m_high,
                        price_5m_low = EXCLUDED.price_5m_low,
                        price_1h_high = EXCLUDED.price_1h_high,
                        price_1h_low = EXCLUDED.price_1h_low,
                        price_6h_high = EXCLUDED.price_6h_high,
                        price_6h_low = EXCLUDED.price_6h_low,
                        price_24h_high = EXCLUDED.price_24h_high,
                        price_24h_low = EXCLUDED.price_24h_low,
                        price_1w_high = EXCLUDED.price_1w_high,
                        price_1w_low = EXCLUDED.price_1w_low,
                        price_1m_high = EXCLUDED.price_1m_high,
                        price_1m_low = EXCLUDED.price_1m_low,
                        price_3m_high = EXCLUDED.price_3m_high,
                        price_3m_low = EXCLUDED.price_3m_low,
                        price_1y_high = EXCLUDED.price_1y_high,
                        price_1y_low = EXCLUDED.price_1y_low,
                        turnover_5m = EXCLUDED.turnover_5m,
                        turnover_1h = EXCLUDED.turnover_1h,
                        turnover_6h = EXCLUDED.turnover_6h,
                        turnover_24h = EXCLUDED.turnover_24h,
                        turnover_7d = EXCLUDED.turnover_7d,
                        turnover_1m = EXCLUDED.turnover_1m,
                        turnover_3m = EXCLUDED.turnover_3m,
                        turnover_1y = EXCLUDED.turnover_1y,
                        buy_sell_rate_5m = EXCLUDED.buy_sell_rate_5m,
                        buy_sell_rate_1h = EXCLUDED.buy_sell_rate_1h,
                        buy_sell_rate_6h = EXCLUDED.buy_sell_rate_6h,
                        buy_sell_rate_24h = EXCLUDED.buy_sell_rate_24h,
                        buy_sell_rate_1w = EXCLUDED.buy_sell_rate_1w,
                        buy_sell_rate_1m = EXCLUDED.buy_sell_rate_1m,
                        buy_sell_rate_3m = EXCLUDED.buy_sell_rate_3m,
                        buy_sell_rate_1y = EXCLUDED.buy_sell_rate_1y,
                        trend_5m = EXCLUDED.trend_5m,
                        trend_1h = EXCLUDED.trend_1h,
                        trend_6h = EXCLUDED.trend_6h,
                        trend_24h = EXCLUDED.trend_24h,
                        trend_1w = EXCLUDED.trend_1w,
                        trend_1m = EXCLUDED.trend_1m,
                        trend_3m = EXCLUDED.trend_3m,
                        trend_1y = EXCLUDED.trend_1y,
                        timestamp_updated = EXCLUDED.timestamp_updated
                    WHERE canonical_items.timestamp_updated < EXCLUDED.timestamp_updated
                        OR canonical_items.timestamp_updated IS NULL
                `, flatParams);
                
        const updatedCount = values.length;
        
        await db.query("COMMIT");
        
        // Clear dirty_items for successfully processed items
        await db.query(`
            DELETE FROM dirty_items
            WHERE item_id = ANY($1)
        `, [itemIds]);
        
        console.log(`[CANONICAL] Batch ${batchNum}/${totalBatches} completed (${updatedCount} items updated)`);
        return updatedCount;
    } catch (err) {
        await db.query("ROLLBACK");
        throw err;
    }
}

/**
 * Semaphore implementation for controlling concurrency
 */
class Semaphore {
    constructor(count) {
        this.count = count;
        this.waiting = [];
    }
    
    async acquire() {
        if (this.count > 0) {
            this.count--;
            return;
        }
        return new Promise((resolve) => {
            this.waiting.push(resolve);
        });
    }
    
    release() {
        if (this.waiting.length > 0) {
            const resolve = this.waiting.shift();
            resolve();
        } else {
            this.count++;
        }
    }
}

/**
 * Process batches in parallel with concurrency control
 */
async function processBatchesInParallel(batches, now, maxConcurrency = 6) {
    const semaphore = new Semaphore(maxConcurrency);
    const results = [];
    
    const processWithSemaphore = async (batch, batchNum, totalBatches) => {
        await semaphore.acquire();
        try {
            const result = await processBatch(batch, batchNum, totalBatches, now);
            return result;
        } finally {
            semaphore.release();
        }
    };
    
    const promises = batches.map((batch, index) => 
        processWithSemaphore(batch, index + 1, batches.length)
    );
    
    const batchResults = await Promise.all(promises);
    return batchResults.reduce((sum, count) => sum + count, 0);
}

async function updateCanonicalItems() {
    const now = Math.floor(Date.now() / 1000);
    
    // Check if another update is already running
    if (isBackfillRunning("canonical")) {
        console.log("[CANONICAL] Update already in progress, skipping...");
        return;
    }
    
    try {
        const startTime = Date.now();
        createLock("canonical");
        setupLockCleanup("canonical");
        console.log("[CANONICAL] Starting update...");
        
        // Get only items that need updates (from dirty_items queue)
        const { rows: items } = await db.query(`
            SELECT i.id, i.name, i.icon, i.members, i."limit"
            FROM dirty_items d
            JOIN items i ON i.id = d.item_id
        `);
        
        // Auto-skip when no dirty items (eliminates unnecessary cron-triggered work)
        if (items.length === 0) {
            console.log("[CANONICAL] No dirty items — skipping update");
            return;
        }
        
        // Fetch total item count for adaptive fallback
        const { rows: totalRows } = await db.query(`
            SELECT COUNT(*)::INT AS count FROM items
        `);
        const totalItems = totalRows[0].count;
        
        // Adaptive fallback: only switch to full refresh if dirty backlog is almost everything
        if (items.length > totalItems * 0.8) {
            console.log(
                `[CANONICAL] Dirty backlog ${items.length}/${totalItems} (>80%) — switching to full refresh`
            );
            
            const full = await db.query(
                `SELECT id, name, icon, members, "limit" FROM items`
            );
            
            items.length = 0;
            items.push(...full.rows);
        }
        
        // Adaptive batch size based on dirty items count
        // Optimized for 1500 items/sec target with parallel processing:
        // - Small batches (≤50): Use 25 for low latency
        // - Medium batches (≤300): Use 100 for balanced performance
        // - Large batches (>300): Use 400-500 for maximum throughput with parallel processing
        let batchSize;
        if (items.length <= 50) {
            batchSize = 25;
        } else if (items.length <= 300) {
            batchSize = 100;
        } else {
            // Use larger batches (400-500) for maximum throughput
            // Larger batches reduce transaction overhead and improve parallel efficiency
            // Optimal: 500 items per batch with parallel 3 achieves ~1700 items/sec
            batchSize = parseInt(process.env.CANONICAL_BATCH_SIZE || "500", 10);
        }
        
        console.log(`[CANONICAL] Adaptive batch size: ${batchSize} (${items.length} dirty items)`);
        
        // Create batches
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        
        // Determine max concurrency - optimized for 1500+ items/sec target
        // Optimal: 3 parallel batches with batch size 500 = ~1700 items/sec
        // With 50 connections in pool, we can support 3-6 parallel batches safely
        // Each batch uses ~4-5 connections (trends + data queries), so 3 batches = ~12-15 connections
        const maxConcurrency = parseInt(process.env.CANONICAL_MAX_CONCURRENCY || "3", 10);
        console.log(`[CANONICAL] Processing ${batches.length} batches with max concurrency: ${maxConcurrency}`);
        
        // Process batches in parallel
        const updated = await processBatchesInParallel(batches, now, maxConcurrency);
        
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const itemCount = items.length;
        const itemsPerSec = (itemCount / parseFloat(elapsedTime)).toFixed(0);
        console.log(`[CANONICAL] Updated ${updated} items`);
        console.log(`[PERF] canonical: ${itemCount} items in ${elapsedTime}s → ${itemsPerSec}/sec`);
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
module.exports.calculateBatchTrends = calculateBatchTrends;
module.exports.calculateBatchTrendsWithCaching = calculateBatchTrendsWithCaching;
module.exports.calculateTrendFromCandles = calculateTrendFromCandles;
module.exports.auditTrendAnomaly = auditTrendAnomaly;
