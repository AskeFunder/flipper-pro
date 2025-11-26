/**
 * Find which price_1h data points give -45.76% trend
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function findTrend1h() {
    const itemId = 2351; // Iron bar
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60);
    
    console.log('Finding price_1h data points that give -45.76% trend:');
    console.log(`Target trend: -45.7597173144876%`);
    console.log(`Window: ${new Date(sevenDaysAgo * 1000).toISOString()} to ${new Date(now * 1000).toISOString()}`);
    console.log();
    
    // Get all price_1h data in 7d window
    const graphData1h = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_1h
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp ASC
    `, [itemId, sevenDaysAgo, now]);
    
    if (graphData1h.rows.length > 0) {
        console.log(`price_1h: ${graphData1h.rows.length} data points`);
        console.log();
        
        // Show first and last
        const first = graphData1h.rows[0];
        const last = graphData1h.rows[graphData1h.rows.length - 1];
        console.log(`First point: ${new Date(first.timestamp * 1000).toISOString()}, mid=${first.mid}`);
        console.log(`Last point: ${new Date(last.timestamp * 1000).toISOString()}, mid=${last.mid}`);
        const trend = ((last.mid - first.mid) / first.mid) * 100;
        console.log(`Trend (first vs last): ${trend.toFixed(10)}%`);
        console.log();
        
        // Check all combinations
        console.log('Checking all combinations of first and last points:');
        console.log();
        
        // Try first point with each subsequent point
        console.log(`Using first point: ${new Date(first.timestamp * 1000).toISOString()}, mid=${first.mid}`);
        console.log();
        
        for (let i = 1; i < graphData1h.rows.length; i++) {
            const lastPoint = graphData1h.rows[i];
            const trend = ((lastPoint.mid - first.mid) / first.mid) * 100;
            const diff = Math.abs(trend - (-45.7597173144876));
            
            if (diff < 0.01) {
                console.log(`✅ MATCH FOUND:`);
                console.log(`  First: ${new Date(first.timestamp * 1000).toISOString()}, mid=${first.mid}`);
                console.log(`  Last: ${new Date(lastPoint.timestamp * 1000).toISOString()}, mid=${lastPoint.mid}`);
                console.log(`  Trend: ${trend.toFixed(10)}%`);
                console.log(`  Difference: ${diff.toFixed(10)}%`);
                console.log();
            }
        }
        
        // Also try last point with each previous point
        console.log(`Using last point: ${new Date(last.timestamp * 1000).toISOString()}, mid=${last.mid}`);
        console.log();
        
        for (let i = 0; i < graphData1h.rows.length - 1; i++) {
            const firstPoint = graphData1h.rows[i];
            const trend = ((last.mid - firstPoint.mid) / firstPoint.mid) * 100;
            const diff = Math.abs(trend - (-45.7597173144876));
            
            if (diff < 0.01) {
                console.log(`✅ MATCH FOUND (reverse):`);
                console.log(`  First: ${new Date(firstPoint.timestamp * 1000).toISOString()}, mid=${firstPoint.mid}`);
                console.log(`  Last: ${new Date(last.timestamp * 1000).toISOString()}, mid=${last.mid}`);
                console.log(`  Trend: ${trend.toFixed(10)}%`);
                console.log(`  Difference: ${diff.toFixed(10)}%`);
                console.log();
            }
        }
        
        // Show all data points for reference
        console.log('All price_1h data points in 7d window:');
        graphData1h.rows.forEach((row, idx) => {
            console.log(`  ${idx + 1}. ${new Date(row.timestamp * 1000).toISOString()}: mid=${row.mid}`);
        });
    } else {
        console.log('No data points found in price_1h for 7d window');
    }
    
    await db.end();
}

findTrend1h().catch(console.error);

