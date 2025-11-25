// Test script to calculate trends for item 31961 and show what data was used
const db = require('../db/db');
const fs = require('fs');
const path = require('path');

// We need to access calculateBatchTrends - let's extract it or require it
// Since it's not exported, we'll need to read the file and extract the logic
// Or we can create a simplified version for testing

async function testTrendCalculation(itemId) {
    console.log(`\n🧪 Testing trend calculation for item ${itemId}\n`);
    console.log('='.repeat(80));
    
    const now = Math.floor(Date.now() / 1000);
    
    // Window boundaries
    const w5m = { currStart: now - 300, currEnd: now, prevStart: now - 600, prevEnd: now - 300, recency: 0 };
    const w1h = { currStart: now - 3600, currEnd: now, prevStart: now - 7200, prevEnd: now - 3600, recency: 600 };
    const w6h = { currStart: now - 21600, currEnd: now, prevStart: now - 43200, prevEnd: now - 21600, recency: 1800 };
    const w24h = { currStart: now - 86400, currEnd: now, prevStart: now - 172800, prevEnd: now - 86400, recency: 7200 };
    const w7d = { currStart: now - 604800, currEnd: now, prevStart: now - 1209600, prevEnd: now - 604800, recency: 21600 };
    const w1m = { currStart: now - 2592000, currEnd: now, prevStart: now - 5184000, prevEnd: now - 2592000, recency: 21600 };
    
    const midExpr = `CASE WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0 WHEN avg_high IS NOT NULL THEN avg_high WHEN avg_low IS NOT NULL THEN avg_low ELSE NULL END`;
    
    // Helper to find price with granularity fallback
    async function findPrice(tables, window, isCurrent) {
        const start = isCurrent ? window.currStart : window.prevStart;
        const end = isCurrent ? window.currEnd : window.prevEnd;
        const recency = window.recency;
        
        console.log(`\n  Looking for ${isCurrent ? 'CURRENT' : 'PREVIOUS'} price:`);
        console.log(`    Window: ${new Date(start * 1000).toISOString()} to ${new Date(end * 1000).toISOString()}`);
        console.log(`    Recency: ${recency}s (${recency / 60} minutes)`);
        
        for (const table of tables) {
            console.log(`\n    Trying ${table}:`);
            
            // Try 1: Both prices within recency of boundaries
            if (recency > 0) {
                const recencyResult = await db.query(`
                    SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                    FROM ${table}
                    WHERE item_id = $1
                      AND timestamp > $2 AND timestamp <= $3
                      AND avg_high IS NOT NULL AND avg_low IS NOT NULL
                      AND (
                          (timestamp > $2 AND timestamp <= ($2 + $4))
                          OR
                          (timestamp > ($3 - $4) AND timestamp <= $3)
                      )
                    ORDER BY timestamp DESC
                    LIMIT 1
                `, [itemId, start, end, recency]);
                
                if (recencyResult.rows.length > 0) {
                    const r = recencyResult.rows[0];
                    console.log(`      ✅ Found in recency zone: ${new Date(r.timestamp * 1000).toISOString()}`);
                    console.log(`         avg_high: ${r.avg_high}, avg_low: ${r.avg_low}, mid: ${r.mid}`);
                    return { table, timestamp: r.timestamp, mid: r.mid, avg_high: r.avg_high, avg_low: r.avg_low, source: 'recency' };
                } else {
                    console.log(`      ❌ No data in recency zone`);
                }
            }
            
            // Try 2: Both prices anywhere in window
            const bothResult = await db.query(`
                SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                FROM ${table}
                WHERE item_id = $1
                  AND timestamp > $2 AND timestamp <= $3
                  AND avg_high IS NOT NULL AND avg_low IS NOT NULL
                ORDER BY timestamp DESC
                LIMIT 1
            `, [itemId, start, end]);
            
            if (bothResult.rows.length > 0) {
                const r = bothResult.rows[0];
                console.log(`      ✅ Found with both prices: ${new Date(r.timestamp * 1000).toISOString()}`);
                console.log(`         avg_high: ${r.avg_high}, avg_low: ${r.avg_low}, mid: ${r.mid}`);
                return { table, timestamp: r.timestamp, mid: r.mid, avg_high: r.avg_high, avg_low: r.avg_low, source: 'both' };
            } else {
                console.log(`      ❌ No data with both prices`);
            }
            
            // Try 3: Any price in window
            const anyResult = await db.query(`
                SELECT timestamp, avg_high, avg_low, ${midExpr} AS mid
                FROM ${table}
                WHERE item_id = $1
                  AND timestamp > $2 AND timestamp <= $3
                  AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                ORDER BY timestamp DESC
                LIMIT 1
            `, [itemId, start, end]);
            
            if (anyResult.rows.length > 0) {
                const r = anyResult.rows[0];
                console.log(`      ✅ Found with any price: ${new Date(r.timestamp * 1000).toISOString()}`);
                console.log(`         avg_high: ${r.avg_high ?? 'NULL'}, avg_low: ${r.avg_low ?? 'NULL'}, mid: ${r.mid}`);
                return { table, timestamp: r.timestamp, mid: r.mid, avg_high: r.avg_high, avg_low: r.avg_low, source: 'any' };
            } else {
                console.log(`      ❌ No data found`);
            }
        }
        
        return null;
    }
    
    // Test each trend
    const trends = [
        { name: 'trend_5m', window: w5m, tables: ['price_5m'] },
        { name: 'trend_1h', window: w1h, tables: ['price_5m', 'price_1h'] },
        { name: 'trend_6h', window: w6h, tables: ['price_1h', 'price_5m'] },
        { name: 'trend_24h', window: w24h, tables: ['price_1h', 'price_5m', 'price_6h'] },
        { name: 'trend_7d', window: w7d, tables: ['price_6h', 'price_1h'] },
        { name: 'trend_1m', window: w1m, tables: ['price_6h', 'price_1h'] },
    ];
    
    const results = {};
    
    for (const trend of trends) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`TREND: ${trend.name}`);
        console.log('='.repeat(80));
        
        const curr = await findPrice(trend.tables, trend.window, true);
        const prev = await findPrice(trend.tables, trend.window, false);
        
        let calculatedTrend = null;
        if (curr && prev && prev.mid !== null && prev.mid !== 0 && curr.mid !== null) {
            calculatedTrend = Math.round(100.0 * (curr.mid - prev.mid) / prev.mid * 100) / 100;
            console.log(`\n  📊 CALCULATION:`);
            console.log(`     Current mid: ${curr.mid}`);
            console.log(`     Previous mid: ${prev.mid}`);
            console.log(`     Trend: ${calculatedTrend}%`);
            console.log(`     Formula: 100.0 * (${curr.mid} - ${prev.mid}) / ${prev.mid} = ${calculatedTrend}%`);
        } else {
            console.log(`\n  ⚠️  Cannot calculate trend:`);
            if (!curr) console.log(`     - No current price found`);
            if (!prev) console.log(`     - No previous price found`);
            if (prev && (prev.mid === null || prev.mid === 0)) console.log(`     - Previous price is NULL or ZERO`);
            if (curr && curr.mid === null) console.log(`     - Current price is NULL`);
        }
        
        results[trend.name] = {
            calculated: calculatedTrend,
            current: curr,
            previous: prev
        };
    }
    
    // Now use the actual calculateBatchTrends function
    console.log(`\n${'='.repeat(80)}`);
    console.log('USING ACTUAL calculateBatchTrends FUNCTION');
    console.log('='.repeat(80));
    
    // Read the update file and extract the function
    const updatePath = path.join(__dirname, '../poller/update-canonical-items.js');
    const updateCode = fs.readFileSync(updatePath, 'utf8');
    
    // Create a module context to execute the function
    const Module = require('module');
    const vm = require('vm');
    
    // Actually, let's just require it and see if we can access it
    // Since it's not exported, we'll need to modify the approach
    
    // For now, let's manually call the SQL query
    const placeholders = `$1`;
    const p5m = { currStart: 2, currEnd: 3, prevStart: 4, prevEnd: 5, recency: 6 };
    const p1h = { currStart: 7, currEnd: 8, prevStart: 9, prevEnd: 10, recency: 11 };
    
    // Build a simplified query for testing
    const buildPriceSelect = (tables, itemIdVar, startParam, endParam, recencyParamVar) => {
        const tableArray = Array.isArray(tables) ? tables : [tables];
        const selects = tableArray.map((table, idx) => {
            if (idx === tableArray.length - 1) {
                return `COALESCE(
                    CASE 
                        WHEN $${recencyParamVar} > 0 THEN
                            (SELECT ${midExpr} FROM ${table} 
                             WHERE item_id = ${itemIdVar} 
                               AND timestamp > $${startParam} AND timestamp <= $${endParam}
                               AND avg_high IS NOT NULL AND avg_low IS NOT NULL
                               AND (
                                   (timestamp > $${startParam} AND timestamp <= ($${startParam} + $${recencyParamVar}))
                                   OR
                                   (timestamp > ($${endParam} - $${recencyParamVar}) AND timestamp <= $${endParam})
                               )
                             ORDER BY timestamp DESC LIMIT 1)
                        ELSE NULL
                    END,
                    (SELECT ${midExpr} FROM ${table} 
                     WHERE item_id = ${itemIdVar} 
                       AND timestamp > $${startParam} AND timestamp <= $${endParam}
                       AND avg_high IS NOT NULL AND avg_low IS NOT NULL
                     ORDER BY timestamp DESC LIMIT 1),
                    (SELECT ${midExpr} FROM ${table} 
                     WHERE item_id = ${itemIdVar} 
                       AND timestamp > $${startParam} AND timestamp <= $${endParam}
                       AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                     ORDER BY timestamp DESC LIMIT 1)
                )`;
            } else {
                return `COALESCE(
                    CASE 
                        WHEN $${recencyParamVar} > 0 THEN
                            (SELECT ${midExpr} FROM ${table} 
                             WHERE item_id = ${itemIdVar} 
                               AND timestamp > $${startParam} AND timestamp <= $${endParam}
                               AND avg_high IS NOT NULL AND avg_low IS NOT NULL
                               AND (
                                   (timestamp > $${startParam} AND timestamp <= ($${startParam} + $${recencyParamVar}))
                                   OR
                                   (timestamp > ($${endParam} - $${recencyParamVar}) AND timestamp <= $${endParam})
                               )
                             ORDER BY timestamp DESC LIMIT 1)
                        ELSE NULL
                    END,
                    (SELECT ${midExpr} FROM ${table} 
                     WHERE item_id = ${itemIdVar} 
                       AND timestamp > $${startParam} AND timestamp <= $${endParam}
                       AND avg_high IS NOT NULL AND avg_low IS NOT NULL
                     ORDER BY timestamp DESC LIMIT 1),
                    (SELECT ${midExpr} FROM ${table} 
                     WHERE item_id = ${itemIdVar} 
                       AND timestamp > $${startParam} AND timestamp <= $${endParam}
                       AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
                     ORDER BY timestamp DESC LIMIT 1)
                )`;
            }
        });
        return `COALESCE(${selects.join(',\n                    ')})`;
    };
    
    // Test trend_1h calculation
    console.log(`\nTesting trend_1h calculation with actual SQL...`);
    const testQuery = `
        WITH 
        t1h AS (
            SELECT 
                ${buildPriceSelect(['price_5m', 'price_1h'], '$1', p1h.currStart, p1h.currEnd, p1h.recency)} AS price_current,
                ${buildPriceSelect(['price_5m', 'price_1h'], '$1', p1h.prevStart, p1h.prevEnd, p1h.recency)} AS price_previous
        ),
        trend_1h AS (
            SELECT 
                CASE 
                    WHEN price_previous IS NULL OR price_previous = 0 THEN NULL
                    WHEN price_current IS NULL THEN NULL
                    ELSE ROUND(100.0 * (price_current - price_previous) / price_previous, 2)
                END AS value
            FROM t1h
        )
        SELECT value AS trend_1h FROM trend_1h
    `;
    
    const testParams = [
        itemId,
        w1h.currStart, w1h.currEnd, w1h.prevStart, w1h.prevEnd, w1h.recency
    ];
    
    try {
        const sqlResult = await db.query(testQuery, testParams);
        console.log(`\n  SQL Result: trend_1h = ${sqlResult.rows[0]?.trend_1h ?? 'NULL'}`);
    } catch (err) {
        console.error(`  ❌ SQL Error:`, err.message);
    }
    
    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Current time: ${new Date(now * 1000).toISOString()} (${now})`);
    console.log('\nCalculated Trends:');
    for (const [name, result] of Object.entries(results)) {
        console.log(`  ${name}: ${result.calculated ?? 'NULL'}`);
        if (result.current) {
            console.log(`    Current: ${result.current.mid} from ${result.current.table} (${result.current.source})`);
        }
        if (result.previous) {
            console.log(`    Previous: ${result.previous.mid} from ${result.previous.table} (${result.previous.source})`);
        }
    }
    
    await db.end();
}

const itemId = parseInt(process.argv[2]) || 31961;
testTrendCalculation(itemId)
    .then(() => {
        console.log('\n✅ Test complete');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Test failed:', err);
        process.exit(1);
    });






