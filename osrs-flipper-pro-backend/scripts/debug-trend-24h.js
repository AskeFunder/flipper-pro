/**
 * Debug script to check trend_24h calculation
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function debugTrend24h(itemId) {
    const now = Math.floor(Date.now() / 1000);
    const fiveMinutesAgo = now - 300;
    
    console.log('='.repeat(80));
    console.log(`🔍 DEBUGGING trend_24h FOR ITEM ${itemId}`);
    console.log('='.repeat(80));
    console.log(`Current timestamp: ${new Date(now * 1000).toISOString()}`);
    console.log(`Five minutes ago: ${new Date(fiveMinutesAgo * 1000).toISOString()}`);
    console.log();
    
    // 1. Check stored trend_24h
    console.log('📊 1. STORED trend_24h IN canonical_items:');
    console.log('-'.repeat(80));
    const storedResult = await db.query(`
        SELECT trend_24h
        FROM canonical_items
        WHERE item_id = $1
    `, [itemId]);
    
    if (storedResult.rows.length > 0) {
        console.log(`Stored trend_24h: ${storedResult.rows[0].trend_24h}`);
    } else {
        console.log('No canonical_items record found');
    }
    console.log();
    
    // 2. Get latest datapoint within last 5 minutes
    console.log('📊 2. LATEST DATAPOINT WITHIN LAST 5 MINUTES:');
    console.log('-'.repeat(80));
    const latestResult = await db.query(`
        SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
        FROM price_5m
        WHERE item_id = $1
          AND timestamp >= $2
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp DESC
        LIMIT 1
    `, [itemId, fiveMinutesAgo]);
    
    if (latestResult.rows.length > 0) {
        const latest = latestResult.rows[0];
        console.log(`Latest datapoint: ${new Date(latest.timestamp * 1000).toISOString()}`);
        console.log(`  avg_high: ${latest.avg_high}`);
        console.log(`  avg_low: ${latest.avg_low}`);
        console.log(`  mid: ${latest.mid}`);
        
        const latestTimestamp = latest.timestamp;
        const latestMid = parseFloat(latest.mid);
        const twentyFourHoursBeforeLatest = latestTimestamp - 86400;
        
        console.log();
        console.log(`Looking for price at or before: ${new Date(twentyFourHoursBeforeLatest * 1000).toISOString()}`);
        console.log(`  (24 hours before latest datapoint)`);
        
        // 3. Get price from 24 hours before latest
        const previousResult = await db.query(`
            SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
            FROM price_5m
            WHERE item_id = $1
              AND timestamp <= $2
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC
            LIMIT 1
        `, [itemId, twentyFourHoursBeforeLatest]);
        
        if (previousResult.rows.length > 0) {
            const prev = previousResult.rows[0];
            console.log();
            console.log(`Previous datapoint: ${new Date(prev.timestamp * 1000).toISOString()}`);
            console.log(`  avg_high: ${prev.avg_high}`);
            console.log(`  avg_low: ${prev.avg_low}`);
            console.log(`  mid: ${prev.mid}`);
            
            const previousMid = parseFloat(prev.mid);
            
            console.log();
            console.log('📊 3. CALCULATION:');
            console.log('-'.repeat(80));
            console.log(`Latest mid: ${latestMid}`);
            console.log(`Previous mid: ${previousMid}`);
            console.log(`Difference: ${latestMid - previousMid}`);
            console.log(`Formula: 100.0 * (${latestMid} - ${previousMid}) / ${previousMid}`);
            
            const trend = (100.0 * (latestMid - previousMid) / previousMid);
            console.log(`Calculated trend: ${trend}%`);
            console.log(`Rounded to 2 decimals: ${parseFloat(trend.toFixed(2))}%`);
            console.log(`Expected: -4.0625%`);
            console.log(`Difference: ${Math.abs(trend - (-4.0625))}%`);
            
            // 4. Check if there are other datapoints that might give -4.0625%
            console.log();
            console.log('📊 4. CHECKING FOR OTHER DATAPOINTS:');
            console.log('-'.repeat(80));
            const allRecentResult = await db.query(`
                SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
                FROM price_5m
                WHERE item_id = $1
                  AND timestamp >= $2
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY timestamp DESC
                LIMIT 5
            `, [itemId, fiveMinutesAgo]);
            
            console.log(`Found ${allRecentResult.rows.length} datapoints within last 5 minutes:`);
            allRecentResult.rows.forEach((row, idx) => {
                console.log(`  ${idx + 1}. ${new Date(row.timestamp * 1000).toISOString()} - mid: ${row.mid}`);
            });
            
            // Check what price would give -4.0625%
            console.log();
            console.log('📊 5. REVERSE CALCULATION:');
            console.log('-'.repeat(80));
            // If trend should be -4.0625%, then:
            // -4.0625 = 100.0 * (latestMid - X) / X
            // -4.0625 / 100 = (latestMid - X) / X
            // -0.040625 = (latestMid - X) / X
            // -0.040625 * X = latestMid - X
            // -0.040625 * X + X = latestMid
            // X * (1 - 0.040625) = latestMid
            // X = latestMid / (1 - 0.040625)
            // X = latestMid / 0.959375
            const expectedPreviousMid = latestMid / (1 - (-4.0625 / 100));
            console.log(`If trend should be -4.0625% with latest mid ${latestMid}:`);
            console.log(`  Expected previous mid: ${expectedPreviousMid}`);
            console.log(`  Actual previous mid: ${previousMid}`);
            console.log(`  Difference: ${Math.abs(previousMid - expectedPreviousMid)}`);
            
            // Check datapoints around 24h before (within ±1 hour)
            console.log();
            console.log('📊 6. DATAPOINTS AROUND 24H BEFORE:');
            console.log('-'.repeat(80));
            const aroundResult = await db.query(`
                SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid
                FROM price_5m
                WHERE item_id = $1
                  AND timestamp >= $2
                  AND timestamp <= $3
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY timestamp DESC
            `, [itemId, twentyFourHoursBeforeLatest - 3600, twentyFourHoursBeforeLatest + 3600]);
            
            console.log(`Found ${aroundResult.rows.length} datapoints within ±1 hour of 24h before:`);
            aroundResult.rows.forEach((r, idx) => {
                const trend = (100.0 * (latestMid - parseFloat(r.mid)) / parseFloat(r.mid));
                console.log(`  ${idx + 1}. ${new Date(r.timestamp * 1000).toISOString()} - mid: ${r.mid}, trend: ${trend.toFixed(4)}%`);
            });
            
            // Check if there's a datapoint that gives exactly -4.0625%
            console.log();
            console.log('📊 7. FINDING DATAPOINT THAT GIVES -4.0625%:');
            console.log('-'.repeat(80));
            const all24hResult = await db.query(`
                SELECT timestamp, avg_high, avg_low, (avg_high + avg_low) / 2.0 AS mid,
                       ABS((100.0 * ($2 - (avg_high + avg_low) / 2.0) / ((avg_high + avg_low) / 2.0)) - (-4.0625)) AS trend_diff
                FROM price_5m
                WHERE item_id = $1
                  AND timestamp <= $3
                  AND timestamp >= $3 - 86400
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY trend_diff ASC
                LIMIT 5
            `, [itemId, latestMid, latestTimestamp]);
            
            console.log(`Top 5 datapoints closest to giving -4.0625%:`);
            all24hResult.rows.forEach((r, idx) => {
                const trend = (100.0 * (latestMid - parseFloat(r.mid)) / parseFloat(r.mid));
                console.log(`  ${idx + 1}. ${new Date(r.timestamp * 1000).toISOString()} - mid: ${r.mid}, trend: ${trend.toFixed(4)}%, diff: ${r.trend_diff.toFixed(4)}%`);
            });
        } else {
            console.log('❌ No previous datapoint found');
        }
    } else {
        console.log('❌ No latest datapoint found within last 5 minutes');
    }
    
    await db.end();
}

const itemId = process.argv[2] ? parseInt(process.argv[2]) : 2351;
debugTrend24h(itemId).catch(console.error);
