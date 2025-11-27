require("dotenv").config();
const { performance, PerformanceObserver } = require("perf_hooks");
const db = require("../db/db");
const { calculateBatchTrends } = require("../poller/update-canonical-items");

/**
 * Performance profiler for trend calculation
 * Measures query execution times and JavaScript processing time
 */
class TrendProfiler {
    constructor() {
        this.marks = [];
        this.queries = [];
        this.jsProcessingTime = 0;
        this.observer = null;
    }
    
    start() {
        // Set up performance observer
        this.observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.entryType === 'measure') {
                    this.marks.push({
                        name: entry.name,
                        duration: entry.duration,
                        startTime: entry.startTime
                    });
                }
            }
        });
        this.observer.observe({ entryTypes: ['measure'] });
        
        // Wrap db.query to track queries
        const originalQuery = db.query.bind(db);
        db.query = async (...args) => {
            const queryStart = performance.now();
            const queryText = typeof args[0] === 'string' ? args[0].substring(0, 100) : 'prepared';
            
            try {
                const result = await originalQuery(...args);
                const queryEnd = performance.now();
                
                this.queries.push({
                    query: queryText,
                    duration: queryEnd - queryStart,
                    rowCount: result.rows ? result.rows.length : 0,
                    timestamp: queryStart
                });
                
                return result;
            } catch (err) {
                const queryEnd = performance.now();
                this.queries.push({
                    query: queryText,
                    duration: queryEnd - queryStart,
                    error: err.message,
                    timestamp: queryStart
                });
                throw err;
            }
        };
    }
    
    mark(name) {
        performance.mark(name);
    }
    
    measure(name, startMark, endMark) {
        try {
            performance.measure(name, startMark, endMark);
        } catch (err) {
            // Mark might not exist yet
        }
    }
    
    stop() {
        if (this.observer) {
            this.observer.disconnect();
        }
    }
    
    getReport() {
        // Group queries by type
        const queryGroups = {};
        for (const query of this.queries) {
            const queryType = this.categorizeQuery(query.query);
            if (!queryGroups[queryType]) {
                queryGroups[queryType] = {
                    count: 0,
                    totalTime: 0,
                    minTime: Infinity,
                    maxTime: 0,
                    avgRows: 0
                };
            }
            
            queryGroups[queryType].count++;
            queryGroups[queryType].totalTime += query.duration;
            queryGroups[queryType].minTime = Math.min(queryGroups[queryType].minTime, query.duration);
            queryGroups[queryType].maxTime = Math.max(queryGroups[queryType].maxTime, query.duration);
            if (query.rowCount) {
                queryGroups[queryType].avgRows = 
                    (queryGroups[queryType].avgRows * (queryGroups[queryType].count - 1) + query.rowCount) / 
                    queryGroups[queryType].count;
            }
        }
        
        // Calculate averages
        for (const type in queryGroups) {
            const group = queryGroups[type];
            group.avgTime = group.totalTime / group.count;
        }
        
        // Calculate total times
        const totalQueryTime = this.queries.reduce((sum, q) => sum + q.duration, 0);
        const totalTime = this.marks.length > 0 
            ? Math.max(...this.marks.map(m => m.startTime + m.duration)) - Math.min(...this.marks.map(m => m.startTime))
            : totalQueryTime;
        
        return {
            totalTime,
            totalQueryTime,
            jsProcessingTime: totalTime - totalQueryTime,
            queryCount: this.queries.length,
            queryBreakdown: queryGroups,
            queries: this.queries,
            marks: this.marks
        };
    }
    
    categorizeQuery(queryText) {
        if (!queryText) return 'unknown';
        
        const text = queryText.toLowerCase();
        if (text.includes('price_5m')) return 'price_5m';
        if (text.includes('price_1h')) return 'price_1h';
        if (text.includes('price_6h')) return 'price_6h';
        if (text.includes('price_24h')) return 'price_24h';
        if (text.includes('price_instants')) return 'price_instants';
        if (text.includes('latest')) return 'latest_points';
        if (text.includes('lateral')) return 'lateral_join';
        if (text.includes('union all')) return 'union_all';
        return 'other';
    }
}

