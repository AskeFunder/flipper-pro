require("dotenv").config();
const db = require("../db/db");

async function testTrends() {
    try {
        console.log("Testing trend calculation system...\n");
        
        // Check if columns exist
        const { rows: columns } = await db.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'canonical_items' 
            AND column_name LIKE 'trend_%'
            ORDER BY column_name
        `);
        
        console.log("Available trend columns:");
        columns.forEach(col => console.log(`  ✓ ${col.column_name}`));
        console.log();
        
        // Get sample items with trends
        const { rows: items } = await db.query(`
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
                trend_1y,
                timestamp_updated
            FROM canonical_items
            WHERE trend_5m IS NOT NULL 
               OR trend_1h IS NOT NULL 
               OR trend_6h IS NOT NULL 
               OR trend_24h IS NOT NULL
               OR trend_7d IS NOT NULL
               OR trend_1m IS NOT NULL
               OR trend_3m IS NOT NULL
               OR trend_1y IS NOT NULL
            ORDER BY timestamp_updated DESC
            LIMIT 10
        `);
        
        if (items.length === 0) {
            console.log("❌ No items with trends found. Trends may not have been calculated yet.");
            console.log("   Run the canonical update to calculate trends.");
            return;
        }
        
        console.log(`Found ${items.length} items with trends:\n`);
        
        items.forEach((item, idx) => {
            console.log(`${idx + 1}. ${item.name} (ID: ${item.item_id})`);
            console.log(`   Updated: ${new Date(item.timestamp_updated * 1000).toLocaleString()}`);
            if (item.trend_5m !== null) console.log(`   trend_5m: ${item.trend_5m}%`);
            if (item.trend_1h !== null) console.log(`   trend_1h: ${item.trend_1h}%`);
            if (item.trend_6h !== null) console.log(`   trend_6h: ${item.trend_6h}%`);
            if (item.trend_24h !== null) console.log(`   trend_24h: ${item.trend_24h}%`);
            if (item.trend_7d !== null) console.log(`   trend_7d: ${item.trend_7d}%`);
            if (item.trend_1m !== null) console.log(`   trend_1m: ${item.trend_1m}%`);
            if (item.trend_3m !== null) console.log(`   trend_3m: ${item.trend_3m}%`);
            if (item.trend_1y !== null) console.log(`   trend_1y: ${item.trend_1y}%`);
            console.log();
        });
        
        // Get statistics
        const { rows: stats } = await db.query(`
            SELECT 
                COUNT(*) as total_items,
                COUNT(trend_5m) as has_5m,
                COUNT(trend_1h) as has_1h,
                COUNT(trend_6h) as has_6h,
                COUNT(trend_24h) as has_24h,
                COUNT(trend_7d) as has_7d,
                COUNT(trend_1m) as has_1m,
                COUNT(trend_3m) as has_3m,
                COUNT(trend_1y) as has_1y
            FROM canonical_items
        `);
        
        const stat = stats[0];
        console.log("Trend coverage statistics:");
        console.log(`  Total items: ${stat.total_items}`);
        console.log(`  trend_5m: ${stat.has_5m} (${((stat.has_5m / stat.total_items) * 100).toFixed(1)}%)`);
        console.log(`  trend_1h: ${stat.has_1h} (${((stat.has_1h / stat.total_items) * 100).toFixed(1)}%)`);
        console.log(`  trend_6h: ${stat.has_6h} (${((stat.has_6h / stat.total_items) * 100).toFixed(1)}%)`);
        console.log(`  trend_24h: ${stat.has_24h} (${((stat.has_24h / stat.total_items) * 100).toFixed(1)}%)`);
        console.log(`  trend_7d: ${stat.has_7d} (${((stat.has_7d / stat.total_items) * 100).toFixed(1)}%)`);
        console.log(`  trend_1m: ${stat.has_1m} (${((stat.has_1m / stat.total_items) * 100).toFixed(1)}%)`);
        console.log(`  trend_3m: ${stat.has_3m} (${((stat.has_3m / stat.total_items) * 100).toFixed(1)}%)`);
        console.log(`  trend_1y: ${stat.has_1y} (${((stat.has_1y / stat.total_items) * 100).toFixed(1)}%)`);
        
    } catch (err) {
        console.error("Error testing trends:", err);
    } finally {
        await db.end();
    }
}

testTrends();

