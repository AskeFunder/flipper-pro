const updateCanonicalItems = require('../poller/update-canonical-items');
const db = require('../db/db');

async function profileUpdate() {
    const startTime = Date.now();
    console.log(`[PROFILE] Starting update at ${new Date().toISOString()}`);
    
    const now = Math.floor(Date.now() / 1000);
    
    // Test with a small batch first
    const { rows: items } = await db.query(`
        SELECT DISTINCT i.id, i.name, i.icon, i.members, i."limit"
        FROM items i
        LEFT JOIN canonical_items c ON i.id = c.item_id
        LEFT JOIN (
            SELECT item_id, MAX(last_updated) as max_last_updated
            FROM price_instants
            GROUP BY item_id
        ) pi ON i.id = pi.item_id
        WHERE 
            (pi.max_last_updated > c.timestamp_updated OR c.timestamp_updated IS NULL)
            OR (c.timestamp_updated IS NOT NULL AND c.timestamp_updated < $1 - 300)
            OR c.item_id IS NULL
        ORDER BY i.id
        LIMIT 10
    `, [now]);
    
    console.log(`[PROFILE] Testing with ${items.length} items`);
    
    const itemIds = items.map(item => item.id);
    const placeholders = itemIds.map((_, i) => `$${i + 1}`).join(',');
    
    // Test batched price_instants query
    let t0 = Date.now();
    const { rows: allPrices } = await db.query(`
        SELECT item_id, price, timestamp, type
        FROM price_instants
        WHERE item_id IN (${placeholders})
    `, itemIds);
    console.log(`[PROFILE] price_instants query: ${Date.now() - t0}ms`);
    
    // Test batched volumes query
    t0 = Date.now();
    const { rows: allVolumes } = await db.query(`
        WITH item_list AS (SELECT unnest(ARRAY[${placeholders}]::INTEGER[]) AS item_id),
        vol5m AS (
            SELECT DISTINCT ON (p.item_id) p.item_id, p.volume
            FROM price_5m p
            INNER JOIN item_list il ON p.item_id = il.item_id
            ORDER BY p.item_id, p.timestamp DESC
        ),
        vol1h AS (
            SELECT p.item_id, COALESCE(SUM(p.volume), 0)::BIGINT AS volume
            FROM price_5m p
            INNER JOIN item_list il ON p.item_id = il.item_id
            WHERE p.timestamp >= $${itemIds.length + 1}
            GROUP BY p.item_id
        )
        SELECT 
            il.item_id,
            v5.volume AS vol5m,
            COALESCE(v1.volume, 0) AS vol1h
        FROM item_list il
        LEFT JOIN vol5m v5 ON il.item_id = v5.item_id
        LEFT JOIN vol1h v1 ON il.item_id = v1.item_id
    `, [...itemIds, now - 3600]);
    console.log(`[PROFILE] volumes query: ${Date.now() - t0}ms`);
    
    // Test individual queries for comparison
    t0 = Date.now();
    for (const itemId of itemIds.slice(0, 5)) {
        await db.query(`
            SELECT volume
            FROM price_5m
            WHERE item_id = $1
            ORDER BY timestamp DESC
            LIMIT 1
        `, [itemId]);
    }
    console.log(`[PROFILE] 5 individual volume queries: ${Date.now() - t0}ms`);
    
    await db.end();
}

profileUpdate().catch(console.error);





