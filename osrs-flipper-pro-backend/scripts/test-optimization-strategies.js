require("dotenv").config();
const db = require("../db/db");
const { calculateBatchTrends } = require("../poller/update-canonical-items");
const fs = require("fs");
const path = require("path");

/**
 * Simulate a full canonical update for a batch (without DB writes)
 */
async function simulateCanonicalUpdateBatch(itemIds, now, queryFn = db.query.bind(db)) {
    const batchStart = Date.now();
    
    // 1. Calculate trends (most expensive part)
    const trendsMap = await calculateBatchTrends(itemIds, now);
    
    // 2. Fetch price_instants (simulate)
    await queryFn(`
        SELECT item_id, price, timestamp, type
        FROM price_instants
        WHERE item_id = ANY($1)
    `, [itemIds]);
    
    // 3. Fetch volumes from price_5m (simulate)
    await queryFn(`
        SELECT item_id, timestamp, low_volume, high_volume
        FROM price_5m
        WHERE item_id = ANY($1)
          AND timestamp >= $2
        ORDER BY item_id, timestamp DESC
    `, [itemIds, now - 86400]);
    
    // 4. Fetch volumes from price_1h (simulate)
    await queryFn(`
        SELECT item_id, timestamp, low_volume, high_volume
        FROM price_1h
        WHERE item_id = ANY($1)
          AND timestamp >= $2
        ORDER BY item_id, timestamp DESC
    `, [itemIds, now - 604800]);
    
    // 5. Fetch aggregated prices (simulate)
    await Promise.all([
        queryFn(`SELECT item_id, timestamp, avg_high, avg_low FROM price_5m WHERE item_id = ANY($1) AND timestamp >= $2`, [itemIds, now - 300]),
        queryFn(`SELECT item_id, timestamp, avg_high, avg_low FROM price_1h WHERE item_id = ANY($1) AND timestamp >= $2`, [itemIds, now - 3600]),
        queryFn(`SELECT item_id, timestamp, avg_high, avg_low FROM price_6h WHERE item_id = ANY($1) AND timestamp >= $2`, [itemIds, now - 21600]),
        queryFn(`SELECT item_id, timestamp, avg_high, avg_low FROM price_24h WHERE item_id = ANY($1) AND timestamp >= $2`, [itemIds, now - 86400])
    ]);
    
    // 6. Fetch buy/sell rates (simulate)
    await queryFn(`
        SELECT item_id, timestamp, low_volume, high_volume
        FROM price_5m
        WHERE item_id = ANY($1)
          AND timestamp >= $2
        ORDER BY item_id, timestamp DESC
    `, [itemIds, now - 300]);
    
    const batchTime = ((Date.now() - batchStart) / 1000).toFixed(3);
    return { trendsMap, batchTime: parseFloat(batchTime) };
}

/**
 * Convert CPU usage to milliseconds
 */
function cpuUsageToMs(cpuUsage) {
    return (cpuUsage.user + cpuUsage.system) / 1000; // Convert microseconds to milliseconds
}

/**
 * Run a single test iteration
 */
async function runTestIteration(testName, testFn, itemIds, now, batchSize) {
    // Reset CPU usage tracking
    const cpuStart = process.cpuUsage();
    const resourceStart = process.resourceUsage();
    const memStart = process.memoryUsage();
    const timeStart = Date.now();
    
    let queryCount = 0;
    let queryTime = 0;
    
    // Create query tracker that wraps db.query
    const originalQuery = db.query.bind(db);
    const queryTracker = async (...args) => {
        const qStart = Date.now();
        queryCount++;
        try {
            const result = await originalQuery(...args);
            queryTime += Date.now() - qStart;
            return result;
        } catch (err) {
            queryTime += Date.now() - qStart;
            throw err;
        }
    };
    
    const testResult = await testFn(itemIds, now, queryTracker);
    
    const timeEnd = Date.now();
    const cpuEnd = process.cpuUsage(cpuStart);
    const resourceEnd = process.resourceUsage();
    const memEnd = process.memoryUsage();
    
    const elapsedTime = (timeEnd - timeStart) / 1000;
    const cpuTimeMs = cpuUsageToMs(cpuEnd);
    const cpuPercent = (cpuTimeMs / elapsedTime / 1000) * 100; // CPU usage percentage
    
    return {
        testName,
        batchSize,
        itemCount: itemIds.length,
        elapsedTime,
        itemsPerSecond: itemIds.length / elapsedTime,
        trendsPerSecond: testResult.trendsCalculated / elapsedTime,
        cpuTimeMs,
        cpuPercent,
        memoryDelta: memEnd.heapUsed - memStart.heapUsed,
        memoryPeak: resourceEnd.maxRSS - resourceStart.maxRSS,
        queryCount,
        queryTimeMs: queryTime,
        trendsCalculated: testResult.trendsCalculated,
        itemsWithTrends: testResult.itemsWithTrends
    };
}

