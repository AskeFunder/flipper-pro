// scripts/test-item-trends.js
// Test script to recalculate trends for a specific item

const db = require('../db/db');
const { calculateBatchTrends } = require('../poller/update-canonical-items');

async function testItemTrends(itemId) {
    console.log(`\n🔧 Testing trend calculation for item_id = ${itemId}\n`);
    
    const now = Math.floor(Date.now() / 1000);
    
    try {
        // Calculate trends using the batch function
        console.log('Calculating trends...');
        const trendsMap = await calculateBatchTrends([itemId], now);
        const trends = trendsMap.get(itemId);
        
        console.log('\n' + '='.repeat(80));
        console.log('CALCULATED TRENDS');
        console.log('='.repeat(80));
        console.log(`trend_5m:  ${trends?.trend_5m ?? 'NULL'}`);
        console.log(`trend_1h:  ${trends?.trend_1h ?? 'NULL'}`);
        console.log(`trend_6h:  ${trends?.trend_6h ?? 'NULL'}`);
        console.log(`trend_24h: ${trends?.trend_24h ?? 'NULL'}`);
        console.log(`trend_7d:  ${trends?.trend_7d ?? 'NULL'}`);
        console.log(`trend_1m:  ${trends?.trend_1m ?? 'NULL'}`);
        
        // Update canonical_items
        if (trends) {
            console.log('\n' + '='.repeat(80));
            console.log('UPDATING CANONICAL_ITEMS TABLE');
            console.log('='.repeat(80));
            
            await db.query(`
                UPDATE canonical_items
                SET 
                    trend_5m = $1,
                    trend_1h = $2,
                    trend_6h = $3,
                    trend_24h = $4,
                    trend_7d = $5,
                    trend_1m = $6
                WHERE item_id = $7
            `, [
                trends.trend_5m,
                trends.trend_1h,
                trends.trend_6h,
                trends.trend_24h,
                trends.trend_7d,
                trends.trend_1m,
                itemId
            ]);
            
            console.log('✅ Successfully updated canonical_items table');
            
            // Verify
            const verify = await db.query(
                'SELECT trend_5m, trend_1h, trend_6h, trend_24h, trend_7d, trend_1m FROM canonical_items WHERE item_id = $1',
                [itemId]
            );
            
            if (verify.rows.length > 0) {
                console.log('\n' + '='.repeat(80));
                console.log('VERIFICATION - STORED TRENDS');
                console.log('='.repeat(80));
                console.log(`trend_5m:  ${verify.rows[0].trend_5m ?? 'NULL'}`);
                console.log(`trend_1h:  ${verify.rows[0].trend_1h ?? 'NULL'}`);
                console.log(`trend_6h:  ${verify.rows[0].trend_6h ?? 'NULL'}`);
                console.log(`trend_24h: ${verify.rows[0].trend_24h ?? 'NULL'}`);
                console.log(`trend_7d:  ${verify.rows[0].trend_7d ?? 'NULL'}`);
                console.log(`trend_1m:  ${verify.rows[0].trend_1m ?? 'NULL'}`);
            }
        }
        
        console.log('\n✅ Test complete.');
        
    } catch (err) {
        console.error('❌ Error:', err);
        throw err;
    }
}

// Main execution
const itemId = process.argv[2] || 31961;

testItemTrends(parseInt(itemId))
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Test failed:', err);
        process.exit(1);
    });

