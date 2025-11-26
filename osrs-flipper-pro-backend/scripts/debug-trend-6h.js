/**
 * Debug script to investigate trend_6h calculation discrepancy
 * User reports:
 * - Manual calculation (first vs last point in 6h graph): 2.33%
 * - Frontend shows: +58k%
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function debugTrend6h() {
    const itemId = 2351; // Iron bar
    const now = Math.floor(Date.now() / 1000);
    const sixHoursAgo = now - (6 * 60 * 60); // 6 hours ago
    
    console.log('='.repeat(80));
    console.log(`🔍 DEBUGGING trend_6h FOR IRON BAR (${itemId})`);
    console.log('='.repeat(80));
    console.log(`Current timestamp: ${new Date(now * 1000).toISOString()}`);
    console.log(`Six hours ago: ${new Date(sixHoursAgo * 1000).toISOString()}`);
    console.log();
    
    // 1. Get stored trend_6h from canonical_items
    console.log('📊 1. STORED trend_6h IN canonical_items:');
    console.log('-'.repeat(80));
    const storedResult = await db.query(`
        SELECT trend_6h
        FROM canonical_items
        WHERE item_id = $1
    `, [itemId]);
    
    if (storedResult.rows.length > 0) {
        console.log(`Stored trend_6h: ${storedResult.rows[0].trend_6h}%`);
    } else {
        console.log('No canonical_items record found');
    }
    console.log();
    
    // 2. Get first and last data points in 6h graph (what user sees)
    // Check different granularities to see which one the graph uses
    console.log('📊 2. FIRST AND LAST DATA POINTS IN 6H GRAPH:');
    console.log('-'.repeat(80));
    
    // Check price_5m (likely what 6h graph uses)
    const graphData5m = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_5m
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp ASC
    `, [itemId, sixHoursAgo, now]);
    
    if (graphData5m.rows.length > 0) {
        const first = graphData5m.rows[0];
        const last = graphData5m.rows[graphData5m.rows.length - 1];
        console.log(`price_5m: ${graphData5m.rows.length} data points`);
        console.log(`First point: ${new Date(first.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${first.avg_high}, avg_low: ${first.avg_low}, mid: ${first.mid}`);
        console.log(`Last point: ${new Date(last.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${last.avg_high}, avg_low: ${last.avg_low}, mid: ${last.mid}`);
        
        const manualTrend = ((last.mid - first.mid) / first.mid) * 100;
        console.log(`Manual calculation (last - first) / first * 100: ${manualTrend.toFixed(10)}%`);
        console.log(`User reported: 2.333333333333333%`);
    } else {
        console.log('No data points found in price_5m for 6h window');
    }
    console.log();
    
    // 3. Check how trend_6h is calculated in update-canonical-items.js
    // According to PHASE 2, trend_6h uses calculate6HTrendFrom5mCandles
    console.log('📊 3. HOW trend_6h IS CALCULATED (update-canonical-items.js logic):');
    console.log('-'.repeat(80));
    console.log('According to PHASE 2, trend_6h uses calculate6HTrendFrom5mCandles');
    console.log('This uses 5m candles with:');
    console.log('  - periodSeconds = 6 * 60 * 60 (6 hours)');
    console.log('  - toleranceSeconds = 20 * 60 (±20 minutes)');
    console.log();
    
    const periodSeconds = 6 * 60 * 60; // 6 hours
    const toleranceSeconds = 20 * 60; // ±20 minutes
    const windowStart = now - (8 * 60 * 60); // 8 hours ago (buffer)
    const windowEnd = now;
    
    // Get latest price (current) from price_5m
    const currentResult = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_5m
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp DESC
        LIMIT 1
    `, [itemId, windowStart, windowEnd]);
    
    if (currentResult.rows.length > 0) {
        const current = currentResult.rows[0];
        console.log(`Current (latest) price from price_5m: ${new Date(current.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${current.avg_high}, avg_low: ${current.avg_low}, mid: ${current.mid}`);
        
        // Get previous price (6 hours ago, with tolerance)
        const targetTimestamp = current.timestamp - periodSeconds;
        const toleranceLower = targetTimestamp - toleranceSeconds;
        const toleranceUpper = targetTimestamp + toleranceSeconds;
        
        console.log(`Target timestamp (6 hours ago): ${new Date(targetTimestamp * 1000).toISOString()}`);
        console.log(`Tolerance: ±${toleranceSeconds / 60} minutes`);
        console.log(`Search window: ${new Date(toleranceLower * 1000).toISOString()} to ${new Date(toleranceUpper * 1000).toISOString()}`);
        
        const previousResult = await db.query(`
            SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid,
                   ABS(timestamp - $1) AS distance
            FROM price_5m
            WHERE item_id = $2
              AND ABS(timestamp - $1) <= $3
              AND timestamp <= $4
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY ABS(timestamp - $1) ASC, timestamp ASC
            LIMIT 1
        `, [targetTimestamp, itemId, toleranceSeconds, current.timestamp]);
        
        if (previousResult.rows.length > 0) {
            const previous = previousResult.rows[0];
            console.log(`Previous (6 hours ago) price from price_5m: ${new Date(previous.timestamp * 1000).toISOString()}`);
            console.log(`  avg_high: ${previous.avg_high}, avg_low: ${previous.avg_low}, mid: ${previous.mid}`);
            console.log(`  Distance from target: ${previous.distance} seconds (${(previous.distance / 60).toFixed(2)} minutes)`);
            
            const calculatedTrend = ((current.mid - previous.mid) / previous.mid) * 100;
            console.log(`Calculated trend: (${current.mid} - ${previous.mid}) / ${previous.mid} * 100 = ${calculatedTrend.toFixed(2)}%`);
            console.log(`Stored trend_6h: ${storedResult.rows[0]?.trend_6h}%`);
            
            // Check if there's an extreme value issue
            if (Math.abs(calculatedTrend) > 1000) {
                console.log(`⚠️  WARNING: Extreme trend value detected!`);
                console.log(`  This might be due to very low previous price or calculation error.`);
            }
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
    console.log('User manual calculation (first vs last in graph): 2.33%');
    console.log('Advanced granularity 6h (canonical_items):', storedResult.rows[0]?.trend_6h, '%');
    console.log('Frontend shows: +58k%');
    console.log();
    console.log('🔍 DIFFERENCES TO INVESTIGATE:');
    console.log('1. Manual calculation uses first and last points in graph (price_5m)');
    console.log('2. Canonical updater uses latest point and point 6 hours ago (with tolerance) from price_5m');
    console.log('3. Frontend shows extreme value (+58k%) - possible calculation error or data issue');
    
    await db.end();
}

debugTrend6h().catch(console.error);