/**
 * Test trends calculation in isolation
 */
async function testTrendsOnly(itemIds, now, queryFn) {
    const trendsMap = await calculateBatchTrends(itemIds, now);
    
    let trendsCalculated = 0;
    let itemsWithTrends = 0;
    for (const [itemId, trends] of trendsMap.entries()) {
        const trendCount = Object.values(trends).filter(v => v !== null).length;
        trendsCalculated += trendCount;
        if (trendCount > 0) itemsWithTrends++;
    }
    
    return { trendsCalculated, itemsWithTrends };
}

/**
 * Test full canonical update
 */
async function testFullUpdate(itemIds, now, queryFn) {
    // Use the query tracker passed in
    const { trendsMap } = await simulateCanonicalUpdateBatch(itemIds, now, queryFn);
    
    let trendsCalculated = 0;
    let itemsWithTrends = 0;
    for (const [itemId, trends] of trendsMap.entries()) {
        const trendCount = Object.values(trends).filter(v => v !== null).length;
        trendsCalculated += trendCount;
        if (trendCount > 0) itemsWithTrends++;
    }
    
    return { trendsCalculated, itemsWithTrends };
}

/**
 * Run multiple iterations and calculate statistics
 */
async function runTestSuite(testName, testFn, items, batchSize, iterations = 5) {
    const now = Math.floor(Date.now() / 1000);
    const results = [];
    
    for (let i = 0; i < iterations; i++) {
        const itemIds = items.slice(0, batchSize).map(item => item.id);
        const result = await runTestIteration(testName, testFn, itemIds, now, batchSize);
        results.push(result);
        
        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Calculate statistics
    const stats = {
        testName,
        batchSize,
        iterations,
        itemsPerSecond: {
            mean: results.reduce((sum, r) => sum + r.itemsPerSecond, 0) / iterations,
            min: Math.min(...results.map(r => r.itemsPerSecond)),
            max: Math.max(...results.map(r => r.itemsPerSecond)),
            stdDev: calculateStdDev(results.map(r => r.itemsPerSecond))
        },
        cpuTimeMs: {
            mean: results.reduce((sum, r) => sum + r.cpuTimeMs, 0) / iterations,
            min: Math.min(...results.map(r => r.cpuTimeMs)),
            max: Math.max(...results.map(r => r.cpuTimeMs))
        },
        cpuPercent: {
            mean: results.reduce((sum, r) => sum + r.cpuPercent, 0) / iterations,
            min: Math.min(...results.map(r => r.cpuPercent)),
            max: Math.max(...results.map(r => r.cpuPercent))
        },
        memoryDelta: {
            mean: results.reduce((sum, r) => sum + r.memoryDelta, 0) / iterations,
            min: Math.min(...results.map(r => r.memoryDelta)),
            max: Math.max(...results.map(r => r.memoryDelta))
        },
        queryCount: {
            mean: results.reduce((sum, r) => sum + r.queryCount, 0) / iterations,
            min: Math.min(...results.map(r => r.queryCount)),
            max: Math.max(...results.map(r => r.queryCount))
        },
        queryTimeMs: {
            mean: results.reduce((sum, r) => sum + r.queryTimeMs, 0) / iterations,
            min: Math.min(...results.map(r => r.queryTimeMs)),
            max: Math.max(...results.map(r => r.queryTimeMs))
        },
        rawResults: results
    };
    
    return stats;
}

function calculateStdDev(values) {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
}

/**
 * Main test function
 */
async function testOptimizationStrategies() {
    const startTime = Date.now();
    const now = Math.floor(Date.now() / 1000);
    
    console.log("=".repeat(80));
    console.log("OPTIMIZATION STRATEGY TESTING");
    console.log("=".repeat(80));
    console.log(`Started at: ${new Date().toISOString()}\n`);
    
    try {
        // Get all items
        console.log("Fetching all items...");
        const { rows: allItems } = await db.query(`SELECT id, name FROM items ORDER BY id`);
        console.log(`Found ${allItems.length} total items\n`);
        
        const testConfig = {
            batchSizes: [50, 100, 200, 300, 500],
            iterations: 5,
            testScenarios: [
                { name: "trends_only", fn: testTrendsOnly, description: "Trends calculation only" },
                { name: "full_update", fn: testFullUpdate, description: "Full canonical update" }
            ]
        };
        
        const allResults = {
            timestamp: new Date().toISOString(),
            config: testConfig,
            results: {}
        };
        
        for (const scenario of testConfig.testScenarios) {
            console.log(`\n${"=".repeat(80)}`);
            console.log(`Testing: ${scenario.description}`);
            console.log(`${"=".repeat(80)}\n`);
            
            const scenarioResults = {};
            
            for (const batchSize of testConfig.batchSizes) {
                console.log(`\nBatch Size: ${batchSize}`);
                console.log("-".repeat(80));
                
                const stats = await runTestSuite(
                    scenario.name,
                    scenario.fn,
                    allItems,
                    batchSize,
                    testConfig.iterations
                );
                
                scenarioResults[batchSize] = stats;
                
                // Print summary
                console.log(`\nResults (${testConfig.iterations} iterations):`);
                console.log(`  Items/sec: ${stats.itemsPerSecond.mean.toFixed(1)} (min: ${stats.itemsPerSecond.min.toFixed(1)}, max: ${stats.itemsPerSecond.max.toFixed(1)})`);
                console.log(`  CPU Time: ${stats.cpuTimeMs.mean.toFixed(1)}ms (${stats.cpuPercent.mean.toFixed(1)}% usage)`);
                console.log(`  Memory Delta: ${(stats.memoryDelta.mean / 1024 / 1024).toFixed(2)} MB`);
                console.log(`  Query Count: ${stats.queryCount.mean.toFixed(0)} (avg ${(stats.queryTimeMs.mean / stats.queryCount.mean).toFixed(1)}ms per query)`);
            }
            
            allResults.results[scenario.name] = scenarioResults;
        }
        
        // Save results to file
        const resultsDir = path.join(__dirname, "..", "test-results");
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }
        
        const resultsFile = path.join(resultsDir, `optimization-test-${Date.now()}.json`);
        fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));
        console.log(`\n\nResults saved to: ${resultsFile}`);
        
        // Print summary table
        console.log(`\n${"=".repeat(80)}`);
        console.log("SUMMARY");
        console.log(`${"=".repeat(80)}\n`);
        
        for (const scenario of testConfig.testScenarios) {
            console.log(`\n${scenario.description}:`);
            console.log("Batch Size | Items/sec | CPU Time | CPU % | Memory Δ | Queries");
            console.log("-".repeat(80));
            
            for (const batchSize of testConfig.batchSizes) {
                const stats = allResults.results[scenario.name][batchSize];
                console.log(
                    `${batchSize.toString().padStart(10)} | ` +
                    `${stats.itemsPerSecond.mean.toFixed(1).padStart(9)} | ` +
                    `${stats.cpuTimeMs.mean.toFixed(1).padStart(8)}ms | ` +
                    `${stats.cpuPercent.mean.toFixed(1).padStart(5)}% | ` +
                    `${(stats.memoryDelta.mean / 1024 / 1024).toFixed(2).padStart(8)}MB | ` +
                    `${stats.queryCount.mean.toFixed(0).padStart(7)}`
                );
            }
        }
        
        const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n\nTotal test time: ${totalElapsed}s`);
        
    } catch (err) {
        console.error("\nError:", err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await db.end();
    }
}

// Run if called directly
if (require.main === module) {
    testOptimizationStrategies();
}

module.exports = { testOptimizationStrategies, runTestSuite, testTrendsOnly, testFullUpdate };

