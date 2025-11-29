require("dotenv").config();
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

async function pollGranularity(gran) {
    // Check if backfill is running for this granularity
    if (isBackfillRunning(gran)) {
        console.log(`⏭️  [${gran}] Backfill in progress, skipping poll to avoid conflicts`);
        return;
    }

    const { url, table } = config[gran];
    const itemIds = await getAllItemIds();

    try {
        const { data } = await axios.get(url, { headers });
        // Add intervalSeconds to timestamp to represent end of window (not start)
        // 5m: +300, 1h: +3600, 6h: +21600, 24h: +86400
        const intervalSeconds = gran === "5m" ? 300 : gran === "1h" ? 3600 : gran === "6h" ? 21600 : 86400;
        const ts = data.timestamp + intervalSeconds;
        const payload = data.data || {};

        // Skip if already full
        const { rows } = await db.query(
            `SELECT COUNT(*) AS c FROM ${table} WHERE timestamp = $1`,
            [ts]
        );
        if (+rows[0].c >= itemIds.length) {
            console.log(`⏩ [${gran}] ${ts} already inserted (${rows[0].c}/${itemIds.length})`);
            return;
        }

        await db.query("BEGIN");

        // Prepare bulk data arrays for efficient bulk insert
        const bulkData = [];
        for (const id of itemIds) {
            const d = payload[id] || {};
            bulkData.push({
                item_id: id,
                timestamp: ts,
                avg_high: d.avgHighPrice ?? null,
                avg_low: d.avgLowPrice ?? null,
                low_volume: d.lowPriceVolume ?? 0,
                high_volume: d.highPriceVolume ?? 0
            });
        }

        // Bulk insert using UNNEST for better performance and lower memory usage
        if (bulkData.length > 0) {
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
                     ON CONFLICT (item_id, timestamp) DO NOTHING`,
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
        }

        await db.query("COMMIT");
        console.log(`✅ [${gran}] inserted ${itemIds.length} rows for ts=${ts}`);
    } catch (err) {
        await db.query("ROLLBACK");
        console.error(`❌ [${gran}] poll error:`, err.stack || err);
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
