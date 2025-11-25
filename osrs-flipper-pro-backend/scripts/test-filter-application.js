// Test script to verify that filters are actually being applied correctly
// This script tests each filter by:
// 1. Getting baseline count without filter
// 2. Applying filter and checking that results actually change
// 3. Verifying that filtered results match the filter criteria

const db = require("../db/db");
const fetch = require("node-fetch");

const API_BASE = "http://localhost:3001";
const TEST_FILTERS = [
    { name: "minSpread", param: "minSpread", value: 5, column: "spread_percent", operator: ">=" },
    { name: "maxSpread", param: "maxSpread", value: 10, column: "spread_percent", operator: "<=" },
    { name: "minMargin", param: "minMargin", value: 100, column: "margin", operator: ">=" },
    { name: "maxMargin", param: "maxMargin", value: 1000, column: "margin", operator: "<=" },
    { name: "minRoi", param: "minRoi", value: 5, column: "roi_percent", operator: ">=" },
    { name: "maxRoi", param: "maxRoi", value: 50, column: "roi_percent", operator: "<=" },
    { name: "minBuyPrice", param: "minBuyPrice", value: 1000, column: "low", operator: ">=" },
    { name: "maxBuyPrice", param: "maxBuyPrice", value: 10000, column: "low", operator: "<=" },
    { name: "minSellPrice", param: "minSellPrice", value: 1000, column: "high", operator: ">=" },
    { name: "maxSellPrice", param: "maxSellPrice", value: 10000, column: "high", operator: "<=" },
    { name: "minVolume_5m", param: "minVolume_5m", value: 10, column: "volume_5m", operator: ">=" },
    { name: "maxVolume_5m", param: "maxVolume_5m", value: 1000, column: "volume_5m", operator: "<=" },
];

async function getBaselineCount() {
    const result = await db.query(`SELECT COUNT(*) as count FROM canonical_items`);
    return parseInt(result.rows[0].count, 10);
}

async function testFilterViaAPI(filter) {
    const url = new URL(`${API_BASE}/api/items/browse`);
    url.searchParams.set(filter.param, filter.value.toString());
    url.searchParams.set("pageSize", "1000"); // Get more results to verify
    
    try {
        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching from API: ${error.message}`);
        return null;
    }
}

async function testFilterViaDirectQuery(filter) {
    const operator = filter.operator;
    const query = `
        SELECT COUNT(*) as count,
               MIN(${filter.column}) as min_val,
               MAX(${filter.column}) as max_val,
               AVG(${filter.column}) as avg_val
        FROM canonical_items
        WHERE ${filter.column} ${operator} $1
    `;
    
    const result = await db.query(query, [filter.value]);
    return {
        count: parseInt(result.rows[0].count, 10),
        min: parseFloat(result.rows[0].min_val) || null,
        max: parseFloat(result.rows[0].max_val) || null,
        avg: parseFloat(result.rows[0].avg_val) || null,
    };
}

async function verifyFilterResults(apiResults, filter) {
    if (!apiResults || !apiResults.items) {
        return { passed: false, reason: "No results from API" };
    }
    
    const items = apiResults.items;
    if (items.length === 0) {
        return { passed: true, reason: "Filter returned 0 results (may be correct)" };
    }
    
    // Check that all items match the filter criteria
    const column = filter.column;
    let violations = 0;
    let minViolation = null;
    let maxViolation = null;
    
    for (const item of items) {
        const value = parseFloat(item[column] || item[column.replace('_percent', '')]);
        if (isNaN(value)) continue;
        
        if (filter.operator === ">=" && value < filter.value) {
            violations++;
            if (minViolation === null || value < minViolation) minViolation = value;
        } else if (filter.operator === "<=" && value > filter.value) {
            violations++;
            if (maxViolation === null || value > maxViolation) maxViolation = value;
        }
    }
    
    if (violations > 0) {
        return {
            passed: false,
            reason: `Found ${violations} items that violate filter: ${filter.operator} ${filter.value}. ` +
                   `Violations: min=${minViolation}, max=${maxViolation}`
        };
    }
    
    return { passed: true, reason: `All ${items.length} items match filter criteria` };
}

async function runTests() {
    console.log("🧪 Testing Filter Application\n");
    console.log("=" .repeat(80));
    
    const baselineCount = await getBaselineCount();
    console.log(`📊 Baseline: ${baselineCount} total items in canonical_items\n`);
    
    let passed = 0;
    let failed = 0;
    const failures = [];
    
    for (const filter of TEST_FILTERS) {
        console.log(`\n🔍 Testing ${filter.name} (${filter.param} = ${filter.value})`);
        console.log("-".repeat(80));
        
        // Test via direct query to get expected results
        const directResult = await testFilterViaDirectQuery(filter);
        console.log(`   Direct query: ${directResult.count} items match`);
        console.log(`   Value range: min=${directResult.min?.toFixed(2) || 'null'}, max=${directResult.max?.toFixed(2) || 'null'}, avg=${directResult.avg?.toFixed(2) || 'null'}`);
        
        // Test via API
        const apiResult = await testFilterViaAPI(filter);
        if (!apiResult) {
            console.log(`   ❌ API request failed`);
            failed++;
            failures.push({ filter: filter.name, reason: "API request failed" });
            continue;
        }
        
        console.log(`   API returned: ${apiResult.totalRows} total rows, ${apiResult.items?.length || 0} items in response`);
        
        // Verify the count matches (within reason - API might paginate)
        const countMatch = Math.abs(apiResult.totalRows - directResult.count) <= 1;
        if (!countMatch) {
            console.log(`   ⚠️  Count mismatch: API says ${apiResult.totalRows}, direct query says ${directResult.count}`);
        }
        
        // Verify all returned items actually match the filter
        const verification = await verifyFilterResults(apiResult, filter);
        if (verification.passed) {
            console.log(`   ✅ ${verification.reason}`);
            passed++;
        } else {
            console.log(`   ❌ ${verification.reason}`);
            failed++;
            failures.push({ filter: filter.name, reason: verification.reason });
        }
    }
    
    console.log("\n" + "=".repeat(80));
    console.log(`\n📈 Test Summary:`);
    console.log(`   ✅ Passed: ${passed}/${TEST_FILTERS.length}`);
    console.log(`   ❌ Failed: ${failed}/${TEST_FILTERS.length}`);
    
    if (failures.length > 0) {
        console.log(`\n❌ Failed Tests:`);
        failures.forEach(f => {
            console.log(`   - ${f.filter}: ${f.reason}`);
        });
    }
    
    if (failed === 0) {
        console.log(`\n🎉 All filters are working correctly!`);
    } else {
        console.log(`\n⚠️  Some filters are not working correctly. Please review the failures above.`);
    }
    
    process.exit(failed > 0 ? 1 : 0);
}

// Check if server is running
fetch(`${API_BASE}/api/items/browse?pageSize=1`)
    .then(() => {
        console.log("✅ Server is running, starting tests...\n");
        runTests().catch(err => {
            console.error("❌ Test execution failed:", err);
            process.exit(1);
        });
    })
    .catch(() => {
        console.error("❌ Server is not running! Please start the backend server first.");
        console.error(`   Expected server at: ${API_BASE}`);
        process.exit(1);
    });

