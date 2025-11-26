const fetch = require("node-fetch");
const db = require("../db/db"); // Adjust if needed

const MOCK_CHANGE_RATE = parseFloat(process.env.MOCK_CHANGE_RATE || "0.05"); // Default 5%
const MOCK_LATEST = process.env.MOCK_LATEST === "true";

/**
 * Generate mock price data by mutating existing prices
 * Randomly changes prices for MOCK_CHANGE_RATE percentage of items
 */
async function generateMockData() {
    const now = Math.floor(Date.now() / 1000);
    
    // Fetch all items from database
    const { rows: items } = await db.query("SELECT id FROM items ORDER BY id");
    
    if (items.length === 0) {
        throw new Error("No items found in database for mock mode");
    }
    
    // Fetch current price_instants to mutate
    const { rows: currentPrices } = await db.query(`
        SELECT item_id, price, type, timestamp
        FROM price_instants
        ORDER BY item_id, type
    `);
    
    // Organize current prices by item_id
    const pricesByItem = new Map();
    for (const price of currentPrices) {
        if (!pricesByItem.has(price.item_id)) {
            pricesByItem.set(price.item_id, {});
        }
        pricesByItem.get(price.item_id)[price.type] = price;
    }
    
    // Calculate how many items to mutate
    const numItemsToMutate = Math.max(1, Math.floor(items.length * MOCK_CHANGE_RATE));
    
    // Randomly select items to mutate
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    const itemsToMutate = shuffled.slice(0, numItemsToMutate);
    
    // Generate mock data structure matching API format
    const data = {};
    
    for (const item of items) {
        const itemId = item.id;
        const existingPrices = pricesByItem.get(itemId) || {};
        const shouldMutate = itemsToMutate.some(i => i.id === itemId);
        
        // Get existing prices or generate defaults
        let high = existingPrices.high?.price || 1000;
        let low = existingPrices.low?.price || 500;
        let highTime = existingPrices.high?.timestamp || now;
        let lowTime = existingPrices.low?.timestamp || now;
        
        if (shouldMutate) {
            // Mutate prices: random change between -10% and +10%
            const highChange = 1 + (Math.random() * 0.2 - 0.1); // -10% to +10%
            const lowChange = 1 + (Math.random() * 0.2 - 0.1); // -10% to +10%
            
            high = Math.max(1, Math.floor(high * highChange));
            low = Math.max(1, Math.floor(low * lowChange));
            
            // Ensure low <= high
            if (low > high) {
                low = Math.max(1, Math.floor(high * 0.8));
            }
            
            // Update timestamps to current time (increasing)
            highTime = now;
            lowTime = now;
        } else {
            // Keep existing timestamps or use current time if missing
            highTime = existingPrices.high?.timestamp || now;
            lowTime = existingPrices.low?.timestamp || now;
        }
        
        data[itemId] = {
            high: high,
            highTime: highTime,
            low: low,
            lowTime: lowTime
        };
    }
    
    console.log(`[MOCK] Generated mock data: ${numItemsToMutate}/${items.length} items mutated (${(MOCK_CHANGE_RATE * 100).toFixed(1)}% change rate)`);
    
    return { data, now };
}

