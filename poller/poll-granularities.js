require("../load-env");
const axios = require("axios");
const db = require("../db/db");
const { isBackfillRunning } = require("./lock-utils");

const config = {
    "5m": { url: "https://prices.runescape.wiki/api/v1/osrs/5m", table: "price_5m" },
    "1h": { url: "https://prices.runescape.wiki/api/v1/osrs/1h", table: "price_1h" },
    "6h": { url: "https://prices.runescape.wiki/api/v1/osrs/6h", table: "price_6h" },
    "24h": { url: "https://prices.runescape.wiki/api/v1/osrs/24h", table: "price_24h" }
};

const headers = {
    "User-Agent": "flipperpro-dev - @montemarto on Discord"
};

async function getAllItemIds() {
    const { rows } = await db.query("SELECT id FROM items");
    return rows.map(r => r.id);
}

// Export pollGranularity function so orchestrator can use it
async function pollGranularity(gran) {
    // Check if backfill is running for this granularity
    if (isBackfillRunning(gran)) {
        console.log(`⏭️  [${gran}] Backfill in progress, skipping poll to avoid conflicts`);
        return;
    }

    const { url, table } = config[gran];
    const itemIds = await getAllItemIds();

    let apiTimestamp = null;
    try {
        const { data } = await axios.get(url, { headers });
        apiTimestamp = data.timestamp;
        
        // Add intervalSeconds to timestamp to represent end of window (not start)
        // 5m: +300, 1h: +3600, 6h: +21600, 24h: +86400
        const intervalSeconds = gran === "5m" ? 300 : gran === "1h" ? 3600 : gran === "6h" ? 21600 : 86400;
        const ts = data.timestamp + intervalSeconds;
        
        // Check if data.data is empty (API data not ready yet) - ONLY retry if completely empty
        if (!data.data || Object.keys(data.data).length === 0) {
            console.log(`⚠️ [${gran}] API returned empty data object {} for timestamp ${data.timestamp} - will retry`);
            throw new Error(`API returned empty data for timestamp ${data.timestamp} - will retry`);
        }

        const payload = data.data;

        // If data.data has items, it means data is ready - we will insert ALL items
        // Items in payload get their values, items not in payload get null (marked as checked)

        // Check if we already have this exact timestamp complete (all items inserted)
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
            console.log(`✅ [${gran}] ${ts} already complete (${totalRows}/${itemIds.length} items, ${rowsWithData} with data)`);
            return;
        }
        
        // If we have all items but all are NULL, we should still try to update
        if (totalRows >= itemIds.length && rowsWithData === 0) {
            console.log(`⚠️ [${gran}] ${ts} has all items but all are NULL - will try to update with actual data`);
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

        // Bulk insert using UNNEST for better performance and lower memory usage
        const BATCH_SIZE = 1000; // Process in batches to avoid memory issues
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
        console.log(`✅ [${gran}] Successfully inserted/updated ${bulkData.length} items for ts=${ts}`);
    } catch (err) {
        await db.query("ROLLBACK").catch(() => {}); // Ignore rollback errors
        
        // If wrong timestamp returned, 404, or empty data, throw error so orchestrator can retry
        if (err.response?.status === 404 || err.message?.includes('will retry') || err.message?.includes('empty data')) {
            console.log(`⏳ [${gran}] Timestamp ${apiTimestamp || 'unknown'} not available yet or empty data - will retry`);
            throw err;
        }
        
        console.error(`❌ [${gran}] poll error:`, err.stack || err);
        throw err;
    }
}

// Setup cleanup handlers to always close connections
const cleanup = async () => {
    try {
        // Add a timeout for db.end() to prevent hanging
        await Promise.race([
            db.end(),
            new Promise((resolve) => setTimeout(() => {
                console.warn("[GRANULARITIES] db.end() timed out, forcing exit.");
                resolve();
            }, 5000)) // 5 seconds timeout
        ]);
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
    console.error("[GRANULARITY] Uncaught exception:", err.message);
    await cleanup();
    process.exit(1);
});

process.on("unhandledRejection", async (err) => {
    console.error("[GRANULARITY] Unhandled rejection:", err);
    await cleanup();
    process.exit(1);
});

// Only run standalone execution if script is run directly (not as module)
if (require.main === module) {
    // Run with: node poll-granularities.js 5m
    const interval = process.argv[2] || "5m";
    if (!config[interval]) {
        console.error(`Unknown granularity "${interval}". Choose from: 5m, 1h, 6h, 24h.`);
        cleanup().finally(() => process.exit(1));
    } else {
        (async () => {
            try {
                await pollGranularity(interval);
                console.log(`[${interval}] Closing database connections...`);
                await cleanup();
                process.exit(0);
            } catch (err) {
                console.error(`[${interval}] Error:`, err.message);
                await cleanup();
                process.exit(1);
            }
        })();
    }
}

// Export for use in orchestrator
module.exports = { pollGranularity };
