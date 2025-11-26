/**
 * Find which data points give -45.76% trend
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function findTrend() {
    const itemId = 2351; // Iron bar
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60);
    
    console.log('Finding data points that give -45.76% trend:');
    console.log(`Target trend: -45.7597173144876%`);
    console.log();
    
    // Check price_6h - maybe user sees this graph?
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
        console.log(`price_6h: ${graphData6h.rows.length} data points`);
        console.log('Checking all combinations of first and last points:');
        console.log();
        
        // Try first point with each subsequent point
        const first = graphData6h.rows[0];
        console.log(`Using first point: ${new Date(first.timestamp * 1000).toISOString()}, mid=${first.mid}`);
        console.log();
        
        for (let i = 1; i < graphData6h.rows.length; i++) {
            const last = graphData6h.rows[i];
            const trend = ((last.mid - first.mid) / first.mid) * 100;
            const diff = Math.abs(trend - (-45.7597173144876));
            
            if (diff < 0.1) {
                console.log(`✅ MATCH FOUND:`);
                console.log(`  First: ${new Date(first.timestamp * 1000).toISOString()}, mid=${first.mid}`);
                console.log(`  Last: ${new Date(last.timestamp * 1000).toISOString()}, mid=${last.mid}`);
                console.log(`  Trend: ${trend.toFixed(10)}%`);
                console.log(`  Difference: ${diff.toFixed(10)}%`);
                console.log();
            }
        }
        
        // Also try last point with each previous point
        const lastPoint = graphData6h.rows[graphData6h.rows.length - 1];
        console.log(`Using last point: ${new Date(lastPoint.timestamp * 1000).toISOString()}, mid=${lastPoint.mid}`);
        console.log();
        
        for (let i = 0; i < graphData6h.rows.length - 1; i++) {
            const firstPoint = graphData6h.rows[i];
            const trend = ((lastPoint.mid - firstPoint.mid) / firstPoint.mid) * 100;
            const diff = Math.abs(trend - (-45.7597173144876));
            
            if (diff < 0.1) {
                console.log(`✅ MATCH FOUND (reverse):`);
                console.log(`  First: ${new Date(firstPoint.timestamp * 1000).toISOString()}, mid=${firstPoint.mid}`);
                console.log(`  Last: ${new Date(lastPoint.timestamp * 1000).toISOString()}, mid=${lastPoint.mid}`);
                console.log(`  Trend: ${trend.toFixed(10)}%`);
                console.log(`  Difference: ${diff.toFixed(10)}%`);
                console.log();
            }
        }
    }
    
    // Also check if maybe user is looking at a different time range
    // What if first point is from price_6h but last is from price_1h?
    console.log('Checking if mixing granularities gives the result:');
    const latest1h = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_1h
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp DESC
        LIMIT 1
    `, [itemId, sevenDaysAgo, now]);
    
    if (latest1h.rows.length > 0 && graphData6h.rows.length > 0) {
        const first6h = graphData6h.rows[0];
        const last1h = latest1h.rows[0];
        const trend = ((last1h.mid - first6h.mid) / first6h.mid) * 100;
        const diff = Math.abs(trend - (-45.7597173144876));
        
        console.log(`First (price_6h): ${new Date(first6h.timestamp * 1000).toISOString()}, mid=${first6h.mid}`);
        console.log(`Last (price_1h): ${new Date(last1h.timestamp * 1000).toISOString()}, mid=${last1h.mid}`);
        console.log(`Trend: ${trend.toFixed(10)}%`);
        console.log(`Difference: ${diff.toFixed(10)}%`);
        if (diff < 0.1) {
            console.log(`✅ MATCH!`);
        }
    }
    
    await db.end();
}

findTrend().catch(console.error);

