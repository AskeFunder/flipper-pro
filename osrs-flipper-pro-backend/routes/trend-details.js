// API endpoint to get trend calculation details for an item
const db = require('../db/db');

const midExpr = `CASE WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0 WHEN avg_high IS NOT NULL THEN avg_high WHEN avg_low IS NOT NULL THEN avg_low ELSE NULL END`;

async function getTrendDetails(itemId) {
    const now = Math.floor(Date.now() / 1000);
    
    // First, get the stored trend values from canonical_items
    const storedResult = await db.query(`
        SELECT trend_5m, trend_1h, trend_6h, trend_24h, trend_7d, trend_1m
        FROM canonical_items
        WHERE item_id = $1
    `, [itemId]);
    
    const storedTrends = storedResult.rows.length > 0 ? storedResult.rows[0] : {};
    
    const trends = [
        { name: 'trend_5m', window: { currStart: now - 300, currEnd: now, prevStart: now - 600, prevEnd: now - 300, recency: 0 }, tables: ['price_5m'] },
        { name: 'trend_1h', window: { currStart: now - 3600, currEnd: now, prevStart: now - 7200, prevEnd: now - 3600, recency: 300 }, tables: ['price_5m', 'price_1h'] },
        { name: 'trend_6h', window: { currStart: now - 21600, currEnd: now, prevStart: now - 43200, prevEnd: now - 21600, recency: 900 }, tables: ['price_5m', 'price_1h'] },
        { name: 'trend_24h', window: { currStart: now - 86400, currEnd: now, prevStart: now - 172800, prevEnd: now - 86400, recency: 3600 }, tables: ['price_5m', 'price_1h', 'price_6h'] },
        { name: 'trend_7d', window: { currStart: now - 604800, currEnd: now, prevStart: now - 1209600, prevEnd: now - 604800, recency: 21600 }, tables: ['price_5m', 'price_6h', 'price_1h'] },
        { name: 'trend_1m', window: { currStart: now - 2592000, currEnd: now, prevStart: now - 5184000, prevEnd: now - 2592000, recency: 21600 }, tables: ['price_5m', 'price_6h', 'price_1h'] },
    ];
    
    const details = {};
    
    for (const trend of trends) {
        const w = trend.window;
        let curr = null;
        let prev = null;
        
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
        
        // Find previous price - most recent within expanded window
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
            `, [itemId, w.prevStart, w.recency, w.prevEnd]);
            
            if (bothResult.rows.length > 0) {
                const r = bothResult.rows[0];
                prev = { table, timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'most_recent_both' };
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
                `, [itemId, w.prevStart, w.recency, w.prevEnd]);
                
                if (anyResult.rows.length > 0) {
                    const r = anyResult.rows[0];
                    prev = { table, timestamp: r.timestamp, mid: parseFloat(r.mid), avg_high: r.avg_high, avg_low: r.avg_low, source: 'most_recent_any' };
                    break;
                }
            }
        }
        
        let calculatedTrend = null;
        if (curr && prev && prev.mid !== null && prev.mid !== 0 && curr.mid !== null) {
            calculatedTrend = Math.round(100.0 * (curr.mid - prev.mid) / prev.mid * 100) / 100;
        }
        
        // Use stored trend value (what's actually displayed) instead of recalculated
        const storedTrend = storedTrends[trend.name];
        const displayTrend = storedTrend != null ? storedTrend : calculatedTrend;
        
        details[trend.name] = {
            trend: displayTrend, // Use stored value (what's displayed)
            calculatedTrend: calculatedTrend, // Keep recalculated for reference
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