/**
 * Profile a single batch of trend calculations
 */
async function profileTrendCalculation(itemIds, batchSize) {
    const profiler = new TrendProfiler();
    const now = Math.floor(Date.now() / 1000);
    
    profiler.start();
    profiler.mark('trend-calc-start');
    
    try {
        const trendsMap = await calculateBatchTrends(itemIds, now);
        
        profiler.mark('trend-calc-end');
        profiler.measure('trend-calculation', 'trend-calc-start', 'trend-calc-end');
        
        let trendsCalculated = 0;
        for (const [itemId, trends] of trendsMap.entries()) {
            trendsCalculated += Object.values(trends).filter(v => v !== null).length;
        }
        
        profiler.stop();
        const report = profiler.getReport();
        
        return {
            itemCount: itemIds.length,
            batchSize,
            trendsCalculated,
            ...report
        };
    } catch (err) {
        profiler.stop();
        throw err;
    }
}

/**
 * Main profiling function
 */
async function profileTrendCalculationMain() {
    console.log("=".repeat(80));
    console.log("TREND CALCULATION PROFILER");
    console.log("=".repeat(80));
    console.log();
    
    try {
        // Get items
        const { rows: allItems } = await db.query(`SELECT id, name FROM items ORDER BY id LIMIT 200`);
        console.log(`Testing with ${allItems.length} items\n`);
        
        const batchSizes = [50, 100, 200];
        
        for (const batchSize of batchSizes) {
            console.log(`\n${"=".repeat(80)}`);
            console.log(`Batch Size: ${batchSize}`);
            console.log(`${"=".repeat(80)}\n`);
            
            const itemIds = allItems.slice(0, batchSize).map(item => item.id);
            const report = await profileTrendCalculation(itemIds, batchSize);
            
            console.log(`Items: ${report.itemCount}`);
            console.log(`Trends Calculated: ${report.trendsCalculated}`);
            console.log(`Total Time: ${report.totalTime.toFixed(2)}ms`);
            console.log(`Query Time: ${report.totalQueryTime.toFixed(2)}ms (${((report.totalQueryTime / report.totalTime) * 100).toFixed(1)}%)`);
            console.log(`JS Processing Time: ${report.jsProcessingTime.toFixed(2)}ms (${((report.jsProcessingTime / report.totalTime) * 100).toFixed(1)}%)`);
            console.log(`Query Count: ${report.queryCount}`);
            console.log(`Items/sec: ${(report.itemCount / (report.totalTime / 1000)).toFixed(1)}`);
            
            console.log(`\nQuery Breakdown:`);
            console.log("Type | Count | Total Time | Avg Time | Min | Max | Avg Rows");
            console.log("-".repeat(80));
            
            for (const [type, stats] of Object.entries(report.queryBreakdown)) {
                console.log(
                    `${type.padEnd(15)} | ` +
                    `${stats.count.toString().padStart(5)} | ` +
                    `${stats.totalTime.toFixed(1).padStart(10)}ms | ` +
                    `${stats.avgTime.toFixed(1).padStart(8)}ms | ` +
                    `${stats.minTime.toFixed(1).padStart(4)}ms | ` +
                    `${stats.maxTime.toFixed(1).padStart(4)}ms | ` +
                    `${stats.avgRows.toFixed(0).padStart(8)}`
                );
            }
            
            // Show slowest queries
            const slowestQueries = [...report.queries]
                .sort((a, b) => b.duration - a.duration)
                .slice(0, 5);
            
            if (slowestQueries.length > 0) {
                console.log(`\nSlowest Queries:`);
                slowestQueries.forEach((q, i) => {
                    console.log(`  ${i + 1}. ${q.duration.toFixed(2)}ms - ${q.query.substring(0, 80)}`);
                });
            }
        }
        
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
    profileTrendCalculationMain();
}

module.exports = { TrendProfiler, profileTrendCalculation };

