/**
 * Script to check the latest 1h price point for Iron Bar (item_id 2351)
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkLatest1hPoint() {
    const itemId = 2351; // Iron bar
    
    console.log('='.repeat(80));
    console.log(`🔍 CHECKING LATEST 1H PRICE POINT FOR IRON BAR (${itemId})`);
    console.log('='.repeat(80));
    console.log();
    
    // Get the latest 1h price point
    const result = await db.query(`
        SELECT 
            timestamp,
            avg_high,
            avg_low,
            (avg_high + avg_low) / 2.0 AS mid,
            low_volume,
            high_volume,
            volume
        FROM price_1h
        WHERE item_id = $1
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp DESC
        LIMIT 1
    `, [itemId]);
    
    if (result.rows.length > 0) {
        const point = result.rows[0];
        const timestamp = point.timestamp;
        const date = new Date(timestamp * 1000);
        
        console.log('📊 LATEST 1H PRICE POINT:');
        console.log('-'.repeat(80));
        console.log(`Timestamp: ${timestamp}`);
        console.log(`Date: ${date.toISOString()}`);
        console.log(`Local time: ${date.toLocaleString()}`);
        console.log(`UTC time: ${date.toUTCString()}`);
        console.log();
        console.log(`avg_high: ${point.avg_high}`);
        console.log(`avg_low: ${point.avg_low}`);
        console.log(`mid: ${point.mid}`);
        console.log(`low_volume: ${point.low_volume}`);
        console.log(`high_volume: ${point.high_volume}`);
        console.log(`volume: ${point.volume}`);
        console.log();
        
        // Check if timestamp represents start or end of 1-hour period
        // If it's offset by 1 hour, it should be at a whole hour (e.g., 9:00, 10:00)
        // If it's not offset, it might be at 8:00, 9:00, etc. (start of period)
        const minutes = date.getUTCMinutes();
        const seconds = date.getUTCSeconds();
        console.log('📅 TIMESTAMP ANALYSIS:');
        console.log('-'.repeat(80));
        console.log(`UTC minutes: ${minutes}`);
        console.log(`UTC seconds: ${seconds}`);
        
        if (minutes === 0 && seconds === 0) {
            console.log('✅ Timestamp is at a whole hour (likely represents END of 1-hour period)');
        } else {
            console.log('⚠️  Timestamp is NOT at a whole hour (likely represents START of 1-hour period)');
            console.log(`   Expected: whole hour (e.g., 9:00:00)`);
            console.log(`   Actual: ${date.getUTCHours()}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }
        
        // Get a few more recent points for context
        console.log();
        console.log('📊 LAST 5 1H PRICE POINTS:');
        console.log('-'.repeat(80));
        const recentResult = await db.query(`
            SELECT 
                timestamp,
                avg_high,
                avg_low,
                (avg_high + avg_low) / 2.0 AS mid
            FROM price_1h
            WHERE item_id = $1
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC
            LIMIT 5
        `, [itemId]);
        
        recentResult.rows.forEach((row, idx) => {
            const date = new Date(row.timestamp * 1000);
            console.log(`${idx + 1}. ${date.toISOString()} (${date.toLocaleString()}) - mid: ${row.mid}`);
        });
        
        // Check current time and compare
        console.log();
        console.log('⏰ TIME COMPARISON:');
        console.log('-'.repeat(80));
        const now = Math.floor(Date.now() / 1000);
        const nowDate = new Date(now * 1000);
        console.log(`Current time: ${nowDate.toISOString()} (${nowDate.toLocaleString()})`);
        console.log(`Latest 1h point: ${date.toISOString()} (${date.toLocaleString()})`);
        const timeDiff = now - timestamp;
        const hoursDiff = timeDiff / 3600;
        console.log(`Time difference: ${timeDiff} seconds (${hoursDiff.toFixed(2)} hours)`);
        
        if (hoursDiff < 1) {
            console.log('✅ Latest point is less than 1 hour old');
        } else if (hoursDiff < 2) {
            console.log('⚠️  Latest point is 1-2 hours old (might be waiting for next poll)');
        } else {
            console.log('❌ Latest point is more than 2 hours old (might be a problem)');
        }
        
    } else {
        console.log('❌ No 1h price points found for Iron Bar');
    }
    
    await db.end();
}

checkLatest1hPoint().catch(console.error);

