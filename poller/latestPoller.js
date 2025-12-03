// Environment variables are loaded by load-env.js before this module is required
const fetch = require("node-fetch");
const db = require("../db/db");

const MOCK_CHANGE_RATE = parseFloat(process.env.MOCK_CHANGE_RATE || "0.05");
const MOCK_LATEST = process.env.MOCK_LATEST === "true";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "500");

/**
 * Generate mock price data by mutating existing prices
 */
async function generateMockData() {
    const now = Math.floor(Date.now() / 1000);
    
    const { rows: items } = await db.query("SELECT id FROM items ORDER BY id");
    
    if (items.length === 0) {
        throw new Error("No items found in database for mock mode");
    }
    
    const { rows: currentPrices } = await db.query(`
        SELECT item_id, price, type, timestamp
        FROM price_instants
        ORDER BY item_id, type
    `);
    
    const pricesByItem = new Map();
    for (const price of currentPrices) {
        if (!pricesByItem.has(price.item_id)) {
            pricesByItem.set(price.item_id, {});
        }
        pricesByItem.get(price.item_id)[price.type] = price;
    }
    
    const numItemsToMutate = Math.max(1, Math.floor(items.length * MOCK_CHANGE_RATE));
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    const itemsToMutate = shuffled.slice(0, numItemsToMutate);
    
    const data = {};
    
    for (const item of items) {
        const itemId = item.id;
        const existingPrices = pricesByItem.get(itemId) || {};
        const shouldMutate = itemsToMutate.some(i => i.id === itemId);
        
        let high = existingPrices.high?.price || 1000;
        let low = existingPrices.low?.price || 500;
        let highTime = existingPrices.high?.timestamp || now;
        let lowTime = existingPrices.low?.timestamp || now;
        
        if (shouldMutate) {
            const highChange = 1 + (Math.random() * 0.2 - 0.1);
            const lowChange = 1 + (Math.random() * 0.2 - 0.1);
            
            high = Math.max(1, Math.floor(high * highChange));
            low = Math.max(1, Math.floor(low * lowChange));
            
            if (low > high) {
                low = Math.max(1, Math.floor(high * 0.8));
            }
            
            highTime = now;
            lowTime = now;
        } else {
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
    
    return { data, now };
}

/**
 * Run latest poll once - NO scheduling logic, just execution
 * @returns {Promise<void>}
 */
async function runLatestPollOnce() {
    const startTime = Date.now();
    
    console.log("[LATEST] Starting poll-latest...");
    
    let data, now;
    
    if (MOCK_LATEST) {
        console.log("[LATEST] Using MOCK mode - generating mock data...");
        const mockResult = await generateMockData();
        data = mockResult.data;
        now = mockResult.now;
        console.log(`[LATEST] Mock data generated: ${Object.keys(data).length} items`);
    } else {
        console.log("[LATEST] Fetching data from OSRS API...");
        const res = await fetch("https://prices.runescape.wiki/api/v1/osrs/latest", {
            headers: {
                "User-Agent": "flipperpro-dev - @montemarto"
            }
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status} - ${await res.text()}`);
        }

        const json = await res.json();
        data = json.data;
        now = Math.floor(Date.now() / 1000);
        console.log(`[LATEST] API fetch complete: ${Object.keys(data).length} items received`);
    }

    try {
        console.log("[LATEST] Starting database transaction...");
        await db.query("BEGIN");

        // Fetch current DB state for comparison (only items we received from API)
        const itemIds = Object.keys(data).map(id => parseInt(id, 10));
        let currentDbState = new Map();
        
        if (itemIds.length > 0) {
            const placeholders = itemIds.map((_, i) => '$' + (i + 1)).join(',');
            const { rows: currentPrices } = await db.query(`
                SELECT item_id, price, type, timestamp
                FROM price_instants
                WHERE item_id IN (${placeholders})
            `, itemIds);
            
            // Organize by item_id and type
            for (const row of currentPrices) {
                if (!currentDbState.has(row.item_id)) {
                    currentDbState.set(row.item_id, { high: null, low: null });
                }
                const itemState = currentDbState.get(row.item_id);
                if (row.type === 'high') {
                    itemState.high = { price: row.price, timestamp: row.timestamp };
                } else if (row.type === 'low') {
                    itemState.low = { price: row.price, timestamp: row.timestamp };
                }
            }
        }

        const priceInstantsHigh = [];
        const priceInstantsLow = [];
        const instantLog = [];
        
        // Event type tracking for logging
        let priceChangeEvents = 0;      // Price changed (timestamp always changes with price)
        let timestampOnlyEvents = 0;    // Timestamp changed but price unchanged
        let newItems = 0;               // Items not in DB yet
        
        let rowsUpdated = 0;
        let rowsSkipped = 0;

        const totalItems = Object.keys(data).length;
        let processedItems = 0;
        const logInterval = Math.max(1, Math.floor(totalItems / 10));
        
        for (const [itemIdStr, entry] of Object.entries(data)) {
            const itemId = parseInt(itemIdStr, 10);
            const itemState = currentDbState.get(itemId) || { high: null, low: null };

            // Process HIGH price
            if (entry.high !== null && entry.highTime !== null) {
                const existingHigh = itemState.high;
                
                // Determine if this is a real event
                if (existingHigh === null) {
                    // New item - always process
                    newItems++;
                    priceInstantsHigh.push([itemId, entry.high, entry.highTime, now]);
                    instantLog.push([itemId, entry.high, 'high', entry.highTime, now]);
                } else {
                    // Compare with existing state
                    const priceChanged = existingHigh.price !== entry.high;
                    const timeChanged = existingHigh.timestamp !== entry.highTime;
                    
                    // REAL EVENT: price change OR timestamp change
                    if (priceChanged || timeChanged) {
                        if (priceChanged) {
                            priceChangeEvents++;
                        } else if (timeChanged) {
                            timestampOnlyEvents++;
                        }
                        
                        priceInstantsHigh.push([itemId, entry.high, entry.highTime, now]);
                        instantLog.push([itemId, entry.high, 'high', entry.highTime, now]);
                    }
                    // If neither changed, skip (no real event)
                }
            }

            // Process LOW price
            if (entry.low !== null && entry.lowTime !== null) {
                const existingLow = itemState.low;
                
                // Determine if this is a real event
                if (existingLow === null) {
                    // New item - always process
                    newItems++;
                    priceInstantsLow.push([itemId, entry.low, entry.lowTime, now]);
                    instantLog.push([itemId, entry.low, 'low', entry.lowTime, now]);
                } else {
                    // Compare with existing state
                    const priceChanged = existingLow.price !== entry.low;
                    const timeChanged = existingLow.timestamp !== entry.lowTime;
                    
                    // REAL EVENT: price change OR timestamp change
                    if (priceChanged || timeChanged) {
                        if (priceChanged) {
                            priceChangeEvents++;
                        } else if (timeChanged) {
                            timestampOnlyEvents++;
                        }
                        
                        priceInstantsLow.push([itemId, entry.low, entry.lowTime, now]);
                        instantLog.push([itemId, entry.low, 'low', entry.lowTime, now]);
                    }
                    // If neither changed, skip (no real event)
                }
            }
            
            processedItems++;
            if (processedItems % logInterval === 0) {
                const percent = Math.floor((processedItems / totalItems) * 100);
                process.stdout.write(`\r[LATEST] Processing items: ${processedItems}/${totalItems} (${percent}%)`);
            }
        }
        process.stdout.write('\n');
        console.log(`[LATEST] Event detection complete:`);
        console.log(`  - Price changes: ${priceChangeEvents}`);
        console.log(`  - Timestamp-only changes: ${timestampOnlyEvents}`);
        console.log(`  - New items: ${newItems}`);
        console.log(`[LATEST] Data preparation: ${priceInstantsHigh.length} high events, ${priceInstantsLow.length} low events`);
        
        // Check if there are any changes at all
        const totalChanges = priceChangeEvents + timestampOnlyEvents + newItems;
        if (totalChanges === 0) {
            // No changes detected - this is a failure, should retry
            console.log(`[LATEST] ⚠️ No changes detected - no price or timestamp changes found`);
            throw new Error(`No changes detected - will retry`);
        }

        // Bulk update HIGH prices
        console.log(`[LATEST] Bulk updating HIGH prices (${priceInstantsHigh.length} items) in batches of ${BATCH_SIZE}...`);
        const highUpdateStart = Date.now();
        const updatedHighItemIds = new Set();
        let highRowsUpdated = 0;
        let highRowsSkipped = 0;
        if (priceInstantsHigh.length > 0) {
            const numBatches = Math.ceil(priceInstantsHigh.length / BATCH_SIZE);
            for (let i = 0; i < numBatches; i++) {
                const startIdx = i * BATCH_SIZE;
                const endIdx = Math.min(startIdx + BATCH_SIZE, priceInstantsHigh.length);
                const batch = priceInstantsHigh.slice(startIdx, endIdx);
                
                console.log(`[LATEST] Processing HIGH batch ${i + 1}/${numBatches} (${batch.length} items)...`);
                try {
                    const result = await db.query(`
                        WITH updates AS (
                            SELECT * FROM UNNEST($1::int[], $2::bigint[], $3::int[], $4::int[]) 
                            AS t(item_id, price, timestamp, last_updated)
                        )
                        INSERT INTO price_instants (item_id, price, type, timestamp, last_updated)
                        SELECT item_id, price, 'high', timestamp, last_updated FROM updates
                        ON CONFLICT (item_id, type) DO UPDATE SET
                            price = EXCLUDED.price,
                            timestamp = EXCLUDED.timestamp,
                            last_updated = EXCLUDED.last_updated
                        WHERE price_instants.timestamp IS DISTINCT FROM EXCLUDED.timestamp
                           OR price_instants.price IS DISTINCT FROM EXCLUDED.price
                        RETURNING item_id;
                    `, [
                        batch.map(r => r[0]),
                        batch.map(r => r[1]),
                        batch.map(r => r[2]),
                        batch.map(r => r[3])
                    ]);
                    highRowsUpdated += result.rowCount;
                    highRowsSkipped += batch.length - result.rowCount;
                    
                    result.rows.forEach(row => updatedHighItemIds.add(row.item_id));
                } catch (err) {
                    console.error(`[LATEST] ERROR in HIGH prices batch ${i + 1}:`, err.message);
                    throw err;
                }
            }
            const highUpdateTime = ((Date.now() - highUpdateStart) / 1000).toFixed(2);
            rowsUpdated += highRowsUpdated;
            rowsSkipped += highRowsSkipped;
            console.log(`[LATEST] HIGH prices complete: ${highRowsUpdated} updated, ${highRowsSkipped} skipped (dedupe) in ${highUpdateTime}s`);
        }

        // Bulk update LOW prices
        console.log(`[LATEST] Bulk updating LOW prices (${priceInstantsLow.length} items) in batches of ${BATCH_SIZE}...`);
        const lowUpdateStart = Date.now();
        const updatedLowItemIds = new Set();
        let lowRowsUpdated = 0;
        let lowRowsSkipped = 0;
        if (priceInstantsLow.length > 0) {
            const numBatches = Math.ceil(priceInstantsLow.length / BATCH_SIZE);
            for (let i = 0; i < numBatches; i++) {
                const startIdx = i * BATCH_SIZE;
                const endIdx = Math.min(startIdx + BATCH_SIZE, priceInstantsLow.length);
                const batch = priceInstantsLow.slice(startIdx, endIdx);
                
                console.log(`[LATEST] Processing LOW batch ${i + 1}/${numBatches} (${batch.length} items)...`);
                try {
                    const result = await db.query(`
                        WITH updates AS (
                            SELECT * FROM UNNEST($1::int[], $2::bigint[], $3::int[], $4::int[]) 
                            AS t(item_id, price, timestamp, last_updated)
                        )
                        INSERT INTO price_instants (item_id, price, type, timestamp, last_updated)
                        SELECT item_id, price, 'low', timestamp, last_updated FROM updates
                        ON CONFLICT (item_id, type) DO UPDATE SET
                            price = EXCLUDED.price,
                            timestamp = EXCLUDED.timestamp,
                            last_updated = EXCLUDED.last_updated
                        WHERE price_instants.timestamp IS DISTINCT FROM EXCLUDED.timestamp
                           OR price_instants.price IS DISTINCT FROM EXCLUDED.price
                        RETURNING item_id;
                    `, [
                        batch.map(r => r[0]),
                        batch.map(r => r[1]),
                        batch.map(r => r[2]),
                        batch.map(r => r[3])
                    ]);
                    lowRowsUpdated += result.rowCount;
                    lowRowsSkipped += batch.length - result.rowCount;
                    
                    result.rows.forEach(row => updatedLowItemIds.add(row.item_id));
                } catch (err) {
                    console.error(`[LATEST] ERROR in LOW prices batch ${i + 1}:`, err.message);
                    throw err;
                }
            }
            const lowUpdateTime = ((Date.now() - lowUpdateStart) / 1000).toFixed(2);
            rowsUpdated += lowRowsUpdated;
            rowsSkipped += lowRowsSkipped;
            console.log(`[LATEST] LOW prices complete: ${lowRowsUpdated} updated, ${lowRowsSkipped} skipped (dedupe) in ${lowUpdateTime}s`);
        }

        // Mark items as dirty
        const allUpdatedItemIds = Array.from(new Set([...updatedHighItemIds, ...updatedLowItemIds]));
        console.log(`[LATEST] Marking ${allUpdatedItemIds.length} items as dirty...`);

        if (allUpdatedItemIds.length > 0) {
            console.log(`[LATEST] Inserting ${allUpdatedItemIds.length} items into dirty_items...`);
            const dirtyStart = Date.now();
            await db.query(`
                INSERT INTO dirty_items (item_id, touched_at)
                SELECT * FROM UNNEST($1::int[], $2::int[])
                ON CONFLICT (item_id) DO UPDATE SET touched_at = EXCLUDED.touched_at
            `, [
                allUpdatedItemIds,
                new Array(allUpdatedItemIds.length).fill(now)
            ]);
            const dirtyTime = ((Date.now() - dirtyStart) / 1000).toFixed(2);
            console.log(`[LATEST] dirty_items updated in ${dirtyTime}s`);
        }

        // Insert price_instant_log
        console.log(`[LATEST] Inserting ${instantLog.length} entries into price_instant_log...`);
        if (instantLog.length > 0) {
            const logStart = Date.now();
            await db.query(`
                INSERT INTO price_instant_log (item_id, price, type, timestamp, seen_at)
                SELECT * FROM UNNEST($1::int[], $2::bigint[], $3::text[], $4::int[], $5::int[])
                ON CONFLICT DO NOTHING
            `, [
                instantLog.map(r => r[0]),
                instantLog.map(r => r[1]),
                instantLog.map(r => r[2]),
                instantLog.map(r => r[3]),
                instantLog.map(r => r[4])
            ]);
            const logTime = ((Date.now() - logStart) / 1000).toFixed(2);
            console.log(`[LATEST] price_instant_log inserted in ${logTime}s`);
        }

        console.log("[LATEST] Committing transaction...");
        const commitStart = Date.now();
        await db.query("COMMIT");
        const commitTime = ((Date.now() - commitStart) / 1000).toFixed(2);
        console.log(`[LATEST] Transaction committed in ${commitTime}s`);
        
        const { rows: dirtyCount } = await db.query(`
            SELECT COUNT(*)::INT AS count FROM dirty_items
        `);
        console.log(`[DIRTY] ${dirtyCount[0].count} items currently marked dirty`);
        
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const itemCount = Object.keys(data).length;
        const itemsPerSec = (itemCount / parseFloat(elapsedTime)).toFixed(0);
        const modeLabel = MOCK_LATEST ? `[MOCK]` : `[LATEST]`;
        console.log(`\n${modeLabel} ✅ COMPLETED: Processed ${itemCount} items, updated ${rowsUpdated} rows, skipped ${rowsSkipped} (dedupe) @ ${new Date().toISOString()}`);
        console.log(`[PERF] pollLatest: ${itemCount} items in ${elapsedTime}s → ${itemsPerSec}/sec`);
        console.log(`[EVENTS] 💰 Price changes: ${priceChangeEvents}, ⏰ Timestamp-only: ${timestampOnlyEvents}, 🆕 New items: ${newItems}\n`);
    } catch (err) {
        await db.query("ROLLBACK");
        console.error("[LATEST] Error during DB transaction:", err.message);
        throw err;
    }
}

module.exports = { runLatestPollOnce };

