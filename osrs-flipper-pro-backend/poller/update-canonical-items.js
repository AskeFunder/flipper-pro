const db = require("../db/db");
const { isBackfillRunning, createLock, removeLock, setupLockCleanup } = require("./lock-utils");

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
 * Calculate all trends for a batch of items using optimized bulk queries
 * Uses bulk queries per granularity instead of per-item LATERAL joins for massive performance gains
 * 
 * @param {Array<number>} itemIds - Array of item IDs
 * @param {number} now - Current timestamp
 * @returns {Promise<Map<number, Object>>} - Map of itemId -> {trend_5m, trend_1h, trend_6h, trend_24h, trend_7d, trend_1m, trend_3m, trend_1y}
 */
async function calculateBatchTrends(itemIds, now) {
    if (itemIds.length === 0) return new Map();
    
    // Trend window definitions (in seconds)
    const windows = {
        '5m': { length: 300, strict: false },
        '1h': { length: 3600, strict: false },
        '6h': { length: 21600, strict: false },
        '24h': { length: 86400, strict: false },
        '7d': { length: 604800, strict: false },
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
                    ORDER BY item_id, priority ASC, timestamp DESC
                `;
                params = [itemIds, target.timestamp];
            } else if (isStrict) {
                // Strict window (1y only)
                const windowStart = now - target.window.length;
                const windowEnd = now;
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
                    ORDER BY item_id, priority ASC, ABS(timestamp - $4) ASC, timestamp DESC
                `;
                params = [itemIds, windowStart, windowEnd, target.timestamp, tolerance];
            } else {
                // Tolerance-based search
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
                    ORDER BY item_id, priority ASC, ABS(timestamp - $2) ASC, timestamp DESC
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
                ORDER BY item_id, priority ASC, ABS(timestamp - $4) ASC, timestamp DESC
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
        for (const trendName of Object.keys(windows)) {
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
        trendMap.set(itemId, trends);
    }
    
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
                const [vol5mRows, vol1hRows, vol6hRows, vol24hRows, vol7dRows] = await Promise.all([
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
                    // Volume 7d
                    db.query(`
                        SELECT item_id, COALESCE(SUM(volume), 0)::BIGINT AS volume
                        FROM price_1h
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 604800])
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
                
                // 3. Fetch all prices from aggregated tables
                const [price5mRows, price1hRows] = await Promise.all([
                    db.query(`
                        SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
                        FROM price_5m
                        WHERE item_id = ANY($1)
                        ORDER BY item_id, timestamp DESC
                    `, [itemIds]),
                    db.query(`
                        SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
                        FROM price_1h
                        WHERE item_id = ANY($1)
                        ORDER BY item_id, timestamp DESC
                    `, [itemIds])
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
                
                // 4. Fetch all turnovers for the batch in parallel
                const midPriceExpr = `CASE 
                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL
                END`;
                
                const [turnover5mRows, turnover1hRows, turnover6hRows, turnover24hRows, turnover7dRows, turnover1mRows] = await Promise.all([
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
                    // Turnover 7d
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
                    `, [itemIds, now - 2592000])
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
                
                // 5. Fetch all buy/sell rates for the batch in parallel
                const [bsr5mRows, bsr1hRows] = await Promise.all([
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
                    db.query(`
                        SELECT item_id,
                            CASE 
                                WHEN SUM(low_volume) = 0 THEN NULL
                                ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                            END AS ratio
                        FROM price_5m
                        WHERE item_id = ANY($1) AND timestamp >= $2
                        GROUP BY item_id
                    `, [itemIds, now - 3600])
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
                    const margin = Math.floor(high * 0.98) - low;
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
                        vols.vol5m ?? null, vols.vol1h ?? 0, vols.vol6h ?? 0, vols.vol24h ?? 0, vols.vol7d ?? 0,
                        pricesAgg.price5mHigh ?? null, pricesAgg.price5mLow ?? null, pricesAgg.price1hHigh ?? null, pricesAgg.price1hLow ?? null,
                        turnovers.turnover5m ?? '0', turnovers.turnover1h ?? '0', turnovers.turnover6h ?? '0', turnovers.turnover24h ?? '0', turnovers.turnover7d ?? '0', turnovers.turnover1m ?? '0',
                        bsr.bsr5m ?? null, bsr.bsr1h ?? null,
                        trends.trend_5m ?? null, trends.trend_1h ?? null, trends.trend_6h ?? null, trends.trend_24h ?? null,
                        trends.trend_7d ?? null, trends.trend_1m ?? null, trends.trend_3m ?? null, trends.trend_1y ?? null,
                        now
                    ]);
                }
                
                if (values.length === 0) {
                    await db.query("COMMIT");
                    continue;
                }
                
                // Bulk INSERT/UPDATE using unnest (PostgreSQL efficient bulk operation)
                const placeholders = values.map((_, i) => {
                    const base = i * 40;
                    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20}, $${base + 21}, $${base + 22}, $${base + 23}, $${base + 24}, $${base + 25}, $${base + 26}, $${base + 27}, $${base + 28}, $${base + 29}, $${base + 30}, $${base + 31}, $${base + 32}, $${base + 33}, $${base + 34}, $${base + 35}, $${base + 36}, $${base + 37}, $${base + 38}, $${base + 39}, $${base + 40})`;
                }).join(', ');
                
                const flatParams = values.flat();
                
                await db.query(`
                    INSERT INTO canonical_items (
                        item_id, name, icon, members, "limit",
                        high, low, high_timestamp, low_timestamp,
                        margin, roi_percent, spread_percent, max_profit, max_investment,
                        volume_5m, volume_1h, volume_6h, volume_24h, volume_7d,
                        price_5m_high, price_5m_low, price_1h_high, price_1h_low,
                        turnover_5m, turnover_1h, turnover_6h, turnover_24h, turnover_7d, turnover_1m,
                        buy_sell_rate_5m, buy_sell_rate_1h,
                        trend_5m, trend_1h, trend_6h, trend_24h, trend_7d, trend_1m, trend_3m, trend_1y,
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
                        trend_3m = EXCLUDED.trend_3m,
                        trend_1y = EXCLUDED.trend_1y,
                        timestamp_updated = EXCLUDED.timestamp_updated
                `, flatParams);
                
                updated += values.length;
                
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
module.exports.calculateBatchTrends = calculateBatchTrends;
