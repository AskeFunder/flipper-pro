/**
 * Debug script to investigate trend_1m calculation discrepancy for Iron bar (2351)
 * User reports:
 * - Manual calculation (first vs last point in 1m graph): -69,36%
 * - Advanced granularity 1m: -66,41%
 * - Tooltip: -63.22%
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function debugTrend1m() {
    const itemId = 2351; // Iron bar
    const now = Math.floor(Date.now() / 1000);
    const oneMonthAgo = now - (30 * 24 * 60 * 60); // 30 days ago
    
    console.log('='.repeat(80));
    console.log(`🔍 DEBUGGING trend_1m FOR IRON BAR (${itemId})`);
    console.log('='.repeat(80));
    console.log(`Current timestamp: ${new Date(now * 1000).toISOString()}`);
    console.log(`One month ago: ${new Date(oneMonthAgo * 1000).toISOString()}`);
    console.log();
    
    // 1. Get stored trend_1m from canonical_items
    console.log('📊 1. STORED trend_1m IN canonical_items:');
    console.log('-'.repeat(80));
    const storedResult = await db.query(`
        SELECT trend_1m
        FROM canonical_items
        WHERE item_id = $1
    `, [itemId]);
    
    if (storedResult.rows.length > 0) {
        console.log(`Stored trend_1m: ${storedResult.rows[0].trend_1m}%`);
    } else {
        console.log('No canonical_items record found');
    }
    console.log();
    
    // 2. Get first and last data points in 1m graph (what user sees)
    console.log('📊 2. FIRST AND LAST DATA POINTS IN 1M GRAPH:');
    console.log('-'.repeat(80));
    const graphData = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_1h
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp ASC
    `, [itemId, oneMonthAgo, now]);
    
    if (graphData.rows.length > 0) {
        const first = graphData.rows[0];
        const last = graphData.rows[graphData.rows.length - 1];
        console.log(`First point: ${new Date(first.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${first.avg_high}, avg_low: ${first.avg_low}, mid: ${first.mid}`);
        console.log(`Last point: ${new Date(last.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${last.avg_high}, avg_low: ${last.avg_low}, mid: ${last.mid}`);
        
        const manualTrend = ((last.mid - first.mid) / first.mid) * 100;
        console.log(`Manual calculation (last - first) / first * 100: ${manualTrend.toFixed(2)}%`);
        console.log(`User reported: -69,36%`);
    } else {
        console.log('No data points found in price_1h for 1m window');
    }
    console.log();
    
    // 3. Check how trend_1m is calculated in update-canonical-items.js
    // According to the code, trend_1m uses the old calculateBatchTrends logic
    // It uses a window of 2592000 seconds (30 days)
    console.log('📊 3. HOW trend_1m IS CALCULATED (update-canonical-items.js logic):');
    console.log('-'.repeat(80));
    const periodSeconds = 30 * 24 * 60 * 60; // 30 days
    const windowStart = now - (32 * 24 * 60 * 60); // 32 days ago (buffer)
    const windowEnd = now;
    
    // Check what data actually exists
    const allDataResult = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_1h
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp DESC
    `, [itemId, windowStart, windowEnd]);
    
    console.log(`Total data points in window: ${allDataResult.rows.length}`);
    if (allDataResult.rows.length > 0) {
        console.log(`Earliest: ${new Date(allDataResult.rows[allDataResult.rows.length - 1].timestamp * 1000).toISOString()}`);
        console.log(`Latest: ${new Date(allDataResult.rows[0].timestamp * 1000).toISOString()}`);
    }
    console.log();
    
    // Get latest price (current) - this is what calculateBatchTrends uses for 'end' type
    const currentResult = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_1h
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp DESC
        LIMIT 1
    `, [itemId, windowStart, windowEnd]);
    
    if (currentResult.rows.length > 0) {
        const current = currentResult.rows[0];
        console.log(`Current (latest) price: ${new Date(current.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${current.avg_high}, avg_low: ${current.avg_low}, mid: ${current.mid}`);
        
        // Get previous price (30 days ago, with tolerance)
        // calculateBatchTrends uses 'start' type which orders by timestamp ASC to get FIRST point
        const targetTimestamp = now - periodSeconds; // This is the target, not current.timestamp - periodSeconds
        const toleranceSeconds = 6 * 60 * 60; // ±6 hours (fallbackTolerances['1m'])
        const toleranceLower = targetTimestamp - toleranceSeconds;
        const toleranceUpper = targetTimestamp + toleranceSeconds;
        
        console.log(`Target timestamp (30 days ago from now): ${new Date(targetTimestamp * 1000).toISOString()}`);
        console.log(`Tolerance: ±${toleranceSeconds / 3600} hours`);
        console.log(`Search window: ${new Date(toleranceLower * 1000).toISOString()} to ${new Date(toleranceUpper * 1000).toISOString()}`);
        
        // Simulate the actual query from calculateBatchTrends for 'start' type
        // It uses: ORDER BY item_id, priority ASC, ABS(timestamp - $2) ASC, timestamp ASC
        const previousResult = await db.query(`
            SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid,
                   ABS(timestamp - $1) AS distance,
                   CASE 
                     WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN 1
                     WHEN avg_high IS NOT NULL THEN 2
                     WHEN avg_low IS NOT NULL THEN 3
                     ELSE NULL
                   END AS priority
            FROM price_1h
            WHERE item_id = $2
              AND ABS(timestamp - $1) <= $3
              AND timestamp <= $4
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY priority ASC, ABS(timestamp - $1) ASC, timestamp ASC
            LIMIT 1
        `, [targetTimestamp, itemId, toleranceSeconds, current.timestamp]);
        
        if (previousResult.rows.length > 0) {
            const previous = previousResult.rows[0];
            console.log(`Previous (30 days ago) price: ${new Date(previous.timestamp * 1000).toISOString()}`);
            console.log(`  avg_high: ${previous.avg_high}, avg_low: ${previous.avg_low}, mid: ${previous.mid}`);
            console.log(`  Priority: ${previous.priority}, Distance from target: ${previous.distance} seconds (${(previous.distance / 3600).toFixed(2)} hours)`);
            
            const calculatedTrend = ((current.mid - previous.mid) / previous.mid) * 100;
            console.log(`Calculated trend: (${current.mid} - ${previous.mid}) / ${previous.mid} * 100 = ${calculatedTrend.toFixed(2)}%`);
            console.log(`Stored trend_1m: ${storedResult.rows[0]?.trend_1m}%`);
            console.log(`Difference: ${(calculatedTrend - parseFloat(storedResult.rows[0]?.trend_1m || 0)).toFixed(2)}%`);
        } else {
            console.log('No previous price found within tolerance in price_1h');
            console.log('Checking EIS (Extended In-Window Search) - this is what calculateBatchTrends uses as fallback:');
            
            // EIS uses windowStart = now - window.length, windowEnd = now
            const windowStart = now - periodSeconds;
            const windowEnd = now;
            const maxExtended = Math.floor(periodSeconds * 0.20); // 20% of period = 6 days
            
            console.log(`EIS window: ${new Date(windowStart * 1000).toISOString()} to ${new Date(windowEnd * 1000).toISOString()}`);
            console.log(`EIS maxExtended: ${maxExtended} seconds (${(maxExtended / 86400).toFixed(1)} days)`);
            console.log(`EIS search: timestamp >= windowStart AND timestamp <= windowEnd AND ABS(timestamp - target) <= maxExtended`);
            
            // Try EIS in price_1h
            const eis1hResult = await db.query(`
                SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid,
                       ABS(timestamp - $1) AS distance,
                       CASE 
                         WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN 1
                         WHEN avg_high IS NOT NULL THEN 2
                         WHEN avg_low IS NOT NULL THEN 3
                         ELSE NULL
                       END AS priority
                FROM price_1h
                WHERE item_id = $2
                  AND timestamp >= $3
                  AND timestamp <= $4
                  AND ABS(timestamp - $1) <= $5
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY priority ASC, ABS(timestamp - $1) ASC, timestamp ASC
                LIMIT 1
            `, [targetTimestamp, itemId, windowStart, windowEnd, maxExtended]);
            
            if (eis1hResult.rows.length > 0) {
                const eis = eis1hResult.rows[0];
                console.log(`EIS found in price_1h: ${new Date(eis.timestamp * 1000).toISOString()}`);
                console.log(`  avg_high: ${eis.avg_high}, avg_low: ${eis.avg_low}, mid: ${eis.mid}`);
                console.log(`  Distance from target: ${eis.distance} seconds (${(eis.distance / 86400).toFixed(2)} days)`);
                
                const calculatedTrend = ((current.mid - eis.mid) / eis.mid) * 100;
                console.log(`Calculated trend (EIS): (${current.mid} - ${eis.mid}) / ${eis.mid} * 100 = ${calculatedTrend.toFixed(2)}%`);
                console.log(`Stored trend_1m: ${storedResult.rows[0]?.trend_1m}%`);
                console.log(`Difference: ${(calculatedTrend - parseFloat(storedResult.rows[0]?.trend_1m || 0)).toFixed(2)}%`);
            } else {
                console.log('EIS also found nothing in price_1h');
                console.log('Checking other granularities (price_6h, price_24h) that calculateBatchTrends might use:');
                
                // Try price_6h
                const eis6hResult = await db.query(`
                    SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid,
                           ABS(timestamp - $1) AS distance
                    FROM price_6h
                    WHERE item_id = $2
                      AND timestamp >= $3
                      AND timestamp <= $4
                      AND ABS(timestamp - $1) <= $5
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY ABS(timestamp - $1) ASC, timestamp ASC
                    LIMIT 1
                `, [targetTimestamp, itemId, windowStart, windowEnd, maxExtended]);
                
                if (eis6hResult.rows.length > 0) {
                    const eis6h = eis6hResult.rows[0];
                    console.log(`EIS found in price_6h: ${new Date(eis6h.timestamp * 1000).toISOString()}`);
                    console.log(`  avg_high: ${eis6h.avg_high}, avg_low: ${eis6h.avg_low}, mid: ${eis6h.mid}`);
                    console.log(`  Distance from target: ${eis6h.distance} seconds (${(eis6h.distance / 86400).toFixed(2)} days)`);
                    
                    const calculatedTrend = ((current.mid - eis6h.mid) / eis6h.mid) * 100;
                    console.log(`Calculated trend (EIS 6h): (${current.mid} - ${eis6h.mid}) / ${eis6h.mid} * 100 = ${calculatedTrend.toFixed(2)}%`);
                    console.log(`Stored trend_1m: ${storedResult.rows[0]?.trend_1m}%`);
                } else {
                    console.log('EIS found nothing in price_6h either');
                }
                
                // Try price_24h
                const eis24hResult = await db.query(`
                    SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid,
                           ABS(timestamp - $1) AS distance
                    FROM price_24h
                    WHERE item_id = $2
                      AND timestamp >= $3
                      AND timestamp <= $4
                      AND ABS(timestamp - $1) <= $5
                      AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                    ORDER BY ABS(timestamp - $1) ASC, timestamp ASC
                    LIMIT 1
                `, [targetTimestamp, itemId, windowStart, windowEnd, maxExtended]);
                
                if (eis24hResult.rows.length > 0) {
                    const eis24h = eis24hResult.rows[0];
                    console.log(`EIS found in price_24h: ${new Date(eis24h.timestamp * 1000).toISOString()}`);
                    console.log(`  avg_high: ${eis24h.avg_high}, avg_low: ${eis24h.avg_low}, mid: ${eis24h.mid}`);
                    console.log(`  Distance from target: ${eis24h.distance} seconds (${eis24h.distance / 86400} days)`);
                    
                    const calculatedTrend = ((current.mid - eis24h.mid) / eis24h.mid) * 100;
                    console.log(`Calculated trend (EIS 24h): (${current.mid} - ${eis24h.mid}) / ${eis24h.mid} * 100 = ${calculatedTrend.toFixed(2)}%`);
                    console.log(`Stored trend_1m: ${storedResult.rows[0]?.trend_1m}%`);
                } else {
                    console.log('EIS found nothing in price_24h either');
                }
            }
        }
    } else {
        console.log('No current price found');
    }
    console.log();
    
    // 4. Check how trend-details.js calculates it (for tooltip)
    console.log('📊 4. HOW trend-details.js CALCULATES IT (for tooltip):');
    console.log('-'.repeat(80));
    const trendDetailsWindow = {
        currStart: now - 2592000, // 30 days ago
        currEnd: now,
        prevStart: now - 5184000, // 60 days ago
        prevEnd: now - 2592000, // 30 days ago
        recency: 21600 // 6 hours
    };
    
    // Find current price (most recent in current window)
    const currResult = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_1h
        WHERE item_id = $1
          AND timestamp > ($2::BIGINT - $3::BIGINT) AND timestamp <= ($4::BIGINT + $3::BIGINT)
          AND avg_high IS NOT NULL AND avg_low IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 1
    `, [itemId, trendDetailsWindow.currStart, trendDetailsWindow.recency, trendDetailsWindow.currEnd]);
    
    if (currResult.rows.length > 0) {
        const curr = currResult.rows[0];
        console.log(`Current price (trend-details): ${new Date(curr.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${curr.avg_high}, avg_low: ${curr.avg_low}, mid: ${curr.mid}`);
        
        // Find previous price (first in previous window)
        const prevResult = await db.query(`
            SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
            FROM price_1h
            WHERE item_id = $1
              AND timestamp >= $2 AND timestamp <= $3
              AND avg_high IS NOT NULL AND avg_low IS NOT NULL
            ORDER BY timestamp ASC
            LIMIT 1
        `, [itemId, trendDetailsWindow.prevStart, trendDetailsWindow.prevEnd]);
        
        if (prevResult.rows.length > 0) {
            const prev = prevResult.rows[0];
            console.log(`Previous price (trend-details, first in window): ${new Date(prev.timestamp * 1000).toISOString()}`);
            console.log(`  avg_high: ${prev.avg_high}, avg_low: ${prev.avg_low}, mid: ${prev.mid}`);
            
            const tooltipTrend = ((curr.mid - prev.mid) / prev.mid) * 100;
            console.log(`Tooltip trend: (${curr.mid} - ${prev.mid}) / ${prev.mid} * 100 = ${tooltipTrend.toFixed(2)}%`);
            console.log(`User reported tooltip: -63.22%`);
        } else {
            console.log('No previous price found in previous window');
        }
    } else {
        console.log('No current price found in current window');
    }
    console.log();
    
    // 5. Summary
    console.log('='.repeat(80));
    console.log('📋 SUMMARY:');
    console.log('='.repeat(80));
    console.log('User manual calculation (first vs last in graph): -69,36%');
    console.log('Advanced granularity 1m (canonical_items):', storedResult.rows[0]?.trend_1m, '%');
    console.log('Tooltip (trend-details.js): See above');
    console.log();
    console.log('🔍 DIFFERENCES TO INVESTIGATE:');
    console.log('1. Manual calculation uses first and last points in graph');
    console.log('2. Canonical updater uses latest point and point 30 days ago (with tolerance)');
    console.log('3. Tooltip uses most recent in current window and first in previous window');
    console.log('4. All three methods may use different data points!');
    
    await db.end();
}

debugTrend1m().catch(console.error);