async function pollLatest() {
    const startTime = Date.now();
    
    let data, now;
    
    if (MOCK_LATEST) {
        // Generate mock data instead of fetching from API
        const mockResult = await generateMockData();
        data = mockResult.data;
        now = mockResult.now;
    } else {
        // Normal API fetch
        const res = await fetch("https://prices.runescape.wiki/api/v1/osrs/latest", {
            headers: {
                "User-Agent": "flipperpro-dev - @montemarto" // Update this!
            }
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status} - ${await res.text()}`);
        }

        const json = await res.json();
        data = json.data;
        now = Math.floor(Date.now() / 1000);
    }

    try {
        await db.query("BEGIN");

        let rowsUpdated = 0;
        let rowsSkipped = 0;

        for (const [itemIdStr, entry] of Object.entries(data)) {
            const itemId = parseInt(itemIdStr, 10);

            if (entry.high !== null && entry.highTime !== null) {
                const result = await db.query(`
                    INSERT INTO price_instants (item_id, price, type, timestamp, last_updated)
                    VALUES ($1, $2, 'high', $3, $4)
                    ON CONFLICT (item_id, type) DO UPDATE SET
                        price = EXCLUDED.price,
                        timestamp = EXCLUDED.timestamp,
                        last_updated = EXCLUDED.last_updated
                    WHERE price_instants.timestamp IS DISTINCT FROM EXCLUDED.timestamp;
                `, [itemId, entry.high, entry.highTime, now]);
                
                // rowCount = 1: INSERT or UPDATE happened (timestamp changed)
                // rowCount = 0: Row exists but WHERE clause prevented UPDATE (dedupe working)
                if (result.rowCount > 0) {
                    rowsUpdated++;
                    // Mark item as dirty only when timestamp update actually happened
                    await db.query(`
                        INSERT INTO dirty_items (item_id, touched_at)
                        VALUES ($1, $2)
                        ON CONFLICT (item_id) DO UPDATE SET
                            touched_at = EXCLUDED.touched_at
                    `, [itemId, now]);
                } else {
                    rowsSkipped++;
                }

                await db.query(`
                    INSERT INTO price_instant_log (item_id, price, type, timestamp, seen_at)
                    VALUES ($1, $2, 'high', $3, $4)
                    ON CONFLICT DO NOTHING;
                `, [itemId, entry.high, entry.highTime, now]);
            }

            if (entry.low !== null && entry.lowTime !== null) {
                const result = await db.query(`
                    INSERT INTO price_instants (item_id, price, type, timestamp, last_updated)
                    VALUES ($1, $2, 'low', $3, $4)
                    ON CONFLICT (item_id, type) DO UPDATE SET
                        price = EXCLUDED.price,
                        timestamp = EXCLUDED.timestamp,
                        last_updated = EXCLUDED.last_updated
                    WHERE price_instants.timestamp IS DISTINCT FROM EXCLUDED.timestamp;
                `, [itemId, entry.low, entry.lowTime, now]);
                
                // rowCount = 1: INSERT or UPDATE happened (timestamp changed)
                // rowCount = 0: Row exists but WHERE clause prevented UPDATE (dedupe working)
                if (result.rowCount > 0) {
                    rowsUpdated++;
                    // Mark item as dirty only when timestamp update actually happened
                    await db.query(`
                        INSERT INTO dirty_items (item_id, touched_at)
                        VALUES ($1, $2)
                        ON CONFLICT (item_id) DO UPDATE SET
                            touched_at = EXCLUDED.touched_at
                    `, [itemId, now]);
                } else {
                    rowsSkipped++;
                }

                await db.query(`
                    INSERT INTO price_instant_log (item_id, price, type, timestamp, seen_at)
                    VALUES ($1, $2, 'low', $3, $4)
                    ON CONFLICT DO NOTHING;
                `, [itemId, entry.low, entry.lowTime, now]);
            }
        }

        await db.query("COMMIT");
        
        // Get dirty items count for visibility
        const { rows: dirtyCount } = await db.query(`
            SELECT COUNT(*)::INT AS count FROM dirty_items
        `);
        console.log(`[DIRTY] ${dirtyCount[0].count} items currently marked dirty`);
        
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const itemCount = Object.keys(data).length;
        const itemsPerSec = (itemCount / parseFloat(elapsedTime)).toFixed(0);
        const modeLabel = MOCK_LATEST ? `[MOCK]` : `[LATEST]`;
        console.log(`${modeLabel} Processed ${itemCount} items, updated ${rowsUpdated} rows, skipped ${rowsSkipped} (dedupe) @ ${new Date().toISOString()}`);
        console.log(`[PERF] pollLatest: ${itemCount} items in ${elapsedTime}s → ${itemsPerSec}/sec`);
    } catch (err) {
        await db.query("ROLLBACK");
        console.error("[LATEST] Error during DB transaction:", err.message);
    }
}

pollLatest().catch(err => {
    console.error("[LATEST] Error polling:", err.message);
});
