/**
 * Debug script to investigate trend_6h calculation
 * User reports:
 * - Manual calculation (last 6 hours in 12h graph): 2.68%
 * - System shows: 7.43%
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function debugTrend6h() {
    const itemId = 2351; // Iron bar
    const now = Math.floor(Date.now() / 1000);
    const sixHoursAgo = now - (6 * 60 * 60); // 6 hours ago
    const twelveHoursAgo = now - (12 * 60 * 60); // 12 hours ago
    
    console.log('='.repeat(80));
    console.log(`🔍 DEBUGGING trend_6h FOR IRON BAR (${itemId})`);
    console.log('='.repeat(80));
    console.log(`Current timestamp: ${new Date(now * 1000).toISOString()}`);
    console.log(`Six hours ago: ${new Date(sixHoursAgo * 1000).toISOString()}`);
    console.log(`Twelve hours ago: ${new Date(twelveHoursAgo * 1000).toISOString()}`);
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
    }
    console.log();
    
    // 2. Check what data the 12h graph uses (last 6 hours of 12h graph)
    console.log('📊 2. LAST 6 HOURS IN 12H GRAPH (what user sees):');
    console.log('-'.repeat(80));
    
    // Check price_6h (likely what 12h graph uses)
    const graphData6h = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_6h
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp ASC
    `, [itemId, sixHoursAgo, now]);
    
    if (graphData6h.rows.length > 0) {
        const first = graphData6h.rows[0];
        const last = graphData6h.rows[graphData6h.rows.length - 1];
        console.log(`price_6h (last 6h): ${graphData6h.rows.length} data points`);
        console.log(`First point: ${new Date(first.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${first.avg_high}, avg_low: ${first.avg_low}, mid: ${first.mid}`);
        console.log(`Last point: ${new Date(last.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${last.avg_high}, avg_low: ${last.avg_low}, mid: ${last.mid}`);
        
        const manualTrend = ((last.mid - first.mid) / first.mid) * 100;
        console.log(`Manual calculation (last - first) / first * 100: ${manualTrend.toFixed(10)}%`);
        console.log(`User reported: 2.684563758389262%`);
    } else {
        console.log('No data points found in price_6h for last 6h');
    }
    console.log();
    
    // 3. Check price_5m (what current code uses)
    console.log('📊 3. CURRENT CODE USES price_5m (last 6h):');
    console.log('-'.repeat(80));
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
        console.log(`price_5m (last 6h): ${graphData5m.rows.length} data points`);
        console.log(`First point: ${new Date(first.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${first.avg_high}, avg_low: ${first.avg_low}, mid: ${first.mid}`);
        console.log(`Last point: ${new Date(last.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${last.avg_high}, avg_low: ${last.avg_low}, mid: ${last.mid}`);
        
        const manualTrend = ((last.mid - first.mid) / first.mid) * 100;
        console.log(`Manual calculation (last - first) / first * 100: ${manualTrend.toFixed(10)}%`);
        console.log(`System shows: 7.43%`);
    }
    console.log();
    
    // 4. Summary
    console.log('='.repeat(80));
    console.log('📋 SUMMARY:');
    console.log('='.repeat(80));
    console.log('User manual calculation (last 6h in 12h graph, price_6h): 2.68%');
    console.log('Current code uses (price_5m): 7.43%');
    console.log('Stored trend_6h:', storedResult.rows[0]?.trend_6h, '%');
    console.log();
    console.log('🔍 CONCLUSION:');
    console.log('The 12h graph uses price_6h data, so trend_6h should use price_6h, not price_5m!');
    
    await db.end();
}

debugTrend6h().catch(console.error);

