require("dotenv").config();
const db = require("../db/db");
const { calculateBatchTrendsWithCaching } = require("../poller/update-canonical-items");

/**
 * Simulate a full canonical update for a batch (without DB writes)
 * Uses the optimized parallel query approach from the actual update function
 */
async function simulateCanonicalUpdateBatch(itemIds, now) {
    const batchStart = Date.now();
    
    // 1. Calculate trends using optimized caching function
    const trendsMap = await calculateBatchTrendsWithCaching(itemIds, now);
    
    // 2-6. Fetch all data in parallel (matching the optimized approach)
    await Promise.all([
        // Price instants
        db.query(`
            SELECT DISTINCT ON (item_id, type) item_id, price, timestamp, type
            FROM price_instants
            WHERE item_id = ANY($1)
            ORDER BY item_id, type, timestamp DESC
        `, [itemIds]),
        // Volumes: 5m, 1h, 6h, 24h, 7d, 1m, 3m, 1y (combined queries)
        db.query(`
            SELECT DISTINCT ON (item_id) item_id, volume
            FROM price_5m
            WHERE item_id = ANY($1)
            ORDER BY item_id, timestamp DESC
        `, [itemIds]),
        db.query(`
            SELECT 
                item_id,
                COALESCE(SUM(CASE WHEN timestamp >= $2 THEN volume ELSE 0 END), 0)::BIGINT AS vol_1h,
                COALESCE(SUM(CASE WHEN timestamp >= $3 THEN volume ELSE 0 END), 0)::BIGINT AS vol_6h,
                COALESCE(SUM(CASE WHEN timestamp >= $4 THEN volume ELSE 0 END), 0)::BIGINT AS vol_24h
            FROM price_5m
            WHERE item_id = ANY($1) AND timestamp >= $4
            GROUP BY item_id
        `, [itemIds, now - 3600, now - 21600, now - 86400]),
        db.query(`
            SELECT item_id, COALESCE(SUM(volume), 0)::BIGINT AS volume
            FROM price_1h
            WHERE item_id = ANY($1) AND timestamp >= $2
            GROUP BY item_id
        `, [itemIds, now - 604800]),
        db.query(`
            SELECT item_id, COALESCE(SUM(volume), 0)::BIGINT AS volume
            FROM price_6h
            WHERE item_id = ANY($1) AND timestamp >= $2
            GROUP BY item_id
        `, [itemIds, now - 2592000]),
        db.query(`
            SELECT 
                item_id,
                COALESCE(SUM(CASE WHEN timestamp >= $2 THEN volume ELSE 0 END), 0)::BIGINT AS vol_3m,
                COALESCE(SUM(CASE WHEN timestamp >= $3 THEN volume ELSE 0 END), 0)::BIGINT AS vol_1y
            FROM price_24h
            WHERE item_id = ANY($1) AND timestamp >= $3
            GROUP BY item_id
        `, [itemIds, now - 7776000, now - 31536000]),
        // Aggregated prices: 5m, 1h, 6h, 24h, 1w, 1m, 3m, 1y
        db.query(`
            SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
            FROM price_5m
            WHERE item_id = ANY($1)
            ORDER BY item_id, timestamp DESC
        `, [itemIds]),
        db.query(`
            SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
            FROM price_1h
            WHERE item_id = ANY($1)
            ORDER BY item_id, timestamp DESC
        `, [itemIds]),
        db.query(`
            SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
            FROM price_6h
            WHERE item_id = ANY($1)
            ORDER BY item_id, timestamp DESC
        `, [itemIds]),
        db.query(`
            SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
            FROM price_24h
            WHERE item_id = ANY($1)
            ORDER BY item_id, timestamp DESC
        `, [itemIds]),
        db.query(`
            SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
            FROM price_1h
            WHERE item_id = ANY($1) AND timestamp >= $2
            ORDER BY item_id, timestamp DESC
        `, [itemIds, now - 604800]),
        db.query(`
            SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
            FROM price_6h
            WHERE item_id = ANY($1) AND timestamp >= $2
            ORDER BY item_id, timestamp DESC
        `, [itemIds, now - 2592000]),
        db.query(`
            SELECT '3m' AS period, item_id, avg_high, avg_low
            FROM (
                SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
                FROM price_24h
                WHERE item_id = ANY($1) AND timestamp >= $2
                ORDER BY item_id, timestamp DESC
            ) AS t3m
            UNION ALL
            SELECT '1y' AS period, item_id, avg_high, avg_low
            FROM (
                SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
                FROM price_24h
                WHERE item_id = ANY($1) AND timestamp >= $3
                ORDER BY item_id, timestamp DESC
            ) AS t1y
        `, [itemIds, now - 7776000, now - 31536000]),
        // Turnovers and buy/sell rates (combined)
        db.query(`
            SELECT DISTINCT ON (item_id) item_id,
                COALESCE(((CASE WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL END) * volume), 0)::NUMERIC(20,0) AS turnover
            FROM price_5m
            WHERE item_id = ANY($1)
            ORDER BY item_id, timestamp DESC
        `, [itemIds]),
        db.query(`
            SELECT 
                item_id,
                COALESCE(SUM(CASE WHEN timestamp >= $2 THEN (CASE WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL END) * volume ELSE 0 END), 0)::NUMERIC(20,0) AS turnover_1h,
                COALESCE(SUM(CASE WHEN timestamp >= $3 THEN (CASE WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL END) * volume ELSE 0 END), 0)::NUMERIC(20,0) AS turnover_6h,
                COALESCE(SUM(CASE WHEN timestamp >= $4 THEN (CASE WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL END) * volume ELSE 0 END), 0)::NUMERIC(20,0) AS turnover_24h
            FROM price_5m
            WHERE item_id = ANY($1) AND timestamp >= $4
            GROUP BY item_id
        `, [itemIds, now - 3600, now - 21600, now - 86400]),
        db.query(`
            SELECT item_id,
                COALESCE(SUM((CASE WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL END) * volume), 0)::NUMERIC(20,0) AS turnover
            FROM price_1h
            WHERE item_id = ANY($1) AND timestamp >= $2
            GROUP BY item_id
        `, [itemIds, now - 604800]),
        db.query(`
            SELECT item_id,
                COALESCE(SUM((CASE WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL END) * volume), 0)::NUMERIC(20,0) AS turnover
            FROM price_6h
            WHERE item_id = ANY($1) AND timestamp >= $2
            GROUP BY item_id
        `, [itemIds, now - 2592000]),
        db.query(`
            SELECT 
                item_id,
                COALESCE(SUM(CASE WHEN timestamp >= $2 THEN (CASE WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL END) * volume ELSE 0 END), 0)::NUMERIC(20,0) AS turnover_3m,
                COALESCE(SUM(CASE WHEN timestamp >= $3 THEN (CASE WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL END) * volume ELSE 0 END), 0)::NUMERIC(20,0) AS turnover_1y
            FROM price_24h
            WHERE item_id = ANY($1) AND timestamp >= $3
            GROUP BY item_id
        `, [itemIds, now - 7776000, now - 31536000]),
        // Buy/sell rates
        db.query(`
            SELECT 
                item_id,
                CASE 
                    WHEN SUM(CASE WHEN timestamp >= $2 THEN low_volume ELSE 0 END) = 0 THEN NULL
                    ELSE ROUND(SUM(CASE WHEN timestamp >= $2 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= $2 THEN low_volume ELSE 0 END), 0), 2)
                END AS ratio_5m,
                CASE 
                    WHEN SUM(CASE WHEN timestamp >= $3 THEN low_volume ELSE 0 END) = 0 THEN NULL
                    ELSE ROUND(SUM(CASE WHEN timestamp >= $3 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= $3 THEN low_volume ELSE 0 END), 0), 2)
                END AS ratio_1h,
                CASE 
                    WHEN SUM(CASE WHEN timestamp >= $4 THEN low_volume ELSE 0 END) = 0 THEN NULL
                    ELSE ROUND(SUM(CASE WHEN timestamp >= $4 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= $4 THEN low_volume ELSE 0 END), 0), 2)
                END AS ratio_6h,
                CASE 
                    WHEN SUM(CASE WHEN timestamp >= $5 THEN low_volume ELSE 0 END) = 0 THEN NULL
                    ELSE ROUND(SUM(CASE WHEN timestamp >= $5 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= $5 THEN low_volume ELSE 0 END), 0), 2)
                END AS ratio_24h
            FROM price_5m
            WHERE item_id = ANY($1) AND timestamp >= $2
            GROUP BY item_id
        `, [itemIds, now - 300, now - 3600, now - 21600, now - 86400]),
        db.query(`
            SELECT item_id,
                CASE 
                    WHEN SUM(low_volume) = 0 THEN NULL
                    ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                END AS ratio
            FROM price_1h
            WHERE item_id = ANY($1) AND timestamp >= $2
            GROUP BY item_id
        `, [itemIds, now - 604800]),
        db.query(`
            SELECT item_id,
                CASE 
                    WHEN SUM(low_volume) = 0 THEN NULL
                    ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                END AS ratio
            FROM price_6h
            WHERE item_id = ANY($1) AND timestamp >= $2
            GROUP BY item_id
        `, [itemIds, now - 2592000]),
        db.query(`
            SELECT 
                item_id,
                CASE 
                    WHEN SUM(CASE WHEN timestamp >= $2 THEN low_volume ELSE 0 END) = 0 THEN NULL
                    ELSE ROUND(SUM(CASE WHEN timestamp >= $2 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= $2 THEN low_volume ELSE 0 END), 0), 2)
                END AS ratio_3m,
                CASE 
                    WHEN SUM(CASE WHEN timestamp >= $3 THEN low_volume ELSE 0 END) = 0 THEN NULL
                    ELSE ROUND(SUM(CASE WHEN timestamp >= $3 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= $3 THEN low_volume ELSE 0 END), 0), 2)
                END AS ratio_1y
            FROM price_24h
            WHERE item_id = ANY($1) AND timestamp >= $3
            GROUP BY item_id
        `, [itemIds, now - 7776000, now - 31536000])
    ]);
    
    const batchTime = ((Date.now() - batchStart) / 1000).toFixed(3);
    return { trendsMap, batchTime: parseFloat(batchTime) };
}

