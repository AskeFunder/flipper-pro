/**
 * Debug script to investigate trend_7d calculation discrepancy
 * User reports:
 * - Manual calculation (first vs last point in 7d graph): -45.7597173144876%
 * - Advanced granularity 7d: -45.05%
 * - Tooltip: -45.05%
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function debugTrend7d() {
    const itemId = 2351; // Iron bar (same as before)
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60); // 7 days ago
    
    console.log('='.repeat(80));
    console.log(`🔍 DEBUGGING trend_7d FOR IRON BAR (${itemId})`);
    console.log('='.repeat(80));
    console.log(`Current timestamp: ${new Date(now * 1000).toISOString()}`);
    console.log(`Seven days ago: ${new Date(sevenDaysAgo * 1000).toISOString()}`);
    console.log();
    
    // 1. Get stored trend_7d from canonical_items
    console.log('📊 1. STORED trend_7d IN canonical_items:');
    console.log('-'.repeat(80));
    const storedResult = await db.query(`
        SELECT trend_7d
        FROM canonical_items
        WHERE item_id = $1
    `, [itemId]);
    
    if (storedResult.rows.length > 0) {
        console.log(`Stored trend_7d: ${storedResult.rows[0].trend_7d}%`);
    } else {
        console.log('No canonical_items record found');
    }
    console.log();
    
    // 2. Get first and last data points in 7d graph (what user sees)
    // Check different granularities to see which one the graph uses
    console.log('📊 2. FIRST AND LAST DATA POINTS IN 7D GRAPH:');
    console.log('-'.repeat(80));
    
    // Check price_24h (likely what 7d graph uses)
    const graphData24h = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_24h
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp ASC
    `, [itemId, sevenDaysAgo, now]);
    
    if (graphData24h.rows.length > 0) {
        const first = graphData24h.rows[0];
        const last = graphData24h.rows[graphData24h.rows.length - 1];
        console.log(`price_24h: ${graphData24h.rows.length} data points`);
        console.log(`First point: ${new Date(first.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${first.avg_high}, avg_low: ${first.avg_low}, mid: ${first.mid}`);
        console.log(`Last point: ${new Date(last.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${last.avg_high}, avg_low: ${last.avg_low}, mid: ${last.mid}`);
        
        const manualTrend = ((last.mid - first.mid) / first.mid) * 100;
        console.log(`Manual calculation (last - first) / first * 100: ${manualTrend.toFixed(10)}%`);
        console.log(`User reported: -45.7597173144876%`);
        console.log(`Frontend shows: -54.29%`);
        console.log();
        console.log('All price_24h data points in 7d window:');
        graphData24h.rows.forEach((row, idx) => {
            console.log(`  ${idx + 1}. ${new Date(row.timestamp * 1000).toISOString()}: mid=${row.mid}`);
        });
    } else {
        console.log('No data points found in price_24h for 7d window');
    }
    console.log();
    
    // Check price_6h (alternative - maybe graph uses this?)
    const graphData6h = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_6h
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp ASC
    `, [itemId, sevenDaysAgo, now]);
    
    if (graphData6h.rows.length > 0) {
        const first = graphData6h.rows[0];
        const last = graphData6h.rows[graphData6h.rows.length - 1];
        console.log(`price_6h: ${graphData6h.rows.length} data points`);
        console.log(`First point: ${new Date(first.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${first.avg_high}, avg_low: ${first.avg_low}, mid: ${first.mid}`);
        console.log(`Last point: ${new Date(last.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${last.avg_high}, avg_low: ${last.avg_low}, mid: ${last.mid}`);
        
        const manualTrend = ((last.mid - first.mid) / first.mid) * 100;
        console.log(`Manual calculation (last - first) / first * 100: ${manualTrend.toFixed(10)}%`);
        console.log();
        console.log('All price_6h data points in 7d window (first 5 and last 5):');
        const first5 = graphData6h.rows.slice(0, 5);
        const last5 = graphData6h.rows.slice(-5);
        first5.forEach((row, idx) => {
            console.log(`  ${idx + 1}. ${new Date(row.timestamp * 1000).toISOString()}: mid=${row.mid}`);
        });
        console.log(`  ... (${graphData6h.rows.length - 10} more points) ...`);
        last5.forEach((row, idx) => {
            console.log(`  ${graphData6h.rows.length - 4 + idx}. ${new Date(row.timestamp * 1000).toISOString()}: mid=${row.mid}`);
        });
    }
    console.log();
    
    // 3. Check how trend_7d is calculated in update-canonical-items.js
    // According to PHASE 3, trend_7d uses calculate7DTrendFrom1hCandles
    console.log('📊 3. HOW trend_7d IS CALCULATED (update-canonical-items.js logic):');
    console.log('-'.repeat(80));
    console.log('According to PHASE 3, trend_7d uses calculate7DTrendFrom1hCandles');
    console.log('This uses 1h candles with:');
    console.log('  - periodSeconds = 7 * 24 * 60 * 60 (7 days)');
    console.log('  - toleranceSeconds = 6 * 60 * 60 (±6 hours)');
    console.log();
    
    const periodSeconds = 7 * 24 * 60 * 60; // 7 days
    const toleranceSeconds = 6 * 60 * 60; // ±6 hours
    const windowStart = now - (8 * 24 * 60 * 60); // 8 days ago (buffer)
    const windowEnd = now;
    
    // Get latest price (current) from price_1h
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
        console.log(`Current (latest) price from price_1h: ${new Date(current.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${current.avg_high}, avg_low: ${current.avg_low}, mid: ${current.mid}`);
        
        // Get previous price (7 days ago, with tolerance)
        const targetTimestamp = current.timestamp - periodSeconds;
        const toleranceLower = targetTimestamp - toleranceSeconds;
        const toleranceUpper = targetTimestamp + toleranceSeconds;
        
        console.log(`Target timestamp (7 days ago): ${new Date(targetTimestamp * 1000).toISOString()}`);
        console.log(`Tolerance: ±${toleranceSeconds / 3600} hours`);
        console.log(`Search window: ${new Date(toleranceLower * 1000).toISOString()} to ${new Date(toleranceUpper * 1000).toISOString()}`);
        
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
            console.log(`Previous (7 days ago) price from price_1h: ${new Date(previous.timestamp * 1000).toISOString()}`);
            console.log(`  avg_high: ${previous.avg_high}, avg_low: ${previous.avg_low}, mid: ${previous.mid}`);
            console.log(`  Priority: ${previous.priority}, Distance from target: ${previous.distance} seconds (${(previous.distance / 3600).toFixed(2)} hours)`);
            
            const calculatedTrend = ((current.mid - previous.mid) / previous.mid) * 100;
            console.log(`Calculated trend: (${current.mid} - ${previous.mid}) / ${previous.mid} * 100 = ${calculatedTrend.toFixed(2)}%`);
            console.log(`Stored trend_7d: ${storedResult.rows[0]?.trend_7d}%`);
        } else {
            console.log('No previous price found within tolerance');
        }
    } else {
        console.log('No current price found');
    }
    console.log();
    
    // 4. Summary
    console.log('='.repeat(80));
    console.log('📋 SUMMARY:');
    console.log('='.repeat(80));
    console.log('User manual calculation (first vs last in graph): -45.7597173144876%');
    console.log('Advanced granularity 7d (canonical_items):', storedResult.rows[0]?.trend_7d, '%');
    console.log('Tooltip (trend-details.js): -45.05%');
    console.log();
    console.log('🔍 DIFFERENCES TO INVESTIGATE:');
    console.log('1. Manual calculation uses first and last points in graph (likely price_24h)');
    console.log('2. Canonical updater uses latest point and point 7 days ago (with tolerance) from price_1h');
    console.log('3. Tooltip uses same logic as canonical updater');
    console.log('4. All three methods may use different data points!');
    
    await db.end();
}

debugTrend7d().catch(console.error);

