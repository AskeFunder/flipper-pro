// Environment variables are loaded by load-env.js before this module is required
const axios = require("axios");
const db = require("../db/db");
const { isBackfillRunning } = require("./lock-utils");

const config = {
    "5m": { url: "https://prices.runescape.wiki/api/v1/osrs/5m", table: "price_5m" }
};

const headers = {
    "User-Agent": "flipperpro-dev - @montemarto on Discord"
};

/**
 * Get all item IDs from database
 */
async function getAllItemIds() {
    const { rows } = await db.query("SELECT id FROM items");
    return rows.map(r => r.id);
}

/**
 * Run 5-minute aggregation poll once - NO scheduling logic, just execution
 * @param {number} targetApiTimestamp - The specific API timestamp to fetch (optional, if not provided, calculates from current time)
 * @returns {Promise<void>}
 */
async function run5mPollOnce(targetApiTimestamp = null) {
    const gran = "5m";
    
    // Check if backfill is running
    if (isBackfillRunning(gran)) {
        console.log(`⏭️  [${gran}] Backfill in progress, skipping poll to avoid conflicts`);
        return;
    }

    const { url, table } = config[gran];
    const itemIds = await getAllItemIds();
    const intervalSeconds = 300; // 5 minutes = 300 seconds

    // Calculate target API timestamp - either provided or based on current time
    let targetApiTs;
    if (targetApiTimestamp !== null) {
        targetApiTs = targetApiTimestamp;
    } else {
        // Calculate based on current time (fallback)
        const now = Math.floor(Date.now() / 1000);
        const alignedNow = now - (now % intervalSeconds);
        targetApiTs = alignedNow - intervalSeconds;
    }
    
    const targetDbTs = targetApiTs + intervalSeconds;
    const targetApiDateStr = new Date(targetApiTs * 1000).toISOString();
    const targetDbDateStr = new Date(targetDbTs * 1000).toISOString();
    
    console.log(`🔍 [${gran}] Attempting to fetch timestamp ${targetApiTs} (${targetApiDateStr}) → DB: ${targetDbTs} (${targetDbDateStr})`);

        // Check if we already have this exact timestamp complete (all items inserted)
        // Only consider it complete if we have all items AND at least some have actual data
        const { rows: checkRows } = await db.query(
            `SELECT 
                COUNT(*) AS total,
                COUNT(CASE WHEN avg_high IS NOT NULL OR avg_low IS NOT NULL THEN 1 END) AS with_data
            FROM ${table} WHERE timestamp = $1`,
            [targetDbTs]
        );
        
        const totalRows = +checkRows[0].total;
        const rowsWithData = +checkRows[0].with_data;
        
        // If we have all items AND at least some have data, timestamp is complete
        // If all are NULL, we should still try to update (maybe API has data now)
        if (totalRows >= itemIds.length && rowsWithData > 0) {
            console.log(`✅ [${gran}] ${targetDbTs} (${targetDbDateStr}) already complete (${totalRows}/${itemIds.length} items, ${rowsWithData} with data)`);
            return;
        }
        
        // If we have all items but all are NULL, we should still try to update
        if (totalRows >= itemIds.length && rowsWithData === 0) {
            console.log(`⚠️ [${gran}] ${targetDbTs} (${targetDbDateStr}) has all items but all are NULL - will try to update with actual data`);
        }

    try {
        // Fetch the specific timestamp we need
        const apiUrl = `${url}?timestamp=${targetApiTs}`;
        console.log(`📡 [${gran}] Fetching from API: ${apiUrl}`);
        const { data } = await axios.get(apiUrl, { headers });
        
        const receivedDateStr = new Date(data.timestamp * 1000).toISOString();
        console.log(`📥 [${gran}] API returned timestamp ${data.timestamp} (${receivedDateStr})`);
        
        // CRITICAL: Verify the API returned data for the EXACT timestamp we requested
        if (data.timestamp !== targetApiTs) {
            console.log(`❌ [${gran}] Mismatch! Expected ${targetApiTs} (${targetApiDateStr}), got ${data.timestamp} (${receivedDateStr})`);
            throw new Error(`API returned timestamp ${data.timestamp} (${receivedDateStr}), expected ${targetApiTs} (${targetApiDateStr}) - will retry`);
        }
        
        console.log(`✅ [${gran}] Timestamp match! Processing data...`);
        
        // Add intervalSeconds to timestamp to represent end of window
        const ts = data.timestamp + intervalSeconds;

        // Check if data.data is empty (API data not ready yet) - ONLY retry if completely empty
        if (!data.data || Object.keys(data.data).length === 0) {
            console.log(`⚠️ [${gran}] API returned empty data object {} for timestamp ${targetApiTs} (${targetDateStr}) - will retry`);
            throw new Error(`API returned empty data for timestamp ${targetApiTs} - will retry`);
        }

        const payload = data.data;

        // If data.data has items, it means data is ready - we will insert ALL items
        // Items in payload get their values, items not in payload get null (marked as checked)

        // Double-check if already complete (all items inserted - might have been inserted by another process)
        // Only consider it complete if we have all items AND at least some have actual data
        const { rows } = await db.query(
            `SELECT 
                COUNT(*) AS total,
                COUNT(CASE WHEN avg_high IS NOT NULL OR avg_low IS NOT NULL THEN 1 END) AS with_data
            FROM ${table} WHERE timestamp = $1`,
            [ts]
        );
        const totalRows = +rows[0].total;
        const rowsWithData = +rows[0].with_data;
        
        // If we have all items AND at least some have data, timestamp is complete
        // If all are NULL, we should still try to update (maybe API has data now)
        if (totalRows >= itemIds.length && rowsWithData > 0) {
            const dateStr = new Date(ts * 1000).toISOString();
            console.log(`⏩ [${gran}] ${ts} (${dateStr}) already complete (${totalRows}/${itemIds.length} items, ${rowsWithData} with data)`);
            return;
        }
        
        // If we have all items but all are NULL, we should still try to update
        if (totalRows >= itemIds.length && rowsWithData === 0) {
            const dateStr = new Date(ts * 1000).toISOString();
            console.log(`⚠️ [${gran}] ${ts} (${dateStr}) has all items but all are NULL - will try to update with actual data`);
        }

        await db.query("BEGIN");

        // Prepare bulk data arrays - include ALL items
        // Items in payload get their values, items not in payload get null (marked as checked)
        const bulkData = [];
        for (const id of itemIds) {
            const d = payload[id];
            // If item is in payload, use its values (even if some are null)
            // If item is NOT in payload, insert with null values (marked as checked)
            bulkData.push({
                item_id: id,
                timestamp: ts,
                avg_high: d?.avgHighPrice ?? null,
                avg_low: d?.avgLowPrice ?? null,
                low_volume: d?.lowPriceVolume ?? 0,
                high_volume: d?.highPriceVolume ?? 0
            });
        }

        // Bulk insert using UNNEST
        const BATCH_SIZE = 1000;
        const numBatches = Math.ceil(bulkData.length / BATCH_SIZE);
        
        for (let i = 0; i < numBatches; i++) {
            const startIdx = i * BATCH_SIZE;
            const endIdx = Math.min(startIdx + BATCH_SIZE, bulkData.length);
            const batch = bulkData.slice(startIdx, endIdx);
            
                await db.query(
                    `INSERT INTO ${table}
                     (item_id, timestamp, avg_high, avg_low, low_volume, high_volume)
                     SELECT * FROM UNNEST($1::int[], $2::int[], $3::bigint[], $4::bigint[], $5::bigint[], $6::bigint[])
                     ON CONFLICT (item_id, timestamp) DO UPDATE SET
                         avg_high = EXCLUDED.avg_high,
                         avg_low = EXCLUDED.avg_low,
                         low_volume = EXCLUDED.low_volume,
                         high_volume = EXCLUDED.high_volume
                     WHERE ${table}.avg_high IS NULL AND ${table}.avg_low IS NULL
                        OR ${table}.avg_high IS DISTINCT FROM EXCLUDED.avg_high
                        OR ${table}.avg_low IS DISTINCT FROM EXCLUDED.avg_low`,
                    [
                        batch.map(r => r.item_id),
                        batch.map(r => r.timestamp),
                        batch.map(r => r.avg_high),
                        batch.map(r => r.avg_low),
                        batch.map(r => r.low_volume),
                        batch.map(r => r.high_volume)
                    ]
                );
        }

        await db.query("COMMIT");
        console.log(`✅ [${gran}] Successfully inserted/updated ${bulkData.length} items for ts=${ts} (${targetDbDateStr})`);
    } catch (err) {
        await db.query("ROLLBACK").catch(() => {}); // Ignore rollback errors
        const dateStr = new Date(targetDbTs * 1000).toISOString();
        
        // If wrong timestamp returned, 404, or empty data, throw error so orchestrator can retry
        if (err.response?.status === 404 || err.message?.includes('will retry') || err.message?.includes('empty data') || err.message?.includes('No items with data')) {
            console.log(`⏳ [${gran}] Timestamp ${targetDbTs} (${dateStr}) not available yet or empty data - will retry`);
            throw err;
        }
        
        console.error(`❌ [${gran}] poll error:`, err.stack || err);
        throw err;
    }
}

module.exports = { run5mPollOnce };

