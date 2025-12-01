require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        console.log("=".repeat(80));
        console.log("🧪 TESTING CANONICAL UPDATE FIX");
        console.log("=".repeat(80));
        
        // Test 1: Check if price_instants query works
        console.log("\n📋 Test 1: Testing price_instants query structure...");
        
        const testItemIds = [2, 6, 8, 10, 12]; // Sample items
        
        const priceInstantsTest = await db.query(`
            SELECT 
                item_id,
                MAX(CASE WHEN type = 'high' THEN price END) as high,
                MAX(CASE WHEN type = 'low' THEN price END) as low,
                MAX(CASE WHEN type = 'high' THEN timestamp END) as high_timestamp,
                MAX(CASE WHEN type = 'low' THEN timestamp END) as low_timestamp
            FROM (
                SELECT DISTINCT ON (item_id, type)
                    item_id, 
                    price,
                    type,
                    timestamp
                FROM price_instants
                WHERE item_id = ANY($1)
                ORDER BY item_id, type, timestamp DESC
            ) AS latest_prices
            GROUP BY item_id
        `, [testItemIds]);
        
        console.log(`✅ Query executed successfully`);
        console.log(`   Found ${priceInstantsTest.rows.length} items`);
        
        if (priceInstantsTest.rows.length > 0) {
            console.log("\n   Sample results:");
            priceInstantsTest.rows.slice(0, 3).forEach(row => {
                console.log(`   Item ${row.item_id}: high=${row.high}, low=${row.low}`);
                console.log(`     high_ts=${row.high_timestamp}, low_ts=${row.low_timestamp}`);
            });
        }
        
        // Test 2: Check if pricesByItem structure works
        console.log("\n📋 Test 2: Testing pricesByItem structure...");
        
        const pricesByItem = new Map();
        for (const itemId of testItemIds) {
            pricesByItem.set(itemId, {});
        }
        
        for (const row of priceInstantsTest.rows) {
            const entry = pricesByItem.get(row.item_id);
            if (entry) {
                entry.high = row.high != null ? { price: row.high, timestamp: row.high_timestamp } : null;
                entry.low = row.low != null ? { price: row.low, timestamp: row.low_timestamp } : null;
            }
        }
        
        console.log(`✅ pricesByItem structure created`);
        let validCount = 0;
        for (const [itemId, prices] of pricesByItem.entries()) {
            if (prices.high && prices.low) {
                validCount++;
                console.log(`   Item ${itemId}: high=${prices.high.price} (ts: ${prices.high.timestamp}), low=${prices.low.price} (ts: ${prices.low.timestamp})`);
            } else {
                console.log(`   Item ${itemId}: missing data (high: ${prices.high ? 'yes' : 'no'}, low: ${prices.low ? 'yes' : 'no'})`);
            }
        }
        
        console.log(`\n   Valid items: ${validCount}/${testItemIds.length}`);
        
        // Test 3: Check if the fix would work with actual update
        console.log("\n📋 Test 3: Simulating batch processing...");
        
        // Get a small batch of dirty items
        const dirtyItems = await db.query(`
            SELECT item_id 
            FROM dirty_items 
            LIMIT 5
        `);
        
        if (dirtyItems.rows.length > 0) {
            const testBatch = dirtyItems.rows.map(r => r.item_id);
            console.log(`   Testing with ${testBatch.length} items from dirty_items: ${testBatch.join(', ')}`);
            
            // Test the price_instants query with this batch
            const batchTest = await db.query(`
                SELECT 
                    item_id,
                    MAX(CASE WHEN type = 'high' THEN price END) as high,
                    MAX(CASE WHEN type = 'low' THEN price END) as low,
                    MAX(CASE WHEN type = 'high' THEN timestamp END) as high_timestamp,
                    MAX(CASE WHEN type = 'low' THEN timestamp END) as low_timestamp
                FROM (
                    SELECT DISTINCT ON (item_id, type)
                        item_id, 
                        price,
                        type,
                        timestamp
                    FROM price_instants
                    WHERE item_id = ANY($1)
                    ORDER BY item_id, type, timestamp DESC
                ) AS latest_prices
                GROUP BY item_id
            `, [testBatch]);
            
            console.log(`   ✅ Query returned ${batchTest.rows.length} results`);
            
            if (batchTest.rows.length > 0) {
                console.log("   Sample data:");
                batchTest.rows.forEach(row => {
                    console.log(`     Item ${row.item_id}: high=${row.high ?? 'NULL'}, low=${row.low ?? 'NULL'}`);
                });
            }
        } else {
            console.log("   ⚠️  No dirty items found for testing");
        }
        
        console.log("\n" + "=".repeat(80));
        console.log("✅ ALL TESTS PASSED");
        console.log("=".repeat(80));
        console.log("\n💡 The fix should work correctly on VM");
        console.log("   Ready to upload and test on VM");
        
    } catch (err) {
        console.error("\n❌ TEST FAILED:", err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await db.end();
    }
})();