/**
 * Test canonical update speed for different scenarios
 */
async function testCanonicalUpdateSpeed() {
    const startTime = Date.now();
    const now = Math.floor(Date.now() / 1000);
    
    console.log("🚀 Starting canonical update speed test...");
    console.log("📝 This test simulates full canonical update (no DB writes)\n");
    
    try {
        // Get all items
        console.log("📊 Fetching all items...");
        const { rows: allItems } = await db.query(`SELECT id, name FROM items ORDER BY id`);
        console.log(`✅ Found ${allItems.length} total items\n`);
        
        // Test scenarios - testing with CPU-optimized settings (batch 350, parallel 2 with delays)
        const scenarios = [
            { name: "Full Update (All Items)", items: allItems, batchSizes: [350], parallel: [2] },
            { name: "1100 Dirty Items", items: allItems.slice(0, 1100), batchSizes: [350], parallel: [2] }
        ];
        
        for (const scenario of scenarios) {
            console.log(`\n${"=".repeat(80)}`);
            console.log(`🧪 Testing Scenario: ${scenario.name}`);
            console.log(`   Items: ${scenario.items.length}`);
            console.log(`${"=".repeat(80)}\n`);
            
            const scenarioResults = [];
            
            for (const batchSize of scenario.batchSizes) {
                for (const maxConcurrency of scenario.parallel) {
                    console.log(`\n📦 Batch Size: ${batchSize}, Parallel: ${maxConcurrency}`);
                    console.log("-".repeat(80));
                    
                    const testStart = Date.now();
                    let totalBatches = 0;
                    let totalTrendsCalculated = 0;
                    let itemsWithTrends = 0;
                    
                    // Create batches
                    const batches = [];
                    for (let i = 0; i < scenario.items.length; i += batchSize) {
                        batches.push(scenario.items.slice(i, i + batchSize));
                    }
                    
                    // Process batches with parallel concurrency control
                    const semaphore = { count: maxConcurrency, waiting: [] };
                    const acquire = () => {
                        if (semaphore.count > 0) {
                            semaphore.count--;
                            return Promise.resolve();
                        }
                        return new Promise(resolve => {
                            semaphore.waiting.push(resolve);
                        });
                    };
                    const release = () => {
                        if (semaphore.waiting.length > 0) {
                            const resolve = semaphore.waiting.shift();
                            resolve();
                        } else {
                            semaphore.count++;
                        }
                    };
                    
                    const processBatchWithSemaphore = async (batch, batchNum) => {
                        await acquire();
                        try {
                            const itemIds = batch.map(item => item.id);
                            const { trendsMap, batchTime } = await simulateCanonicalUpdateBatch(itemIds, now);
                            
                            // Count trends calculated
                            for (const [itemId, trends] of trendsMap.entries()) {
                                const trendCount = Object.values(trends).filter(v => v !== null).length;
                                totalTrendsCalculated += trendCount;
                                if (trendCount > 0) itemsWithTrends++;
                            }
                            
                            totalBatches++;
                            
                            // Progress indicator
                            const progress = ((totalBatches) / batches.length * 100).toFixed(1);
                            const elapsed = ((Date.now() - testStart) / 1000).toFixed(1);
                            process.stdout.write(
                                `\r  Batch ${totalBatches}/${batches.length}: ` +
                                `${batch.length} items | ` +
                                `Progress: ${progress}% | ` +
                                `Elapsed: ${elapsed}s`
                            );
                            
                            return { trendsMap, batchTime };
                        } finally {
                            release();
                        }
                    };
                    
                    // Process all batches in parallel with concurrency limit
                    await Promise.all(batches.map((batch, index) => 
                        processBatchWithSemaphore(batch, index + 1)
                    ));
                    
                    const totalTime = ((Date.now() - testStart) / 1000).toFixed(2);
                    const itemsPerSecond = (scenario.items.length / parseFloat(totalTime)).toFixed(1);
                    const trendsPerSecond = (totalTrendsCalculated / parseFloat(totalTime)).toFixed(1);
                    const timePerItem = (parseFloat(totalTime) / scenario.items.length * 1000).toFixed(2);
                    const timePerBatch = (parseFloat(totalTime) / totalBatches).toFixed(3);
                    
                    console.log(`\n\n📊 Results:`);
                    console.log(`   Total items: ${scenario.items.length}`);
                    console.log(`   Items with trends: ${itemsWithTrends}`);
                    console.log(`   Total batches: ${totalBatches}`);
                    console.log(`   Parallel concurrency: ${maxConcurrency}`);
                    console.log(`   Total trends calculated: ${totalTrendsCalculated}`);
                    console.log(`   Total time: ${totalTime}s`);
                    console.log(`   Items/second: ${itemsPerSecond}`);
                    console.log(`   Trends/second: ${trendsPerSecond}`);
                    console.log(`   Time per item: ${timePerItem}ms`);
                    console.log(`   Time per batch: ${timePerBatch}s`);
                    
                    scenarioResults.push({
                        batchSize,
                        maxConcurrency,
                        totalTime: parseFloat(totalTime),
                        itemsPerSecond: parseFloat(itemsPerSecond),
                        timePerItem: parseFloat(timePerItem),
                        timePerBatch: parseFloat(timePerBatch)
                    });
                }
            }
            
            // Scenario summary
            console.log(`\n📈 ${scenario.name} Summary:`);
            console.log("Batch Size | Parallel | Total Time | Items/sec | Time/item | Time/batch");
            console.log("-".repeat(90));
            scenarioResults.forEach(r => {
                console.log(
                    `${r.batchSize.toString().padStart(10)} | ` +
                    `${r.maxConcurrency.toString().padStart(8)} | ` +
                    `${r.totalTime.toFixed(2).padStart(10)}s | ` +
                    `${r.itemsPerSecond.toFixed(1).padStart(9)} | ` +
                    `${r.timePerItem.toFixed(2).padStart(9)}ms | ` +
                    `${r.timePerBatch.toFixed(3).padStart(10)}s`
                );
            });
            
            // Find best configuration for this scenario
            const best = scenarioResults.reduce((best, current) => 
                current.itemsPerSecond > best.itemsPerSecond ? current : best
            );
            console.log(`\n🏆 Best for ${scenario.name}: batch size ${best.batchSize}, parallel ${best.maxConcurrency} (${best.itemsPerSecond} items/sec)`);
        }
        
        const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n\n✅ All tests completed in ${totalElapsed}s`);
        console.log(`\n💡 Note: This test simulates full canonical update (no DB writes)`);
        console.log(`   Includes: trends, prices, volumes, turnovers, buy/sell rates`);
        console.log(`   Actual update will be ~10-15% slower due to DB INSERT/UPDATE operations\n`);
        
    } catch (err) {
        console.error("\n❌ Error:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
}

testCanonicalUpdateSpeed();

