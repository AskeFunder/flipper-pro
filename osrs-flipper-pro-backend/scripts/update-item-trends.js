// Script to update trends for a specific item
const db = require('../db/db');

// Read the calculateBatchTrends function from the update file
// We'll execute the update function directly
const updateCanonicalItems = require('../poller/update-canonical-items').default || require('../poller/update-canonical-items');

async function updateSingleItemTrends(itemId) {
    console.log(`\n🔄 Updating trends for item ${itemId}...\n`);
    
    try {
        // We'll use the calculateBatchTrends function directly
        const now = Math.floor(Date.now() / 1000);
        
        // Import the function - it's not exported, so we need to access it differently
        // Let's just trigger the full update and check the result
        const { rows: items } = await db.query('SELECT id FROM items WHERE id = $1', [itemId]);
        
        if (items.length === 0) {
            console.log(`❌ Item ${itemId} not found in items table`);
            return;
        }
        
        // Manually call the trend calculation logic
        // We need to access calculateBatchTrends - let's use eval or require it differently
        const fs = require('fs');
        const path = require('path');
        const updatePath = path.join(__dirname, '../poller/update-canonical-items.js');
        const updateCode = fs.readFileSync(updatePath, 'utf8');
        
        // Extract and execute just the trend calculation part
        // Actually, let's just run the update function for all items - it will update this one too
        
        console.log('📊 Calculating trends...');
        console.log('Note: This will update trends for ALL items, but we\'ll check the result for item', itemId);
        
        // Read the stored trends before
        const before = await db.query(
            'SELECT trend_5m, trend_1h, trend_6h, trend_24h, trend_7d, trend_1m FROM canonical_items WHERE item_id = $1',
            [itemId]
        );
        
        if (before.rows.length > 0) {
            console.log('\n📋 Trends BEFORE update:');
            const b = before.rows[0];
            console.log(`  trend_5m:  ${b.trend_5m ?? 'NULL'}`);
            console.log(`  trend_1h:  ${b.trend_1h ?? 'NULL'}`);
            console.log(`  trend_6h:  ${b.trend_6h ?? 'NULL'}`);
            console.log(`  trend_24h: ${b.trend_24h ?? 'NULL'}`);
            console.log(`  trend_7d:  ${b.trend_7d ?? 'NULL'}`);
            console.log(`  trend_1m:  ${b.trend_1m ?? 'NULL'}`);
        }
        
        console.log('\n⏳ Running trend calculation update...');
        console.log('(This may take a moment as it processes all items)');
        
        // Import and run the update function
        const updateModule = require('../poller/update-canonical-items');
        await updateModule.default();
        
        // Check the results
        const after = await db.query(
            'SELECT trend_5m, trend_1h, trend_6h, trend_24h, trend_7d, trend_1m FROM canonical_items WHERE item_id = $1',
            [itemId]
        );
        
        if (after.rows.length > 0) {
            console.log('\n📋 Trends AFTER update:');
            const a = after.rows[0];
            console.log(`  trend_5m:  ${a.trend_5m ?? 'NULL'}`);
            console.log(`  trend_1h:  ${a.trend_1h ?? 'NULL'}`);
            console.log(`  trend_6h:  ${a.trend_6h ?? 'NULL'}`);
            console.log(`  trend_24h: ${a.trend_24h ?? 'NULL'}`);
            console.log(`  trend_7d:  ${a.trend_7d ?? 'NULL'}`);
            console.log(`  trend_1m:  ${a.trend_1m ?? 'NULL'}`);
            
            // Check if anything changed
            if (before.rows.length > 0) {
                const b = before.rows[0];
                let changed = false;
                if (a.trend_5m !== b.trend_5m) changed = true;
                if (a.trend_1h !== b.trend_1h) changed = true;
                if (a.trend_6h !== b.trend_6h) changed = true;
                if (a.trend_24h !== b.trend_24h) changed = true;
                if (a.trend_7d !== b.trend_7d) changed = true;
                if (a.trend_1m !== b.trend_1m) changed = true;
                
                if (changed) {
                    console.log('\n✅ Trends were updated!');
                } else {
                    console.log('\n⚠️  Trends did not change (still NULL or same values)');
                }
            }
        } else {
            console.log('\n⚠️  Item not found in canonical_items table after update');
        }
        
    } catch (err) {
        console.error('❌ Error:', err.message);
        if (err.stack) {
            console.error(err.stack);
        }
        throw err;
    } finally {
        await db.end();
    }
}

const itemId = parseInt(process.argv[2]) || 31961;
updateSingleItemTrends(itemId)
    .then(() => {
        console.log('\n✅ Complete');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Failed:', err);
        process.exit(1);
    });




