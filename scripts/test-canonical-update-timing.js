require("dotenv").config();
const db = require("../db/db");
const updateCanonicalItems = require("../poller/update-canonical-items");
const { removeLock } = require("../poller/lock-utils");

async function testCanonicalUpdate() {
    console.log("🧪 Testing canonical update timing and trend calculation...\n");
    
    // Get item count before
    const { rows: itemCountBefore } = await db.query("SELECT COUNT(*) as count FROM items");
    console.log(`📊 Total items in database: ${itemCountBefore[0].count}\n`);
    
    // Check current trend status
    const { rows: trendStatusBefore } = await db.query(`
        SELECT 
            COUNT(*) as total_items,
            COUNT(trend_5m) as has_trend_5m,
            COUNT(trend_1h) as has_trend_1h,
            COUNT(trend_6h) as has_trend_6h,
            COUNT(trend_24h) as has_trend_24h,
            COUNT(trend_7d) as has_trend_7d,
            COUNT(trend_1m) as has_trend_1m,
            COUNT(trend_3m) as has_trend_3m,
            COUNT(trend_1y) as has_trend_1y
        FROM canonical_items
    `);
    
    console.log("📈 Trend status BEFORE update:");
    console.log(`   Total items in canonical_items: ${trendStatusBefore[0].total_items}`);
    console.log(`   Items with trend_5m: ${trendStatusBefore[0].has_trend_5m}`);
    console.log(`   Items with trend_1h: ${trendStatusBefore[0].has_trend_1h}`);
    console.log(`   Items with trend_6h: ${trendStatusBefore[0].has_trend_6h}`);
    console.log(`   Items with trend_24h: ${trendStatusBefore[0].has_trend_24h}`);
    console.log(`   Items with trend_7d: ${trendStatusBefore[0].has_trend_7d}`);
    console.log(`   Items with trend_1m: ${trendStatusBefore[0].has_trend_1m}`);
    console.log(`   Items with trend_3m: ${trendStatusBefore[0].has_trend_3m}`);
    console.log(`   Items with trend_1y: ${trendStatusBefore[0].has_trend_1y}\n`);
    
    // Remove any existing lock to ensure we can run
    console.log("🔓 Removing any existing locks...");
    removeLock("canonical");
    console.log("✅ Lock removed\n");
    
    // Measure time
    const startTime = Date.now();
    console.log("⏱️  Starting canonical update...\n");
    
    try {
        await updateCanonicalItems();
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log(`\n✅ Update completed in ${duration} seconds\n`);
        
        // Check trend status after
        const { rows: trendStatusAfter } = await db.query(`
            SELECT 
                COUNT(*) as total_items,
                COUNT(trend_5m) as has_trend_5m,
                COUNT(trend_1h) as has_trend_1h,
                COUNT(trend_6h) as has_trend_6h,
                COUNT(trend_24h) as has_trend_24h,
                COUNT(trend_7d) as has_trend_7d,
                COUNT(trend_1m) as has_trend_1m,
                COUNT(trend_3m) as has_trend_3m,
                COUNT(trend_1y) as has_trend_1y
            FROM canonical_items
        `);
        
        console.log("📈 Trend status AFTER update:");
        console.log(`   Total items in canonical_items: ${trendStatusAfter[0].total_items}`);
        console.log(`   Items with trend_5m: ${trendStatusAfter[0].has_trend_5m} (${((trendStatusAfter[0].has_trend_5m / trendStatusAfter[0].total_items) * 100).toFixed(1)}%)`);
        console.log(`   Items with trend_1h: ${trendStatusAfter[0].has_trend_1h} (${((trendStatusAfter[0].has_trend_1h / trendStatusAfter[0].total_items) * 100).toFixed(1)}%)`);
        console.log(`   Items with trend_6h: ${trendStatusAfter[0].has_trend_6h} (${((trendStatusAfter[0].has_trend_6h / trendStatusAfter[0].total_items) * 100).toFixed(1)}%)`);
        console.log(`   Items with trend_24h: ${trendStatusAfter[0].has_trend_24h} (${((trendStatusAfter[0].has_trend_24h / trendStatusAfter[0].total_items) * 100).toFixed(1)}%)`);
        console.log(`   Items with trend_7d: ${trendStatusAfter[0].has_trend_7d} (${((trendStatusAfter[0].has_trend_7d / trendStatusAfter[0].total_items) * 100).toFixed(1)}%)`);
        console.log(`   Items with trend_1m: ${trendStatusAfter[0].has_trend_1m} (${((trendStatusAfter[0].has_trend_1m / trendStatusAfter[0].total_items) * 100).toFixed(1)}%)`);
        console.log(`   Items with trend_3m: ${trendStatusAfter[0].has_trend_3m} (${((trendStatusAfter[0].has_trend_3m / trendStatusAfter[0].total_items) * 100).toFixed(1)}%)`);
        console.log(`   Items with trend_1y: ${trendStatusAfter[0].has_trend_1y} (${((trendStatusAfter[0].has_trend_1y / trendStatusAfter[0].total_items) * 100).toFixed(1)}%)\n`);
        
        // Show some example items with trends
        console.log("🔍 Sample items with trends:");
        const { rows: samples } = await db.query(`
            SELECT 
                item_id,
                name,
                trend_5m,
                trend_1h,
                trend_6h,
                trend_24h,
                trend_7d,
                trend_1m,
                trend_3m,
                trend_1y
            FROM canonical_items
            WHERE trend_5m IS NOT NULL 
               OR trend_1h IS NOT NULL 
               OR trend_6h IS NOT NULL
            ORDER BY item_id
            LIMIT 10
        `);
        
        for (const item of samples) {
            console.log(`\n   Item ${item.item_id}: ${item.name}`);
            if (item.trend_5m !== null) console.log(`      trend_5m: ${item.trend_5m}%`);
            if (item.trend_1h !== null) console.log(`      trend_1h: ${item.trend_1h}%`);
            if (item.trend_6h !== null) console.log(`      trend_6h: ${item.trend_6h}%`);
            if (item.trend_24h !== null) console.log(`      trend_24h: ${item.trend_24h}%`);
            if (item.trend_7d !== null) console.log(`      trend_7d: ${item.trend_7d}%`);
            if (item.trend_1m !== null) console.log(`      trend_1m: ${item.trend_1m}%`);
            if (item.trend_3m !== null) console.log(`      trend_3m: ${item.trend_3m}%`);
            if (item.trend_1y !== null) console.log(`      trend_1y: ${item.trend_1y}%`);
        }
        
        // Performance summary
        console.log(`\n📊 Performance Summary:`);
        console.log(`   Total items: ${itemCountBefore[0].count}`);
        console.log(`   Update time: ${duration} seconds`);
        console.log(`   Items per second: ${(itemCountBefore[0].count / parseFloat(duration)).toFixed(2)}`);
        
    } catch (err) {
        console.error("❌ Error during update:", err);
        throw err;
    } finally {
        await db.end();
    }
}

testCanonicalUpdate()
    .then(() => {
        console.log("\n✅ Test completed successfully");
        process.exit(0);
    })
    .catch(err => {
        console.error("\n❌ Test failed:", err);
        process.exit(1);
    });

