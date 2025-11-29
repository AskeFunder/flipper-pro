// API endpoint to get trend calculation details for an item
const db = require('../db/db');

const midExpr = `CASE WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0 WHEN avg_high IS NOT NULL THEN avg_high WHEN avg_low IS NOT NULL THEN avg_low ELSE NULL END`;

async function getTrendDetails(itemId) {
    const now = Math.floor(Date.now() / 1000);
    
    // First, get the stored trend values from canonical_items
    const storedResult = await db.query(`
        SELECT trend_5m, trend_1h, trend_6h, trend_24h, trend_1w, trend_1m, trend_3m, trend_1y
        FROM canonical_items
        WHERE item_id = $1
    `, [itemId]);
    
    const storedTrends = storedResult.rows.length > 0 ? storedResult.rows[0] : {};
    
    const trends = [
        { name: 'trend_5m', window: { currStart: now - 300, currEnd: now, prevStart: now - 600, prevEnd: now - 300, recency: 0 }, tables: ['price_5m'] },
        { name: 'trend_1h', window: { currStart: now - 3600, currEnd: now, prevStart: now - 7200, prevEnd: now - 3600, recency: 300 }, tables: ['price_5m', 'price_1h'] },
        { name: 'trend_6h', window: { currStart: now - 21600, currEnd: now, prevStart: now - 43200, prevEnd: now - 21600, recency: 900 }, tables: ['price_5m', 'price_1h'] },
        { name: 'trend_24h', window: { currStart: now - 86400, currEnd: now, prevStart: now - 172800, prevEnd: now - 86400, recency: 3600 }, tables: ['price_5m', 'price_1h', 'price_6h'] },
        { name: 'trend_1w', window: { currStart: now - 604800, currEnd: now, prevStart: now - 1209600, prevEnd: now - 604800, recency: 3600 }, tables: ['price_1h'] },
        { name: 'trend_1m', window: { currStart: now - 2592000, currEnd: now, prevStart: now - 5184000, prevEnd: now - 2592000, recency: 21600 }, tables: ['price_5m', 'price_6h', 'price_1h'] },
        { name: 'trend_3m', window: { currStart: now - 7776000, currEnd: now, prevStart: now - 15552000, prevEnd: now - 7776000, recency: 64800 }, tables: ['price_6h', 'price_24h'] },
        { name: 'trend_1y', window: { currStart: now - 31536000, currEnd: now, prevStart: now - 63072000, prevEnd: now - 31536000, recency: 86400, strict: true }, tables: ['price_24h'] },
    ];
    
    const details = {};
    
    for (const trend of trends) {
        const w = trend.window;
        let curr = null;
        let prev = null;
        
        // For trend_5m, trend_1h, trend_1m, trend_7d, trend_24h, and trend_6h, use same logic as canonical updater: first vs last point in window
        if (trend.name === 'trend_5m') {
            // For trend_5m, compare latest price vs price from 5 minutes before the latest datapoint
            // - Current price: Latest mid price from price_5m table
            // - Historical price: Mid price from price_5m where timestamp <= (latest_timestamp - 300)
            
            // Get latest price from price_5m
            const latestResult = await db.query(`
                SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                FROM price_5m
                WHERE item_id = $1
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY timestamp DESC
                LIMIT 1
            `, [itemId]);
            
            if (latestResult.rows.length > 0) {
                const r = latestResult.rows[0];
                const latestTimestamp = r.timestamp;
                const fiveMinutesBeforeLatest = latestTimestamp - 300;
                curr = { table: 'price_5m', timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'latest_5m_point' };
                
                // Get price from 5 minutes before the latest datapoint
                const previousResult = await db.query(`
                    SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                    FROM price_5m
                    WHERE item_id = $1
                      AND timestamp <= $2
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY timestamp DESC
                    LIMIT 1
                `, [itemId, fiveMinutesBeforeLatest]);
                
                if (previousResult.rows.length > 0) {
                    const r = previousResult.rows[0];
                    prev = { table: 'price_5m', timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: '5m_before_latest' };
                }
            }
        } else if (trend.name === 'trend_1h') {
            // For trend_1h, use same latest datapoint as trend_5m (within last 5 minutes), then compare with price from 1 hour before that
            // - Current price: Latest mid price from price_5m where timestamp >= now - 300 (same as trend_5m)
            // - Historical price: Mid price from price_5m where timestamp <= (latest_timestamp - 3600)
            
            const fiveMinutesAgo = now - 300;
            
            // Get latest price from price_5m within last 5 minutes (same as trend_5m)
            const latestResult = await db.query(`
                SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                FROM price_5m
                WHERE item_id = $1
                  AND timestamp >= $2
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY timestamp DESC
                LIMIT 1
            `, [itemId, fiveMinutesAgo]);
            
            if (latestResult.rows.length > 0) {
                const r = latestResult.rows[0];
                const latestTimestamp = r.timestamp;
                const oneHourBeforeLatest = latestTimestamp - 3600;
                curr = { table: 'price_5m', timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'latest_5m_point' };
                
                // Get price from 1 hour before the latest datapoint
                const previousResult = await db.query(`
                    SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                    FROM price_5m
                    WHERE item_id = $1
                      AND timestamp <= $2
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY timestamp DESC
                    LIMIT 1
                `, [itemId, oneHourBeforeLatest]);
                
                if (previousResult.rows.length > 0) {
                    const r = previousResult.rows[0];
                    prev = { table: 'price_5m', timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: '1h_before_latest' };
                }
            }
        } else if (trend.name === 'trend_6h') {
            // For trend_6h, use same latest datapoint as trend_5m (within last 5 minutes), then compare with price from 6 hours before that
            // - Current price: Latest mid price from price_5m where timestamp >= now - 300 (same as trend_5m)
            // - Historical price: Mid price from price_5m where timestamp <= (latest_timestamp - 21600)
            
            const fiveMinutesAgo = now - 300;
            
            // Get latest price from price_5m within last 5 minutes (same as trend_5m)
            const latestResult = await db.query(`
                SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                FROM price_5m
                WHERE item_id = $1
                  AND timestamp >= $2
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY timestamp DESC
                LIMIT 1
            `, [itemId, fiveMinutesAgo]);
            
            if (latestResult.rows.length > 0) {
                const r = latestResult.rows[0];
                const latestTimestamp = r.timestamp;
                const sixHoursBeforeLatest = latestTimestamp - 21600;
                curr = { table: 'price_5m', timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'latest_5m_point' };
                
                // Get price from 6 hours before the latest datapoint
                const previousResult = await db.query(`
                    SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                    FROM price_5m
                    WHERE item_id = $1
                      AND timestamp <= $2
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY timestamp DESC
                    LIMIT 1
                `, [itemId, sixHoursBeforeLatest]);
                
                if (previousResult.rows.length > 0) {
                    const r = previousResult.rows[0];
                    prev = { table: 'price_5m', timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: '6h_before_latest' };
                }
            }
        } else if (trend.name === 'trend_24h') {
            // For trend_24h, use same latest datapoint as trend_5m (within last 5 minutes), then compare with price from 24 hours before that
            // - Current price: Latest mid price from price_5m where timestamp >= now - 300 (same as trend_5m)
            // - Historical price: Mid price from price_5m where timestamp <= (latest_timestamp - 86400)
            
            const fiveMinutesAgo = now - 300;
            
            // Get latest price from price_5m within last 5 minutes (same as trend_5m)
            const latestResult = await db.query(`
                SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                FROM price_5m
                WHERE item_id = $1
                  AND timestamp >= $2
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY timestamp DESC
                LIMIT 1
            `, [itemId, fiveMinutesAgo]);
            
            if (latestResult.rows.length > 0) {
                const r = latestResult.rows[0];
                const latestTimestamp = r.timestamp;
                const twentyFourHoursBeforeLatest = latestTimestamp - 86400;
                curr = { table: 'price_5m', timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'latest_5m_point' };
                
                // Get first datapoint in 24-hour window before latest (like the graph shows)
                // The graph shows from first point in window to latest point
                const previousResult = await db.query(`
                    SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                    FROM price_5m
                    WHERE item_id = $1
                      AND timestamp >= $2
                      AND timestamp < $3
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY timestamp ASC
                    LIMIT 1
                `, [itemId, twentyFourHoursBeforeLatest, latestTimestamp]);
                
                if (previousResult.rows.length > 0) {
                    const r = previousResult.rows[0];
                    prev = { table: 'price_5m', timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: '24h_before_latest' };
                }
            }
        } else if (trend.name === 'trend_1m') {
            // For trend_1m, use first vs last point in 1m window (same as canonical updater)
            // The 1m graph uses price_6h data, so we use price_6h for consistency
            const windowStart = now - 2592000; // 30 days ago
            const windowEnd = now;
            
            // Get first point (what graph shows as start) from price_6h
            const firstResult = await db.query(`
                SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                FROM price_6h
                WHERE item_id = $1
                  AND timestamp >= $2
                  AND timestamp <= $3
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY timestamp ASC
                LIMIT 1
            `, [itemId, windowStart, windowEnd]);
            
            // Get last point (what graph shows as end) from price_6h
            const lastResult = await db.query(`
                SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                FROM price_6h
                WHERE item_id = $1
                  AND timestamp >= $2
                  AND timestamp <= $3
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY timestamp DESC
                LIMIT 1
            `, [itemId, windowStart, windowEnd]);
            
            if (firstResult.rows.length > 0) {
                const r = firstResult.rows[0];
                prev = { table: 'price_6h', timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'first_point_in_1m_window' };
            }
            
            if (lastResult.rows.length > 0) {
                const r = lastResult.rows[0];
                curr = { table: 'price_6h', timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'last_point_in_1m_window' };
            }
        } else if (trend.name === 'trend_1w') {
            // For trend_1w, find the first (earliest) 1h price point within the last hour,
            // then look 1 week back from that timestamp and compare
            const oneHourAgo = now - 3600; // 1 hour ago
            const oneWeekInSeconds = 7 * 24 * 60 * 60; // 604800 seconds
            
            // Get first (earliest) price from price_1h within last hour
            const firstResult = await db.query(`
                SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                FROM price_1h
                WHERE item_id = $1
                  AND timestamp >= $2
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY timestamp ASC
                LIMIT 1
            `, [itemId, oneHourAgo]);
            
            if (firstResult.rows.length > 0) {
                const r = firstResult.rows[0];
                const firstTimestamp = r.timestamp;
                const firstMid = parseFloat(r.mid);
                const oneWeekBeforeFirst = firstTimestamp - oneWeekInSeconds;
                
                curr = { table: 'price_1h', timestamp: firstTimestamp, mid: firstMid, avg_high: r.avg_high, avg_low: r.avg_low, source: 'first_1h_price_within_last_hour' };
                
                // Get price from exactly 1 week before the first datapoint
                // Find the closest price point to exactly 1 week back (within tolerance)
                const toleranceSeconds = 3600; // ±1 hour tolerance
                const previousResult = await db.query(`
                    SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                    FROM price_1h
                    WHERE item_id = $1
                      AND ABS(timestamp - $2) <= $3
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY ABS(timestamp - $2) ASC, timestamp DESC
                    LIMIT 1
                `, [itemId, oneWeekBeforeFirst, toleranceSeconds]);
                
                if (previousResult.rows.length > 0) {
                    const r = previousResult.rows[0];
                    prev = { table: 'price_1h', timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: '1_week_before_first_1h_price' };
                }
            }
        } else {
            // For other trends, use the standard logic
            // Find current price - most recent within expanded window
            // Window expanded by recency: [start - recency, end + recency]
            for (const table of trend.tables) {
                // Priority 1: Most recent with both prices in expanded window
                const bothResult = await db.query(`
                    SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                    FROM ${table}
                    WHERE item_id = $1
                      AND timestamp > ($2::BIGINT - $3::BIGINT) AND timestamp <= ($4::BIGINT + $3::BIGINT)
                      AND avg_high IS NOT NULL AND avg_low IS NOT NULL
                    ORDER BY timestamp DESC
                    LIMIT 1
                `, [itemId, w.currStart, w.recency, w.currEnd]);
                
                if (bothResult.rows.length > 0) {
                    const r = bothResult.rows[0];
                    curr = { table, timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'most_recent_both' };
                    break;
                }
                
                // Priority 2: Most recent with any price in expanded window (only for last table)
                if (table === trend.tables[trend.tables.length - 1]) {
                    const anyResult = await db.query(`
                        SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                        FROM ${table}
                        WHERE item_id = $1
                          AND timestamp > ($2::BIGINT - $3::BIGINT) AND timestamp <= ($4::BIGINT + $3::BIGINT)
                          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                        ORDER BY timestamp DESC
                        LIMIT 1
                    `, [itemId, w.currStart, w.recency, w.currEnd]);
                    
                    if (anyResult.rows.length > 0) {
                        const r = anyResult.rows[0];
                        curr = { table, timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'most_recent_any' };
                        break;
                    }
                }
            }
            
            // Find previous price - first point in previous window (start of window)
            // For all trends, we want the FIRST point in the previous window (closest to prevStart)
            // We search in an expanded window [prevStart - recency, prevEnd + recency] to find data,
            // but we prioritize points >= prevStart (within the actual window)
            // For strict trends (1y), must stay strictly within window: [prevStart, prevEnd]
            // For other trends, use the standard logic
            // For all trends, we want the FIRST point in the previous window (closest to prevStart)
            // We search in an expanded window [prevStart - recency, prevEnd + recency] to find data,
            // but we prioritize points >= prevStart (within the actual window)
            // For strict trends (1y), must stay strictly within window: [prevStart, prevEnd]
            const isStrict = w.strict === true;
            const searchWindowStart = isStrict ? w.prevStart : (w.prevStart - w.recency);
            const searchWindowEnd = isStrict ? w.prevEnd : (w.prevEnd + w.recency);
            
            // For long trends (3m), use EIS (Extended In-Window Search) like canonical updater
            // This allows finding data points that are close to the target even if not exactly in the window
            const isLongTrend = ['3m'].includes(trend.name);
            const targetTimestamp = now - 7776000; // 90 days ago
            const maxExtended = isLongTrend ? Math.floor(7776000 * 0.20) : null; // 20% of period
            
            for (const table of trend.tables) {
            // Priority 1: First point with both prices >= prevStart (within actual window)
            const bothInWindowResult = await db.query(`
                SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                FROM ${table}
                WHERE item_id = $1
                  AND timestamp >= $2 AND timestamp <= $3
                  AND avg_high IS NOT NULL AND avg_low IS NOT NULL
                ORDER BY timestamp ASC
                LIMIT 1
            `, [itemId, w.prevStart, w.prevEnd]);
            
            if (bothInWindowResult.rows.length > 0) {
                const r = bothInWindowResult.rows[0];
                prev = { table, timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'first_point_both_in_window' };
                break;
            }
            
            // Priority 2: First point with both prices in expanded search window (fallback)
            if (!isStrict) {
                const bothExpandedResult = await db.query(`
                    SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                    FROM ${table}
                    WHERE item_id = $1
                      AND timestamp > $2 AND timestamp <= $3
                      AND timestamp >= $4
                      AND avg_high IS NOT NULL AND avg_low IS NOT NULL
                    ORDER BY timestamp ASC
                    LIMIT 1
                `, [itemId, searchWindowStart, searchWindowEnd, w.prevStart]);
                
                if (bothExpandedResult.rows.length > 0) {
                    const r = bothExpandedResult.rows[0];
                    prev = { table, timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'first_point_both_expanded' };
                    break;
                }
            }
            
            // Priority 3: For long trends (3m only, not 1m), use EIS (Extended In-Window Search) like canonical updater
            // This finds the closest point to targetTimestamp within maxExtended distance
            if (isLongTrend && maxExtended) {
                const windowStart = now - 7776000; // 90 days ago
                const windowEnd = now;
                const eisResult = await db.query(`
                    SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid,
                           CASE 
                             WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN 1
                             WHEN avg_high IS NOT NULL THEN 2
                             WHEN avg_low IS NOT NULL THEN 3
                             ELSE NULL
                           END AS priority
                    FROM ${table}
                    WHERE item_id = $1
                      AND timestamp >= $2
                      AND timestamp <= $3
                      AND ABS(timestamp - $4) <= $5
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY priority ASC, ABS(timestamp - $4) ASC, timestamp ASC
                    LIMIT 1
                `, [itemId, windowStart, windowEnd, targetTimestamp, maxExtended]);
                
                if (eisResult.rows.length > 0) {
                    const r = eisResult.rows[0];
                    prev = { table, timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'eis_fallback' };
                    break;
                }
            }
            
            // Priority 4: First point with any price >= prevStart (only for last table)
            if (table === trend.tables[trend.tables.length - 1]) {
                const anyInWindowResult = await db.query(`
                    SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                    FROM ${table}
                    WHERE item_id = $1
                      AND timestamp >= $2 AND timestamp <= $3
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY timestamp ASC
                    LIMIT 1
                `, [itemId, w.prevStart, w.prevEnd]);
                
                if (anyInWindowResult.rows.length > 0) {
                    const r = anyInWindowResult.rows[0];
                    prev = { table, timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'first_point_any_in_window' };
                    break;
                }
                
                // Priority 5: First point with any price in expanded search window (fallback)
                if (!isStrict) {
                    const anyExpandedResult = await db.query(`
                        SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                        FROM ${table}
                        WHERE item_id = $1
                          AND timestamp > $2 AND timestamp <= $3
                          AND timestamp >= $4
                          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                        ORDER BY timestamp ASC
                        LIMIT 1
                    `, [itemId, searchWindowStart, searchWindowEnd, w.prevStart]);
                    
                    if (anyExpandedResult.rows.length > 0) {
                        const r = anyExpandedResult.rows[0];
                        prev = { table, timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'first_point_any_expanded' };
                        break;
                    }
                }
            }
            }
        }
        
        // SINGLE SOURCE OF TRUTH: Only use stored trend value from canonical_items
        // Do NOT calculate on-the-fly - if storedTrend is null, return null
        const storedTrend = storedTrends[trend.name];
        
        // Calculate trend on-the-fly ONLY for display purposes in tooltip (to show prev/curr prices)
        // But the actual trend value MUST come from canonical_items
        let calculatedTrend = null;
        if (curr && prev && prev.mid !== null && prev.mid !== 0 && curr.mid !== null) {
            calculatedTrend = Math.round(100.0 * (curr.mid - prev.mid) / prev.mid * 100) / 100;
        }
        
        // If storedTrend is null, the trend is unavailable (canonical updater hasn't run or no data)
        // Do NOT fall back to calculatedTrend - this ensures single source of truth
        details[trend.name] = {
            trend: storedTrend != null ? storedTrend : null, // ONLY from canonical_items
            calculatedTrend: calculatedTrend, // For reference only (what the calculation would be)
            storedTrend: storedTrend, // Explicitly include stored value
            current: curr ? {
                table: curr.table,
                timestamp: curr.timestamp,
                time: new Date(curr.timestamp * 1000).toISOString(),
                mid: curr.mid,
                avg_high: curr.avg_high,
                avg_low: curr.avg_low,
                source: curr.source
            } : null,
            previous: prev ? {
                table: prev.table,
                timestamp: prev.timestamp,
                time: new Date(prev.timestamp * 1000).toISOString(),
                mid: prev.mid,
                avg_high: prev.avg_high,
                avg_low: prev.avg_low,
                source: prev.source
            } : null
        };
    }
    
    return details;
}

module.exports = { getTrendDetails };

