require("dotenv").config();
const fetch = require("node-fetch");
const db = require("../db/db"); // Adjust if needed

const MOCK_CHANGE_RATE = parseFloat(process.env.MOCK_CHANGE_RATE || "0.05"); // Default 5%
const MOCK_LATEST = process.env.MOCK_LATEST === "true";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "500"); // Batch size for bulk inserts

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
    
    console.log("[LATEST] Starting poll-latest...");
    
    let data, now;
    
    if (MOCK_LATEST) {
        console.log("[LATEST] Using MOCK mode - generating mock data...");
        // Generate mock data instead of fetching from API
        const mockResult = await generateMockData();
        data = mockResult.data;
        now = mockResult.now;
        console.log(`[LATEST] Mock data generated: ${Object.keys(data).length} items`);
    } else {
        console.log("[LATEST] Fetching data from OSRS API...");
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
        console.log(`[LATEST] API fetch complete: ${Object.keys(data).length} items received`);
    }

    try {
        console.log("[LATEST] Starting database transaction...");
        await db.query("BEGIN");

        // Prepare bulk data arrays
        console.log("[LATEST] Preparing bulk data arrays...");
        const priceInstantsHigh = [];
        const priceInstantsLow = [];
        const instantLog = [];
        
        let rowsUpdated = 0;
        let rowsSkipped = 0;

        // Collect all data first
        const totalItems = Object.keys(data).length;
        let processedItems = 0;
        const logInterval = Math.max(1, Math.floor(totalItems / 10)); // Log every 10%
        
        for (const [itemIdStr, entry] of Object.entries(data)) {
            const itemId = parseInt(itemIdStr, 10);

            if (entry.high !== null && entry.highTime !== null) {
                priceInstantsHigh.push([itemId, entry.high, entry.highTime, now]);
                instantLog.push([itemId, entry.high, 'high', entry.highTime, now]);
            }

            if (entry.low !== null && entry.lowTime !== null) {
                priceInstantsLow.push([itemId, entry.low, entry.lowTime, now]);
                instantLog.push([itemId, entry.low, 'low', entry.lowTime, now]);
            }
            
            processedItems++;
            if (processedItems % logInterval === 0) {
                const percent = Math.floor((processedItems / totalItems) * 100);
                process.stdout.write(`\r[LATEST] Processing items: ${processedItems}/${totalItems} (${percent}%)`);
            }
        }
        process.stdout.write('\n'); // New line after progress
        console.log(`[LATEST] Data preparation complete: ${priceInstantsHigh.length} high prices, ${priceInstantsLow.length} low prices`);

        // Bulk update price_instants for HIGH prices using unnest (in batches)
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
                        RETURNING item_id;
                    `, [
                        batch.map(r => r[0]),
                        batch.map(r => r[1]),
                        batch.map(r => r[2]),
                        batch.map(r => r[3])
                    ]);
                    highRowsUpdated += result.rowCount;
                    highRowsSkipped += batch.length - result.rowCount;
                    
                    // Collect updated item IDs for dirty_items
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

        // Bulk update price_instants for LOW prices using unnest (in batches)
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
                        RETURNING item_id;
                    `, [
                        batch.map(r => r[0]),
                        batch.map(r => r[1]),
                        batch.map(r => r[2]),
                        batch.map(r => r[3])
                    ]);
                    lowRowsUpdated += result.rowCount;
                    lowRowsSkipped += batch.length - result.rowCount;
                    
                    // Collect updated item IDs for dirty_items
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

        // Combine all updated item IDs (high and low)
        const allUpdatedItemIds = Array.from(new Set([...updatedHighItemIds, ...updatedLowItemIds]));
        console.log(`[LATEST] Marking ${allUpdatedItemIds.length} items as dirty...`);

        // Bulk insert dirty_items for all updated items
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

        // Bulk insert price_instant_log
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
        
        // Get dirty items count for visibility
        const { rows: dirtyCount } = await db.query(`
            SELECT COUNT(*)::INT AS count FROM dirty_items
        `);
        console.log(`[DIRTY] ${dirtyCount[0].count} items currently marked dirty`);
        
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const itemCount = Object.keys(data).length;
        const itemsPerSec = (itemCount / parseFloat(elapsedTime)).toFixed(0);
        const modeLabel = MOCK_LATEST ? `[MOCK]` : `[LATEST]`;
        console.log(`\n${modeLabel} ✅ COMPLETED: Processed ${itemCount} items, updated ${rowsUpdated} rows, skipped ${rowsSkipped} (dedupe) @ ${new Date().toISOString()}`);
        console.log(`[PERF] pollLatest: ${itemCount} items in ${elapsedTime}s → ${itemsPerSec}/sec\n`);
    } catch (err) {
        await db.query("ROLLBACK");
        console.error("[LATEST] Error during DB transaction:", err.message);
    }
}

// Setup cleanup handlers to always close connections
const cleanup = async () => {
    try {
        // Add timeout to prevent hanging on db.end()
        const timeout = setTimeout(() => {
            console.error("[LATEST] Cleanup timeout - forcing exit");
            process.exit(0);
        }, 5000); // 5 second timeout
        
        await db.end();
        clearTimeout(timeout);
    } catch (err) {
        // Ignore errors during cleanup
    }
};

process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
});

process.on("uncaughtException", async (err) => {
    console.error("[LATEST] Uncaught exception:", err.message);
    await cleanup();
    process.exit(1);
});

process.on("unhandledRejection", async (err) => {
    console.error("[LATEST] Unhandled rejection:", err);
    await cleanup();
    process.exit(1);
});

(async () => {
    try {
        await pollLatest();
        console.log("[LATEST] Closing database connections...");
        
        // Cleanup with timeout
        const cleanupTimeout = setTimeout(() => {
            console.warn("[LATEST] Cleanup taking too long - forcing exit");
            process.exit(0);
        }, 5000);
        
        await cleanup();
        clearTimeout(cleanupTimeout);
        
        console.log("[LATEST] Exiting successfully...");
        process.exit(0);
    } catch (err) {
        console.error("[LATEST] Error polling:", err.message);
        
        // Cleanup with timeout even on error
        const cleanupTimeout = setTimeout(() => {
            console.warn("[LATEST] Cleanup taking too long - forcing exit");
            process.exit(1);
        }, 5000);
        
        await cleanup();
        clearTimeout(cleanupTimeout);
        
        process.exit(1);
    }
})();
