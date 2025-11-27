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
    
    // Calculate trends from the price map
    const trendMap = new Map();
    for (const itemId of itemIds) {
        const trends = {};
        
        // Calculate trends using first vs last point in window (like the graph shows)
        // This ensures consistency between what's displayed in the graph and what's stored in canonical_items
        for (const trendName of Object.keys(windows)) {
            if (trendName === '5m') {
                // For trend_5m, find latest datapoint within last 5 minutes, then compare with price from 5 minutes before that
                // - Current price: Latest mid price from price_5m where timestamp >= now - 300
                // - Historical price: Mid price from price_5m where timestamp <= (latest_timestamp - 300)
                
                const fiveMinutesAgo = now - 300;
                
                // Get latest price from price_5m within last 5 minutes
                const latestResult = await db.query(`
                    SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
                    FROM price_5m
                    WHERE item_id = $1
                      AND timestamp >= $2
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY timestamp DESC
                    LIMIT 1
                `, [itemId, fiveMinutesAgo]);
                
                if (latestResult.rows.length > 0 && latestResult.rows[0].mid != null) {
                    const latestTimestamp = latestResult.rows[0].timestamp;
                    const latestMid = parseFloat(latestResult.rows[0].mid);
                    const fiveMinutesBeforeLatest = latestTimestamp - 300;
                    
                    // Get price from 5 minutes before the latest datapoint
                    const previousResult = await db.query(`
                        SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
                        FROM price_5m
                        WHERE item_id = $1
                          AND timestamp <= $2
                          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                        ORDER BY timestamp DESC
                        LIMIT 1
                    `, [itemId, fiveMinutesBeforeLatest]);
                    
                    if (previousResult.rows.length > 0 && 
                        previousResult.rows[0].mid != null &&
                        previousResult.rows[0].mid !== 0) {
                        const previousMid = parseFloat(previousResult.rows[0].mid);
                        
                        // Calculate trend: (current - previous) / previous * 100
                        trends.trend_5m = parseFloat((100.0 * (latestMid - previousMid) / previousMid).toFixed(2));
                    } else {
                        trends.trend_5m = null;
                    }
                } else {
                    trends.trend_5m = null;
                }
            } else if (trendName === '1h') {
                // For trend_1h, use same latest datapoint as trend_5m (within last 5 minutes), then compare with price from 1 hour before that
                // - Current price: Latest mid price from price_5m where timestamp >= now - 300 (same as trend_5m)
                // - Historical price: Mid price from price_5m where timestamp <= (latest_timestamp - 3600)
                
                const fiveMinutesAgo = now - 300;
                
                // Get latest price from price_5m within last 5 minutes (same as trend_5m)
                const latestResult = await db.query(`
                    SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
                    FROM price_5m
                    WHERE item_id = $1
                      AND timestamp >= $2
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY timestamp DESC
                    LIMIT 1
                `, [itemId, fiveMinutesAgo]);
                
                if (latestResult.rows.length > 0 && latestResult.rows[0].mid != null) {
                    const latestTimestamp = latestResult.rows[0].timestamp;
                    const latestMid = parseFloat(latestResult.rows[0].mid);
                    const oneHourBeforeLatest = latestTimestamp - 3600;
                    
                    // Get price from 1 hour before the latest datapoint
                    const previousResult = await db.query(`
                        SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
                        FROM price_5m
                        WHERE item_id = $1
                          AND timestamp <= $2
                          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                        ORDER BY timestamp DESC
                        LIMIT 1
                    `, [itemId, oneHourBeforeLatest]);
                    
                    if (previousResult.rows.length > 0 && 
                        previousResult.rows[0].mid != null &&
                        previousResult.rows[0].mid !== 0) {
                        const previousMid = parseFloat(previousResult.rows[0].mid);
                        
                        // Calculate trend: (current - previous) / previous * 100
                        trends.trend_1h = parseFloat((100.0 * (latestMid - previousMid) / previousMid).toFixed(2));
                    } else {
                        trends.trend_1h = null;
                    }
                } else {
                    trends.trend_1h = null;
                }
            } else if (trendName === '6h') {
                // For trend_6h, use same latest datapoint as trend_5m (within last 5 minutes), then compare with price from 6 hours before that
                // - Current price: Latest mid price from price_5m where timestamp >= now - 300 (same as trend_5m)
                // - Historical price: Mid price from price_5m where timestamp <= (latest_timestamp - 21600)
                
                const fiveMinutesAgo = now - 300;
                
                // Get latest price from price_5m within last 5 minutes (same as trend_5m)
                const latestResult = await db.query(`
                    SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
                    FROM price_5m
                    WHERE item_id = $1
                      AND timestamp >= $2
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY timestamp DESC
                    LIMIT 1
                `, [itemId, fiveMinutesAgo]);
                
                if (latestResult.rows.length > 0 && latestResult.rows[0].mid != null) {
                    const latestTimestamp = latestResult.rows[0].timestamp;
                    const latestMid = parseFloat(latestResult.rows[0].mid);
                    const sixHoursBeforeLatest = latestTimestamp - 21600;
                    
                    // Get price from 6 hours before the latest datapoint
                    const previousResult = await db.query(`
                        SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
                        FROM price_5m
                        WHERE item_id = $1
                          AND timestamp <= $2
                          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                        ORDER BY timestamp DESC
                        LIMIT 1
                    `, [itemId, sixHoursBeforeLatest]);
                    
                    if (previousResult.rows.length > 0 && 
                        previousResult.rows[0].mid != null &&
                        previousResult.rows[0].mid !== 0) {
                        const previousMid = parseFloat(previousResult.rows[0].mid);
                        
                        // Calculate trend: (current - previous) / previous * 100
                        trends.trend_6h = parseFloat((100.0 * (latestMid - previousMid) / previousMid).toFixed(2));
                    } else {
                        trends.trend_6h = null;
                    }
                } else {
                    trends.trend_6h = null;
                }
            } else if (trendName === '24h') {
                // For trend_24h, use same latest datapoint as trend_5m (within last 5 minutes), then compare with price from 24 hours before that
                // - Current price: Latest mid price from price_5m where timestamp >= now - 300 (same as trend_5m)
                // - Historical price: Mid price from price_5m where timestamp <= (latest_timestamp - 86400)
                
                const fiveMinutesAgo = now - 300;
                
                // Get latest price from price_5m within last 5 minutes (same as trend_5m)
                const latestResult = await db.query(`
                    SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
                    FROM price_5m
                    WHERE item_id = $1
                      AND timestamp >= $2
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY timestamp DESC
                    LIMIT 1
                `, [itemId, fiveMinutesAgo]);
                
                if (latestResult.rows.length > 0 && latestResult.rows[0].mid != null) {
                    const latestTimestamp = latestResult.rows[0].timestamp;
                    const latestMid = parseFloat(latestResult.rows[0].mid);
                    const twentyFourHoursBeforeLatest = latestTimestamp - 86400;
                    
                    // Get price from 24 hours before the latest datapoint
                    const previousResult = await db.query(`
                        SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
                        FROM price_5m
                        WHERE item_id = $1
                          AND timestamp <= $2
                          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                        ORDER BY timestamp DESC
                        LIMIT 1
                    `, [itemId, twentyFourHoursBeforeLatest]);
                    
                    if (previousResult.rows.length > 0 && 
                        previousResult.rows[0].mid != null &&
                        previousResult.rows[0].mid !== 0) {
                        const previousMid = parseFloat(previousResult.rows[0].mid);
                        
                        // Calculate trend: (current - previous) / previous * 100
                        trends.trend_24h = parseFloat((100.0 * (latestMid - previousMid) / previousMid).toFixed(2));
                    } else {
                        trends.trend_24h = null;
                    }
                } else {
                    trends.trend_24h = null;
                }
            } else if (trendName === '1m') {
                // For trend_1m, use first vs last point in 1m window (same as graph)
                // The 1m graph uses price_6h data, so we use price_6h for consistency
                const windowStart = now - windows['1m'].length; // 30 days ago
                const windowEnd = now;
                
                // Get first and last points from price_6h (what the 1m graph uses)
                const firstLastResult = await db.query(`
                    SELECT 
                        (SELECT (avg_high + avg_low) / 2.0 AS mid
                         FROM price_6h
                         WHERE item_id = $1
                           AND timestamp >= $2
                           AND timestamp <= $3
                           AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                         ORDER BY timestamp ASC
                         LIMIT 1) AS first_mid,
                        (SELECT (avg_high + avg_low) / 2.0 AS mid
                         FROM price_6h
                         WHERE item_id = $1
                           AND timestamp >= $2
                           AND timestamp <= $3
                           AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                         ORDER BY timestamp DESC
                         LIMIT 1) AS last_mid
                `, [itemId, windowStart, windowEnd]);
                
                if (firstLastResult.rows.length > 0 && 
                    firstLastResult.rows[0].first_mid != null && 
                    firstLastResult.rows[0].last_mid != null &&
                    firstLastResult.rows[0].first_mid !== 0) {
                    const firstMid = parseFloat(firstLastResult.rows[0].first_mid);
                    const lastMid = parseFloat(firstLastResult.rows[0].last_mid);
                    trends.trend_1m = parseFloat((100.0 * (lastMid - firstMid) / firstMid).toFixed(2));
                } else {
                    trends.trend_1m = null;
                }
            } else if (trendName === '1w') {
                // For trend_1w, find the first (earliest) 1h price point within the last hour, 
                // then look 1 week back from that timestamp and compare
                const oneHourAgo = now - 3600; // 1 hour ago
                const oneWeekInSeconds = 7 * 24 * 60 * 60; // 604800 seconds
                
                // Get first (earliest) price from price_1h within last hour
                const firstResult = await db.query(`
                    SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
                    FROM price_1h
                    WHERE item_id = $1
                      AND timestamp >= $2
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY timestamp ASC
                    LIMIT 1
                `, [itemId, oneHourAgo]);
                
                if (firstResult.rows.length > 0 && firstResult.rows[0].mid != null) {
                    const firstTimestamp = firstResult.rows[0].timestamp;
                    const firstMid = parseFloat(firstResult.rows[0].mid);
                    const oneWeekBeforeFirst = firstTimestamp - oneWeekInSeconds;
                    
                    // Get price from exactly 1 week before the first datapoint
                    // Find the closest price point to exactly 1 week back (within tolerance)
                    const toleranceSeconds = 3600; // ±1 hour tolerance
                    const previousResult = await db.query(`
                        SELECT timestamp, (avg_high + avg_low) / 2.0 AS mid
                        FROM price_1h
                        WHERE item_id = $1
                          AND ABS(timestamp - $2) <= $3
                          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                        ORDER BY ABS(timestamp - $2) ASC, timestamp DESC
                        LIMIT 1
                    `, [itemId, oneWeekBeforeFirst, toleranceSeconds]);
                    
                    if (previousResult.rows.length > 0 && 
                        previousResult.rows[0].mid != null &&
                        previousResult.rows[0].mid !== 0) {
                        const previousMid = parseFloat(previousResult.rows[0].mid);
                        
                        // Calculate trend: (current - previous) / previous * 100
                        trends.trend_1w = parseFloat((100.0 * (firstMid - previousMid) / previousMid).toFixed(2));
                    } else {
                        trends.trend_1w = null;
                    }
                } else {
                    trends.trend_1w = null;
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
        
        let updated = 0;
        
        // Adaptive batch size based on dirty items count
        // Lowers latency when few items change, preserves throughput on bursts
        let batchSize;
        if (items.length <= 50) {
            batchSize = 25;
        } else if (items.length <= 300) {
            batchSize = 50;
        } else if (items.length <= 1200) {
            batchSize = 100;
        } else {
            batchSize = 200;
        }
        
        console.log(`[CANONICAL] Adaptive batch size: ${batchSize} (${items.length} dirty items)`);
        
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
                // BULK FETCH ALL DATA FOR THE BATCH
                
                // 1. Fetch all price_instants for the batch
                const { rows: allPrices } = await db.query(`
                    SELECT item_id, price, timestamp, type
                    FROM price_instants
                    WHERE item_id = ANY($1)
                `, [itemIds]);
                
                // Organize prices by item_id
                const pricesByItem = new Map();
                for (const price of allPrices) {
                    if (!pricesByItem.has(price.item_id)) {
                        pricesByItem.set(price.item_id, {});
                    }
                    pricesByItem.get(price.item_id)[price.type] = price;
                }
                
                // 2. Fetch all volumes for the batch in parallel
                // Aggregation rules:
                // 5m, 1h, 6h, 24h: from price_5m (aggregated from 5m)
                // 7d (1w): from price_1h (aggregated from 1h)
                // 1m: from price_6h (aggregated from 6h)
                // 3m, 1y: from price_24h (aggregated from 24h)
                const [vol5mRows, vol1hRows, vol6hRows, vol24hRows, vol7dRows, vol1mRows, vol3mRows, vol1yRows] = await Promise.all([
                    // Volume 5m (latest)
                    db.query(`
                        SELECT DISTINCT ON (item_id) item_id, volume
                        FROM price_5m
                        WHERE item_id = ANY($1)
                        ORDER BY item_id, timestamp DESC
                    `, [itemIds]),
                    // Volume 1h
                    db.query(`
                        SELECT item_id, COALESCE(SUM(volume), 0)::BIGINT AS volume
                        FROM price_5m
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 3600]),
                    // Volume 6h
                    db.query(`
                        SELECT item_id, COALESCE(SUM(volume), 0)::BIGINT AS volume
                        FROM price_5m
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 21600]),
                    // Volume 24h
                    db.query(`
                        SELECT item_id, COALESCE(SUM(volume), 0)::BIGINT AS volume
                        FROM price_5m
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 86400]),
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
                    // Volume 3m
                    db.query(`
                        SELECT item_id, COALESCE(SUM(volume), 0)::BIGINT AS volume
                        FROM price_24h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 7776000]),
                    // Volume 1y
                    db.query(`
                        SELECT item_id, COALESCE(SUM(volume), 0)::BIGINT AS volume
                        FROM price_24h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 31536000])
                ]);
                
                // Organize volumes by item_id
                const volumesByItem = new Map();
                for (const row of vol5mRows.rows) {
                    if (!volumesByItem.has(row.item_id)) volumesByItem.set(row.item_id, {});
                    volumesByItem.get(row.item_id).vol5m = row.volume;
                }
                for (const row of vol1hRows.rows) {
                    if (!volumesByItem.has(row.item_id)) volumesByItem.set(row.item_id, {});
                    volumesByItem.get(row.item_id).vol1h = row.volume || 0;
                }
                for (const row of vol6hRows.rows) {
                    if (!volumesByItem.has(row.item_id)) volumesByItem.set(row.item_id, {});
                    volumesByItem.get(row.item_id).vol6h = row.volume || 0;
                }
                for (const row of vol24hRows.rows) {
                    if (!volumesByItem.has(row.item_id)) volumesByItem.set(row.item_id, {});
                    volumesByItem.get(row.item_id).vol24h = row.volume || 0;
                }
                for (const row of vol7dRows.rows) {
                    if (!volumesByItem.has(row.item_id)) volumesByItem.set(row.item_id, {});
                    volumesByItem.get(row.item_id).vol7d = row.volume || 0;
                }
                for (const row of vol1mRows.rows) {
                    if (!volumesByItem.has(row.item_id)) volumesByItem.set(row.item_id, {});
                    volumesByItem.get(row.item_id).vol1m = row.volume || 0;
                }
                for (const row of vol3mRows.rows) {
                    if (!volumesByItem.has(row.item_id)) volumesByItem.set(row.item_id, {});
                    volumesByItem.get(row.item_id).vol3m = row.volume || 0;
                }
                for (const row of vol1yRows.rows) {
                    if (!volumesByItem.has(row.item_id)) volumesByItem.set(row.item_id, {});
                    volumesByItem.get(row.item_id).vol1y = row.volume || 0;
                }
                
                // 3. Fetch all prices from aggregated tables
                // 5m, 1h: latest from their respective tables
                // 6h, 24h: latest from their respective tables (aggregated from 5m)
                // 1w (7d): latest from price_1h (aggregated from 1h)
                // 1m: latest from price_6h (aggregated from 6h)
                // 3m, 1y: latest from price_24h (aggregated from 24h)
                const [price5mRows, price1hRows, price6hRows, price24hRows, price1wRows, price1mRows, price3mRows, price1yRows] = await Promise.all([
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
                    // 3m: latest from price_24h (aggregated from 24h)
                    db.query(`
                        SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
                        FROM price_24h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        ORDER BY item_id, timestamp DESC
                    `, [itemIds, now - 7776000]),
                    // 1y: latest from price_24h (aggregated from 24h)
                    db.query(`
                        SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
                        FROM price_24h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        ORDER BY item_id, timestamp DESC
                    `, [itemIds, now - 31536000])
                ]);
                
                const pricesAggByItem = new Map();
                for (const row of price5mRows.rows) {
                    if (!pricesAggByItem.has(row.item_id)) pricesAggByItem.set(row.item_id, {});
                    pricesAggByItem.get(row.item_id).price5mHigh = row.avg_high || null;
                    pricesAggByItem.get(row.item_id).price5mLow = row.avg_low || null;
                }
                for (const row of price1hRows.rows) {
                    if (!pricesAggByItem.has(row.item_id)) pricesAggByItem.set(row.item_id, {});
                    pricesAggByItem.get(row.item_id).price1hHigh = row.avg_high || null;
                    pricesAggByItem.get(row.item_id).price1hLow = row.avg_low || null;
                }
                for (const row of price6hRows.rows) {
                    if (!pricesAggByItem.has(row.item_id)) pricesAggByItem.set(row.item_id, {});
                    pricesAggByItem.get(row.item_id).price6hHigh = row.avg_high || null;
                    pricesAggByItem.get(row.item_id).price6hLow = row.avg_low || null;
                }
                for (const row of price24hRows.rows) {
                    if (!pricesAggByItem.has(row.item_id)) pricesAggByItem.set(row.item_id, {});
                    pricesAggByItem.get(row.item_id).price24hHigh = row.avg_high || null;
                    pricesAggByItem.get(row.item_id).price24hLow = row.avg_low || null;
                }
                for (const row of price1wRows.rows) {
                    if (!pricesAggByItem.has(row.item_id)) pricesAggByItem.set(row.item_id, {});
                    pricesAggByItem.get(row.item_id).price1wHigh = row.avg_high || null;
                    pricesAggByItem.get(row.item_id).price1wLow = row.avg_low || null;
                }
                for (const row of price1mRows.rows) {
                    if (!pricesAggByItem.has(row.item_id)) pricesAggByItem.set(row.item_id, {});
                    pricesAggByItem.get(row.item_id).price1mHigh = row.avg_high || null;
                    pricesAggByItem.get(row.item_id).price1mLow = row.avg_low || null;
                }
                for (const row of price3mRows.rows) {
                    if (!pricesAggByItem.has(row.item_id)) pricesAggByItem.set(row.item_id, {});
                    pricesAggByItem.get(row.item_id).price3mHigh = row.avg_high || null;
                    pricesAggByItem.get(row.item_id).price3mLow = row.avg_low || null;
                }
                for (const row of price1yRows.rows) {
                    if (!pricesAggByItem.has(row.item_id)) pricesAggByItem.set(row.item_id, {});
                    pricesAggByItem.get(row.item_id).price1yHigh = row.avg_high || null;
                    pricesAggByItem.get(row.item_id).price1yLow = row.avg_low || null;
                }
                
                // 4. Fetch all turnovers for the batch in parallel
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
                const [turnover5mRows, turnover1hRows, turnover6hRows, turnover24hRows, turnover7dRows, turnover1mRows, turnover3mRows, turnover1yRows] = await Promise.all([
                    // Turnover 5m
                    db.query(`
                        SELECT DISTINCT ON (item_id) item_id,
                            COALESCE((${midPriceExpr} * volume), 0)::NUMERIC(20,0) AS turnover
                        FROM price_5m
                        WHERE item_id = ANY($1)
                        ORDER BY item_id, timestamp DESC
                    `, [itemIds]),
                    // Turnover 1h
                    db.query(`
                        SELECT item_id,
                            COALESCE(SUM(${midPriceExpr} * volume), 0)::NUMERIC(20,0) AS turnover
                        FROM price_5m
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 3600]),
                    // Turnover 6h
                    db.query(`
                        SELECT item_id,
                            COALESCE(SUM(${midPriceExpr} * volume), 0)::NUMERIC(20,0) AS turnover
                        FROM price_5m
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 21600]),
                    // Turnover 24h
                    db.query(`
                        SELECT item_id,
                            COALESCE(SUM(${midPriceExpr} * volume), 0)::NUMERIC(20,0) AS turnover
                        FROM price_5m
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 86400]),
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
                    // Turnover 3m
                    db.query(`
                        SELECT item_id,
                            COALESCE(SUM(${midPriceExpr} * volume), 0)::NUMERIC(20,0) AS turnover
                        FROM price_24h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 7776000]),
                    // Turnover 1y
                    db.query(`
                        SELECT item_id,
                            COALESCE(SUM(${midPriceExpr} * volume), 0)::NUMERIC(20,0) AS turnover
                        FROM price_24h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 31536000])
                ]);
                
                const turnoversByItem = new Map();
                for (const row of turnover5mRows.rows) {
                    if (!turnoversByItem.has(row.item_id)) turnoversByItem.set(row.item_id, {});
                    turnoversByItem.get(row.item_id).turnover5m = row.turnover != null ? String(row.turnover) : '0';
                }
                for (const row of turnover1hRows.rows) {
                    if (!turnoversByItem.has(row.item_id)) turnoversByItem.set(row.item_id, {});
                    turnoversByItem.get(row.item_id).turnover1h = row.turnover != null ? String(row.turnover) : '0';
                }
                for (const row of turnover6hRows.rows) {
                    if (!turnoversByItem.has(row.item_id)) turnoversByItem.set(row.item_id, {});
                    turnoversByItem.get(row.item_id).turnover6h = row.turnover != null ? String(row.turnover) : '0';
                }
                for (const row of turnover24hRows.rows) {
                    if (!turnoversByItem.has(row.item_id)) turnoversByItem.set(row.item_id, {});
                    turnoversByItem.get(row.item_id).turnover24h = row.turnover != null ? String(row.turnover) : '0';
                }
                for (const row of turnover7dRows.rows) {
                    if (!turnoversByItem.has(row.item_id)) turnoversByItem.set(row.item_id, {});
                    turnoversByItem.get(row.item_id).turnover7d = row.turnover != null ? String(row.turnover) : '0';
                }
                for (const row of turnover1mRows.rows) {
                    if (!turnoversByItem.has(row.item_id)) turnoversByItem.set(row.item_id, {});
                    turnoversByItem.get(row.item_id).turnover1m = row.turnover != null ? String(row.turnover) : '0';
                }
                for (const row of turnover3mRows.rows) {
                    if (!turnoversByItem.has(row.item_id)) turnoversByItem.set(row.item_id, {});
                    turnoversByItem.get(row.item_id).turnover3m = row.turnover != null ? String(row.turnover) : '0';
                }
                for (const row of turnover1yRows.rows) {
                    if (!turnoversByItem.has(row.item_id)) turnoversByItem.set(row.item_id, {});
                    turnoversByItem.get(row.item_id).turnover1y = row.turnover != null ? String(row.turnover) : '0';
                }
                
                // 5. Fetch all buy/sell rates for the batch in parallel
                // Aggregation rules:
                // 5m, 1h, 6h, 24h: from price_5m (aggregated from 5m)
                // 1w: from price_1h (aggregated from 1h)
                // 1m: from price_6h (aggregated from 6h)
                // 3m, 1y: from price_24h (aggregated from 24h)
                const [bsr5mRows, bsr1hRows, bsr6hRows, bsr24hRows, bsr1wRows, bsr1mRows, bsr3mRows, bsr1yRows] = await Promise.all([
                    // 5m: from price_5m (last 5 minutes)
                    db.query(`
                        SELECT item_id,
                            CASE 
                                WHEN SUM(low_volume) = 0 THEN NULL
                                ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                            END AS ratio
                        FROM price_5m
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 300]),
                    // 1h: from price_5m (last 1 hour)
                    db.query(`
                        SELECT item_id,
                            CASE 
                                WHEN SUM(low_volume) = 0 THEN NULL
                                ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                            END AS ratio
                        FROM price_5m
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 3600]),
                    // 6h: from price_5m (last 6 hours)
                    db.query(`
                        SELECT item_id,
                            CASE 
                                WHEN SUM(low_volume) = 0 THEN NULL
                                ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                            END AS ratio
                        FROM price_5m
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 21600]),
                    // 24h: from price_5m (last 24 hours)
                    db.query(`
                        SELECT item_id,
                            CASE 
                                WHEN SUM(low_volume) = 0 THEN NULL
                                ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                            END AS ratio
                        FROM price_5m
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 86400]),
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
                    // 3m: from price_24h (last 90 days)
                    db.query(`
                        SELECT item_id,
                            CASE 
                                WHEN SUM(low_volume) = 0 THEN NULL
                                ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                            END AS ratio
                        FROM price_24h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 7776000]),
                    // 1y: from price_24h (last 365 days)
                    db.query(`
                        SELECT item_id,
                            CASE 
                                WHEN SUM(low_volume) = 0 THEN NULL
                                ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                            END AS ratio
                        FROM price_24h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 31536000])
                ]);
                
                const buySellRatesByItem = new Map();
                for (const row of bsr5mRows.rows) {
                    if (!buySellRatesByItem.has(row.item_id)) buySellRatesByItem.set(row.item_id, {});
                    buySellRatesByItem.get(row.item_id).bsr5m = row.ratio || null;
                }
                for (const row of bsr1hRows.rows) {
                    if (!buySellRatesByItem.has(row.item_id)) buySellRatesByItem.set(row.item_id, {});
                    buySellRatesByItem.get(row.item_id).bsr1h = row.ratio || null;
                }
                for (const row of bsr6hRows.rows) {
                    if (!buySellRatesByItem.has(row.item_id)) buySellRatesByItem.set(row.item_id, {});
                    buySellRatesByItem.get(row.item_id).bsr6h = row.ratio || null;
                }
                for (const row of bsr24hRows.rows) {
                    if (!buySellRatesByItem.has(row.item_id)) buySellRatesByItem.set(row.item_id, {});
                    buySellRatesByItem.get(row.item_id).bsr24h = row.ratio || null;
                }
                for (const row of bsr1wRows.rows) {
                    if (!buySellRatesByItem.has(row.item_id)) buySellRatesByItem.set(row.item_id, {});
                    buySellRatesByItem.get(row.item_id).bsr1w = row.ratio || null;
                }
                for (const row of bsr1mRows.rows) {
                    if (!buySellRatesByItem.has(row.item_id)) buySellRatesByItem.set(row.item_id, {});
                    buySellRatesByItem.get(row.item_id).bsr1m = row.ratio || null;
                }
                for (const row of bsr3mRows.rows) {
                    if (!buySellRatesByItem.has(row.item_id)) buySellRatesByItem.set(row.item_id, {});
                    buySellRatesByItem.get(row.item_id).bsr3m = row.ratio || null;
                }
                for (const row of bsr1yRows.rows) {
                    if (!buySellRatesByItem.has(row.item_id)) buySellRatesByItem.set(row.item_id, {});
                    buySellRatesByItem.get(row.item_id).bsr1y = row.ratio || null;
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
                    
                    continue;
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
                `, flatParams);
                
                updated += values.length;
                
                await db.query("COMMIT");
                
                // Clear dirty_items for successfully processed items
                await db.query(`
                    DELETE FROM dirty_items
                    WHERE item_id = ANY($1)
                `, [itemIds]);
                
                console.log(`[CANONICAL] Batch ${batchNum}/${totalBatches} completed (${updated} items updated so far)`);
            } catch (err) {
                await db.query("ROLLBACK");
                throw err;
            }
        }
        
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
module.exports.calculateTrendFromCandles = calculateTrendFromCandles;
module.exports.auditTrendAnomaly = auditTrendAnomaly;
