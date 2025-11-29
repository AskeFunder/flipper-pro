const db = require('../db/db');

async function debugQuery() {
    try {
        const now = Math.floor(Date.now() / 1000);
        
        // Check a sample of items
        const sample = await db.query(`
            SELECT 
                i.id,
                c.timestamp_updated as canonical_ts,
                pi.max_last_updated as price_ts,
                (pi.max_last_updated > c.timestamp_updated) as has_new_price,
                (c.timestamp_updated IS NULL) as missing_canonical,
                (c.timestamp_updated < $1 - 300) as stale_canonical
            FROM items i
            LEFT JOIN canonical_items c ON i.id = c.item_id
            LEFT JOIN (
                SELECT item_id, MAX(last_updated) as max_last_updated
                FROM price_instants
                GROUP BY item_id
            ) pi ON i.id = pi.item_id
            WHERE i.id IN (22597, 31961, 28736)
            ORDER BY i.id
        `, [now]);
        
        console.log('Sample items:');
        sample.rows.forEach(r => {
            console.log(`\nItem ${r.id}:`);
            console.log(`  canonical_ts: ${r.canonical_ts} (${r.canonical_ts ? new Date(r.canonical_ts * 1000).toLocaleString() : 'NULL'})`);
            console.log(`  price_ts: ${r.price_ts} (${r.price_ts ? new Date(r.price_ts * 1000).toLocaleString() : 'NULL'})`);
            console.log(`  has_new_price: ${r.has_new_price}`);
            console.log(`  missing_canonical: ${r.missing_canonical}`);
            console.log(`  stale_canonical: ${r.stale_canonical}`);
        });
        
        // Count by reason
        const counts = await db.query(`
            SELECT 
                COUNT(*) FILTER (WHERE pi.max_last_updated > c.timestamp_updated OR c.timestamp_updated IS NULL) as has_new_price_count,
                COUNT(*) FILTER (WHERE c.timestamp_updated IS NOT NULL AND c.timestamp_updated < $1 - 300) as stale_count,
                COUNT(*) FILTER (WHERE c.item_id IS NULL) as missing_count
            FROM items i
            LEFT JOIN canonical_items c ON i.id = c.item_id
            LEFT JOIN (
                SELECT item_id, MAX(last_updated) as max_last_updated
                FROM price_instants
                GROUP BY item_id
            ) pi ON i.id = pi.item_id
        `, [now]);
        
        console.log('\nBreakdown:');
        console.log('  Has new price data:', counts.rows[0].has_new_price_count);
        console.log('  Stale (>5 min old):', counts.rows[0].stale_count);
        console.log('  Missing canonical:', counts.rows[0].missing_count);
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await db.end();
    }
}

debugQuery();







