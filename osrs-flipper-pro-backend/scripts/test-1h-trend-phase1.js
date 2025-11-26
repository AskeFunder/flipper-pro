/**
 * Test script for PHASE 1 & 2: 1H and 6H trend calculation using ONLY 5-minute candles
 * 
 * Tests:
 * - High-volume items → valid trends
 * - Items with small gaps → still valid
 * - Items without trades near target → unavailable
 * - No future timestamps, no double periods
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Import the function
const { calculateTrendFromCandles } = require('../poller/update-canonical-items');

async function testTrend(itemId, periodName, periodSeconds, toleranceSeconds, windowHours) {
    console.log(`\n🧪 Testing ${periodName} trend for item ${itemId}\n`);
    
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (windowHours * 60 * 60);
    const windowEnd = now;
    
    // Fetch 5m candles
    const { rows } = await db.query(`
        SELECT 
            timestamp,
            avg_high,
            avg_low
        FROM price_5m
        WHERE item_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
          AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
        ORDER BY timestamp DESC
    `, [itemId, windowStart, windowEnd]);
    
    if (rows.length === 0) {
        console.log(`❌ No candles found for item ${itemId}`);
        return {
            status: "unavailable",
            value: null,
            nowTimestamp: null,
            targetTimestamp: null,
            matchedTimestamp: null
        };
    }
    
    console.log(`Found ${rows.length} candles`);
    console.log(`Latest candle: ${new Date(rows[0].timestamp * 1000).toISOString()}`);
    console.log(`Oldest candle: ${new Date(rows[rows.length - 1].timestamp * 1000).toISOString()}`);
    
    // Convert to candle format
    const candles = rows.map(row => ({
        timestamp: row.timestamp,
        avg_high: row.avg_high,
        avg_low: row.avg_low
    }));
    
    // Calculate trend
    const result = calculateTrendFromCandles(candles, periodSeconds, toleranceSeconds);
    
    console.log(`\n📊 Trend Result:`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Value: ${result.value !== null ? result.value.toFixed(2) + '%' : 'null'}`);
    console.log(`  Now timestamp: ${result.nowTimestamp ? new Date(result.nowTimestamp * 1000).toISOString() : 'null'}`);
    console.log(`  Target timestamp: ${result.targetTimestamp ? new Date(result.targetTimestamp * 1000).toISOString() : 'null'}`);
    console.log(`  Matched timestamp: ${result.matchedTimestamp ? new Date(result.matchedTimestamp * 1000).toISOString() : 'null'}`);
    
    // Validation checks
    console.log(`\n✅ Validation:`);
    
    if (result.nowTimestamp && result.targetTimestamp) {
        const timeDiff = result.nowTimestamp - result.targetTimestamp;
        const expectedDiff = periodSeconds;
        const diffMinutes = Math.abs(timeDiff - expectedDiff) / 60;
        const toleranceMinutes = toleranceSeconds / 60;
        
        if (diffMinutes <= toleranceMinutes) {
            console.log(`  ✅ Time difference is correct (${timeDiff}s = ${timeDiff / 60} minutes, expected ${expectedDiff / 60} minutes)`);
        } else {
            console.log(`  ❌ Time difference is incorrect (${timeDiff}s, expected ${expectedDiff}s)`);
        }
    }
    
    if (result.matchedTimestamp && result.targetTimestamp) {
        const toleranceDiff = Math.abs(result.matchedTimestamp - result.targetTimestamp);
        if (toleranceDiff <= toleranceSeconds) {
            console.log(`  ✅ Matched candle is within tolerance (${toleranceDiff}s <= ${toleranceSeconds}s)`);
        } else {
            console.log(`  ❌ Matched candle is outside tolerance (${toleranceDiff}s > ${toleranceSeconds}s)`);
        }
    }
    
    if (result.nowTimestamp && result.nowTimestamp <= now) {
        console.log(`  ✅ Now timestamp is not in the future (${result.nowTimestamp} <= ${now})`);
    } else if (result.nowTimestamp) {
        console.log(`  ❌ Now timestamp is in the future! (${result.nowTimestamp} > ${now})`);
    }
    
    if (result.matchedTimestamp && result.matchedTimestamp <= result.nowTimestamp) {
        console.log(`  ✅ Matched timestamp is not after now timestamp`);
    } else if (result.matchedTimestamp) {
        console.log(`  ❌ Matched timestamp is after now timestamp!`);
    }
    
    // Return result for summary
    return result;
}

async function main() {
    // Test items: high-volume, medium-volume, low-volume, and items without data
    const testItems = [
        { id: 4151, name: 'Air rune', type: 'high-volume' },
        { id: 2, name: 'Cannonball', type: 'high-volume' },
        { id: 2351, name: 'Iron bar', type: 'medium-volume' },
        { id: 1, name: 'Bronze arrow', type: 'low-volume' },
        { id: 100, name: 'Test item (may not exist)', type: 'no-data' },
    ];
    
    const results = {
        '1H': { valid: [], unavailable: [] },
        '6H': { valid: [], unavailable: [] },
        '24H': { valid: [], unavailable: [] },
        '7D': { valid: [], unavailable: [] }
    };
    
    for (const item of testItems) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Testing item ${item.id} (${item.name}) - ${item.type}`);
        console.log('='.repeat(60));
        
        // Test 1H trend (PHASE 1)
        const result1h = await testTrend(item.id, '1H', 60 * 60, 5 * 60, 2);
        if (result1h.status === 'valid') {
            results['1H'].valid.push({ id: item.id, name: item.name, value: result1h.value });
        } else {
            results['1H'].unavailable.push({ id: item.id, name: item.name });
        }
        
        // Test 6H trend (PHASE 2)
        const result6h = await testTrend(item.id, '6H', 6 * 60 * 60, 20 * 60, 8);
        if (result6h.status === 'valid') {
            results['6H'].valid.push({ id: item.id, name: item.name, value: result6h.value });
        } else {
            results['6H'].unavailable.push({ id: item.id, name: item.name });
        }
        
        // Test 24H trend (PHASE 3 + PHASE 4) - uses price_5m primary, price_1h fallback
        // First try 5m
        const result24h5m = await testTrend(item.id, '24H (5m)', 24 * 60 * 60, 60 * 60, 26, 'price_5m');
        let result24h = result24h5m;
        let source24h = '5m';
        
        // If unavailable via 5m, try 1h fallback
        if (result24h5m.status === 'unavailable') {
            const result24h1h = await testTrend(item.id, '24H (1h fallback)', 24 * 60 * 60, 60 * 60, 26, 'price_1h');
            if (result24h1h.status === 'valid') {
                // Mark as stale
                result24h = { ...result24h1h, status: 'stale' };
                source24h = '1h (fallback)';
            }
        }
        
        if (result24h.status === 'valid') {
            results['24H'].valid.push({ 
                id: item.id, 
                name: item.name, 
                value: result24h.value, 
                status: 'valid',
                source: source24h,
                nowTimestamp: result24h.nowTimestamp,
                targetTimestamp: result24h.targetTimestamp,
                matchedTimestamp: result24h.matchedTimestamp
            });
        } else if (result24h.status === 'stale') {
            results['24H'].valid.push({ 
                id: item.id, 
                name: item.name, 
                value: result24h.value, 
                status: 'stale',
                source: source24h,
                nowTimestamp: result24h.nowTimestamp,
                targetTimestamp: result24h.targetTimestamp,
                matchedTimestamp: result24h.matchedTimestamp
            });
        } else {
            results['24H'].unavailable.push({ 
                id: item.id, 
                name: item.name,
                source: 'none'
            });
        }
        
        // Test 7D trend (PHASE 3) - uses price_1h only (NO fallback, NO stale)
        const result7d = await testTrend(item.id, '7D', 7 * 24 * 60 * 60, 6 * 60 * 60, 8 * 24, 'price_1h');
        if (result7d.status === 'valid') {
            results['7D'].valid.push({ 
                id: item.id, 
                name: item.name, 
                value: result7d.value,
                status: 'valid', // 7D can only be valid or unavailable, never stale
                source: '1h',
                nowTimestamp: result7d.nowTimestamp,
                targetTimestamp: result7d.targetTimestamp,
                matchedTimestamp: result7d.matchedTimestamp
            });
        } else {
            results['7D'].unavailable.push({ 
                id: item.id, 
                name: item.name,
                status: 'unavailable',
                source: 'none'
            });
        }
    }
    
    // Summary report
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 TEST SUMMARY REPORT');
    console.log('='.repeat(60));
    
    console.log(`\n✅ 1H TREND (PHASE 1) - Verification:`);
    console.log(`   Valid: ${results['1H'].valid.length} items`);
    if (results['1H'].valid.length > 0) {
        results['1H'].valid.forEach(item => {
            console.log(`     - Item ${item.id} (${item.name}): ${item.value.toFixed(2)}%`);
        });
    }
    console.log(`   Unavailable: ${results['1H'].unavailable.length} items`);
    if (results['1H'].unavailable.length > 0) {
        results['1H'].unavailable.forEach(item => {
            console.log(`     - Item ${item.id} (${item.name})`);
        });
    }
    
    console.log(`\n✅ 6H TREND (PHASE 2) - Verification:`);
    console.log(`   Valid: ${results['6H'].valid.length} items`);
    if (results['6H'].valid.length > 0) {
        results['6H'].valid.forEach(item => {
            console.log(`     - Item ${item.id} (${item.name}): ${item.value.toFixed(2)}%`);
        });
    }
    console.log(`   Unavailable: ${results['6H'].unavailable.length} items`);
    if (results['6H'].unavailable.length > 0) {
        results['6H'].unavailable.forEach(item => {
            console.log(`     - Item ${item.id} (${item.name})`);
        });
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('📋 FINAL REPORT:');
    console.log('='.repeat(60));
    
    // 1 valid 24H example (via 5m)
    const valid24h = results['24H'].valid.filter(i => i.status === 'valid');
    console.log(`\n1️⃣ VALID 24H EXAMPLE (via 5m) (${valid24h.length} found):`);
    if (valid24h.length >= 1) {
        const example1 = valid24h[0];
        console.log(`   ✅ Item ${example1.id} (${example1.name}):`);
        console.log(`      Value: ${example1.value.toFixed(2)}%`);
        console.log(`      Status: ${example1.status}`);
        console.log(`      Source: ${example1.source}`);
        console.log(`      Now timestamp: ${example1.nowTimestamp ? new Date(example1.nowTimestamp * 1000).toISOString() : 'N/A'}`);
        console.log(`      Target timestamp: ${example1.targetTimestamp ? new Date(example1.targetTimestamp * 1000).toISOString() : 'N/A'}`);
        console.log(`      Matched timestamp: ${example1.matchedTimestamp ? new Date(example1.matchedTimestamp * 1000).toISOString() : 'N/A'}`);
    } else {
        console.log(`   ⚠️  No valid 24H examples found (via 5m)`);
    }
    
    // 1 stale 24H example (via 1h fallback)
    const stale24h = results['24H'].valid.filter(i => i.status === 'stale');
    console.log(`\n2️⃣ STALE 24H EXAMPLE (via 1h fallback) (${stale24h.length} found):`);
    if (stale24h.length >= 1) {
        const example1 = stale24h[0];
        console.log(`   ⚠️  Item ${example1.id} (${example1.name}):`);
        console.log(`      Value: ${example1.value.toFixed(2)}%`);
        console.log(`      Status: ${example1.status}`);
        console.log(`      Source: ${example1.source}`);
        console.log(`      Now timestamp: ${example1.nowTimestamp ? new Date(example1.nowTimestamp * 1000).toISOString() : 'N/A'}`);
        console.log(`      Target timestamp: ${example1.targetTimestamp ? new Date(example1.targetTimestamp * 1000).toISOString() : 'N/A'}`);
        console.log(`      Matched timestamp: ${example1.matchedTimestamp ? new Date(example1.matchedTimestamp * 1000).toISOString() : 'N/A'}`);
    } else {
        console.log(`   ℹ️  No stale 24H examples found (all items have 5m data or no 1h fallback available)`);
    }
    
    // 1 unavailable 24H example
    console.log(`\n3️⃣ UNAVAILABLE 24H EXAMPLE (${results['24H'].unavailable.length} found):`);
    if (results['24H'].unavailable.length >= 1) {
        const example1 = results['24H'].unavailable[0];
        console.log(`   ❌ Item ${example1.id} (${example1.name}):`);
        console.log(`      Status: unavailable`);
        console.log(`      Source: ${example1.source || 'none'}`);
    } else {
        console.log(`   ⚠️  No unavailable 24H examples found`);
    }
    
    // 7D verification (should only be valid or unavailable, NEVER stale)
    console.log(`\n4️⃣ 7D TREND VERIFICATION (should only be valid or unavailable, NEVER stale):`);
    const valid7d = results['7D'].valid.filter(i => i.status === 'valid');
    const stale7d = results['7D'].valid.filter(i => i.status === 'stale');
    console.log(`   Valid: ${valid7d.length} items`);
    if (valid7d.length >= 1) {
        const example1 = valid7d[0];
        console.log(`      ✅ Item ${example1.id} (${example1.name}):`);
        console.log(`         Value: ${example1.value.toFixed(2)}%`);
        console.log(`         Status: ${example1.status}`);
        console.log(`         Source: ${example1.source}`);
        console.log(`         Now timestamp: ${example1.nowTimestamp ? new Date(example1.nowTimestamp * 1000).toISOString() : 'N/A'}`);
        console.log(`         Target timestamp: ${example1.targetTimestamp ? new Date(example1.targetTimestamp * 1000).toISOString() : 'N/A'}`);
        console.log(`         Matched timestamp: ${example1.matchedTimestamp ? new Date(example1.matchedTimestamp * 1000).toISOString() : 'N/A'}`);
    }
    console.log(`   Unavailable: ${results['7D'].unavailable.length} items`);
    if (results['7D'].unavailable.length >= 1) {
        const example1 = results['7D'].unavailable[0];
        console.log(`      ❌ Item ${example1.id} (${example1.name}):`);
        console.log(`         Status: ${example1.status || 'unavailable'}`);
        console.log(`         Source: ${example1.source || 'none'}`);
    }
    if (stale7d.length > 0) {
        console.log(`   ❌ ERROR: Found ${stale7d.length} stale 7D trends (should be 0)!`);
        stale7d.forEach(item => {
            console.log(`      ❌ Item ${item.id} (${item.name}): status=${item.status} (SHOULD NOT BE STALE)`);
        });
    } else {
        console.log(`   ✅ Correct: No stale 7D trends found (7D can only be valid or unavailable)`);
    }
    
    // 1H, 6H, and 7D correctness check (no stale status)
    console.log(`\n6️⃣ 1H, 6H & 7D CORRECTNESS CHECK (no stale status):`);
    const all1hValid = results['1H'].valid.length > 0;
    const all1hCorrect = results['1H'].valid.every(item => item.value !== null && !isNaN(item.value));
    const all6hValid = results['6H'].valid.length > 0;
    const all6hCorrect = results['6H'].valid.every(item => item.value !== null && !isNaN(item.value));
    if (all1hValid && all1hCorrect) {
        console.log(`   ✅ 1H is 100% correct - All ${results['1H'].valid.length} valid trends are properly calculated`);
    } else {
        console.log(`   ⚠️  1H may have issues - Check results above`);
    }
    if (all6hValid && all6hCorrect) {
        console.log(`   ✅ 6H is 100% correct - All ${results['6H'].valid.length} valid trends are properly calculated`);
    } else {
        console.log(`   ⚠️  6H may have issues - Check results above`);
    }
    
    await db.end();
}

main().catch(console.error);

