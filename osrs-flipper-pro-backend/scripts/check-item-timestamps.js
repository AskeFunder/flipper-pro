const db = require('../db/db');

async function checkItemTimestamps(itemId) {
    try {
        console.log(`\n=== Checking Item ${itemId} ===\n`);
        
        // Check price_instants (what browse uses)
        const instants = await db.query(`
            SELECT * FROM price_instants 
            WHERE item_id = $1
        `, [itemId]);
        
        console.log('price_instants (used by browse items):');
        if (instants.rows.length === 0) {
            console.log('  No data found');
        } else {
            const now = Math.floor(Date.now() / 1000);
            instants.rows.forEach(r => {
                const ageSeconds = now - r.timestamp;
                const ageMinutes = Math.floor(ageSeconds / 60);
                console.log(`  ${r.type}:`);
                console.log(`    price: ${r.price}`);
                console.log(`    timestamp: ${r.timestamp} (${new Date(r.timestamp * 1000).toLocaleString()})`);
                console.log(`    age: ${ageMinutes} minutes (${ageSeconds} seconds)`);
                console.log(`    last_updated: ${r.last_updated} (${new Date(r.last_updated * 1000).toLocaleString()})`);
            });
        }
        
        // Check price_instant_log (what recent trades uses)
        const log = await db.query(`
            SELECT * FROM price_instant_log 
            WHERE item_id = $1 
            ORDER BY timestamp DESC 
            LIMIT 10
        `, [itemId]);
        
        console.log('\nprice_instant_log (used by recent trades, last 10):');
        if (log.rows.length === 0) {
            console.log('  No data found');
        } else {
            const now = Math.floor(Date.now() / 1000);
            log.rows.forEach(r => {
                const ageSeconds = now - r.timestamp;
                const ageMinutes = Math.floor(ageSeconds / 60);
                console.log(`  ${r.type}:`);
                console.log(`    price: ${r.price}`);
                console.log(`    timestamp: ${r.timestamp} (${new Date(r.timestamp * 1000).toLocaleString()})`);
                console.log(`    age: ${ageMinutes} minutes (${ageSeconds} seconds)`);
                console.log(`    seen_at: ${r.seen_at} (${new Date(r.seen_at * 1000).toLocaleString()})`);
            });
        }
        
        // Check canonical_items
        const canonical = await db.query(`
            SELECT high, low, high_timestamp, low_timestamp 
            FROM canonical_items 
            WHERE item_id = $1
        `, [itemId]);
        
        console.log('\ncanonical_items (what browse displays):');
        if (canonical.rows.length === 0) {
            console.log('  No data found');
        } else {
            const now = Math.floor(Date.now() / 1000);
            const r = canonical.rows[0];
            if (r.high_timestamp) {
                const ageSeconds = now - r.high_timestamp;
                const ageMinutes = Math.floor(ageSeconds / 60);
                console.log(`  sell_price (high): ${r.high}, timestamp: ${r.high_timestamp}, age: ${ageMinutes} minutes`);
            }
            if (r.low_timestamp) {
                const ageSeconds = now - r.low_timestamp;
                const ageMinutes = Math.floor(ageSeconds / 60);
                console.log(`  buy_price (low): ${r.low}, timestamp: ${r.low_timestamp}, age: ${ageMinutes} minutes`);
            }
        }
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await db.end();
    }
}

const itemId = process.argv[2] ? parseInt(process.argv[2], 10) : 22597;
checkItemTimestamps(itemId);





