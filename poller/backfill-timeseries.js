require("dotenv").config();
const axios = require("axios");
const db = require("../db/db");
const { isBackfillRunning, createLock, removeLock, setupLockCleanup } = require("./lock-utils");

const HEADERS = {
    "User-Agent": "flipperpro-dev - @montemarto"
};

const CONFIG = {
    "5m": {
        intervalSeconds: 300,
        // Used for 12h and 24h graphs. Longest is 24h, so need 24h + 5m (one extra granularity step)
        retentionHours: 24 + (5 / 60), // 24.083 hours
        endpoint: "5m",
        table: "price_5m"
    },
    "1h": {
        intervalSeconds: 3600,
        // Used for 1w graph. Need 1w + 1h (one extra granularity step)
        retentionHours: (24 * 7) + 1, // 169 hours
        endpoint: "1h",
        table: "price_1h"
    },
    "6h": {
        intervalSeconds: 21600,
        // Used for 1mo graph. Need 1mo + 6h (one extra granularity step)
        retentionHours: (24 * 30) + 6, // 726 hours
        endpoint: "6h",
        table: "price_6h"
    },
    "24h": {
        intervalSeconds: 86400,
        // Used for 3mo and 1y graphs. Longest is 1y, so need 1y + 24h (one extra granularity step)
        retentionHours: (24 * 365) + 24, // 8784 hours
        endpoint: "24h",
        table: "price_24h"
    }
};

const RATE_LIMIT_DELAY = parseInt(process.env.BACKFILL_DELAY_MS || "150", 10);
const BATCH_SIZE = parseInt(process.env.BACKFILL_BATCH_SIZE || "1000", 10);

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getExpectedTimestamps(intervalSeconds, retentionHours) {
    // Always calculate up to current time, regardless of what's in the database
    // This ensures we backfill any missing recent timestamps
    const now = Math.floor(Date.now() / 1000);
    const alignedNow = now - (now % intervalSeconds);
    const end = alignedNow - intervalSeconds;
    
    // The retentionHours includes the extra granularity step, but we want exactly N intervals
    // For 5m: 24.083 hours = 24h + 5m → we want 289 points (24 hours = 288 intervals)
    // For 1h: 169 hours = 168h + 1h → we want 169 points (168 hours = 168 intervals)  
    // For 6h: 726 hours = 720h + 6h → we want 121 points (720 hours = 120 intervals)
    // For 24h: 8784 hours = 8760h + 24h → we want 366 points (8760 hours = 365 intervals)
    // So we subtract the extra step to get base hours
    const extraStepHours = intervalSeconds / 3600; // Convert interval to hours
    const baseHours = retentionHours - extraStepHours;
    const baseRetentionSeconds = baseHours * 3600;
    // Calculate how many intervals this gives us
    const numIntervals = Math.floor(baseRetentionSeconds / intervalSeconds);
    // Start from end, go back by exactly numIntervals
    // Since end is aligned and we're going back by exact intervals, start should also be aligned
    const alignedStart = end - (numIntervals * intervalSeconds);
    
    const timestamps = [];

    for (let t = alignedStart; t <= end; t += intervalSeconds) {
        timestamps.push(t);
    }

    return timestamps;
}

async function getExistingTimestamps(table) {
    const { rows } = await db.query(`SELECT DISTINCT timestamp FROM ${table}`);
    return new Set(rows.map(row => row.timestamp));
}

async function getLatestTimestamp(table) {
    const { rows } = await db.query(`SELECT MAX(timestamp) as latest FROM ${table}`);
    return rows[0]?.latest || null;
}

async function getAllItemIds() {
    const { rows } = await db.query("SELECT id FROM items");
    return rows.map(row => row.id);
}

function renderProgress(current, total) {
    const percent = Math.floor((current / total) * 100);
    const bars = Math.floor(percent / 5);
    const bar = `[${"#".repeat(bars)}${"-".repeat(20 - bars)}]`;
    process.stdout.write(`\r${bar} ${percent}% (${current}/${total})`);
}

async function backfill(timestep = "5m") {
    const cfg = CONFIG[timestep];
    if (!cfg) {
        console.error(`❌ Unsupported timestep: "${timestep}"`);
        // cleanup() will be called by process handlers
        process.exit(1);
    }

    console.log(`\n🚀 [${timestep}] Starting backfill at ${new Date().toISOString()}`);

    // Check if backfill is already running
    if (isBackfillRunning(timestep)) {
        console.log(`⏭️  [${timestep}] Backfill already running, skipping...`);
        // cleanup() will be called by process handlers
        process.exit(0);
    }

    // Create lock and setup cleanup
    createLock(timestep);
    setupLockCleanup(timestep);
    console.log(`🔒 [${timestep}] Lock acquired (delay=${RATE_LIMIT_DELAY}ms, batch=${BATCH_SIZE})`);

    try {
        console.log(`📊 [${timestep}] Analyzing existing data...`);
        // Always calculate expected timestamps up to current time
        // This ensures we backfill any missing recent timestamps
        const expectedApiTimestamps = getExpectedTimestamps(cfg.intervalSeconds, cfg.retentionHours);
        // Convert API timestamps to database timestamps (add intervalSeconds to represent end of window)
        const expectedTimestamps = expectedApiTimestamps.map(ts => ts + cfg.intervalSeconds);
        const existingTimestamps = await getExistingTimestamps(cfg.table);
        const missingTimestamps = expectedTimestamps.filter(ts => !existingTimestamps.has(ts));
        const allItemIds = await getAllItemIds();

        // Get latest timestamp for display
        const latestTimestamp = await getLatestTimestamp(cfg.table);
        const now = Math.floor(Date.now() / 1000);
        
        console.log(`\n📊 [${timestep}] Backfill Plan:`);
        console.log(`   - Expected timestamps: ${expectedTimestamps.length}`);
        console.log(`   - Existing timestamps: ${existingTimestamps.size}`);
        console.log(`   - Missing timestamps: ${missingTimestamps.length}`);
        if (latestTimestamp) {
            const hoursAgo = ((now - latestTimestamp) / 3600).toFixed(1);
            console.log(`   - Latest in DB: ${new Date(latestTimestamp * 1000).toISOString()} (${hoursAgo}h ago)`);
        }
        if (missingTimestamps.length > 0 && missingTimestamps.length <= 10) {
            console.log(`   - Missing: ${missingTimestamps.map(ts => new Date(ts * 1000).toISOString()).join(', ')}`);
        }
        console.log(`   - Items per timestamp: ${allItemIds.length}`);
        console.log(`   - Total inserts (attempted): ~${missingTimestamps.length * allItemIds.length}`);
        console.log(`   - Estimated time: ~${Math.ceil((missingTimestamps.length * RATE_LIMIT_DELAY) / 60000)} minutes\n`);

        if (missingTimestamps.length === 0) {
            console.log(`✅ [${timestep}] Already complete!\n`);
            return;
        }

        console.log(`⏳ [${timestep}] Starting backfill using /${timestep}?timestamp=... for ${allItemIds.length} items\n`);

        let completed = 0;
        let insertedTotal = 0;
        const startTime = Date.now();

        for (const dbTs of missingTimestamps) {
            // Convert database timestamp back to API timestamp (subtract intervalSeconds)
            const apiTs = dbTs - cfg.intervalSeconds;
            const url = `https://prices.runescape.wiki/api/v1/osrs/${cfg.endpoint}?timestamp=${apiTs}`;
            let apiData = {};

            if (completed % 10 === 0 || completed === 0) {
                const elapsedSeconds = (Date.now() - startTime) / 1000;
                const ratePerMin = completed > 0 ? (completed / elapsedSeconds) * 60 : 0;
                const remaining = missingTimestamps.length - completed;
                const etaMinutes = ratePerMin > 0 ? Math.ceil(remaining / ratePerMin) : "∞";
                console.log(`\n📡 [${timestep}] Progress ${completed}/${missingTimestamps.length} (rate=${ratePerMin.toFixed(1)} ts/min, ETA≈${etaMinutes}m)`);
            }

            try {
                const { data } = await axios.get(url, { headers: HEADERS });
                apiData = data.data || {};
            } catch (err) {
                console.warn(`❌ Failed for timestamp ${apiTs} (db: ${dbTs}): ${err.message}`);
                continue;
            }

            try {
                await db.query("BEGIN");

                // Use the database timestamp (already adjusted to represent end of window)
                const adjustedTs = dbTs;

                for (let i = 0; i < allItemIds.length; i += BATCH_SIZE) {
                    const batch = allItemIds.slice(i, i + BATCH_SIZE);
                    if (batch.length === 0) {
                        continue;
                    }

                    const values = [];
                    const params = [];
                    let paramIndex = 1;

                    for (const itemId of batch) {
                        const itemData = apiData[itemId] || {};

                        const avgHigh = itemData.avgHighPrice ?? null;
                        const avgLow = itemData.avgLowPrice ?? null;
                        const highVol = itemData.highPriceVolume ?? 0;
                        const lowVol = itemData.lowPriceVolume ?? 0;

                        values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`);
                        params.push(itemId, adjustedTs, avgHigh, avgLow, highVol, lowVol);
                        paramIndex += 6;
                        insertedTotal++;
                    }

                    await db.query(
                        `INSERT INTO ${cfg.table} (item_id, timestamp, avg_high, avg_low, high_volume, low_volume)
                         VALUES ${values.join(", ")}
                         ON CONFLICT (item_id, timestamp) DO NOTHING`,
                        params
                    );
                }

                await db.query("COMMIT");
            } catch (err) {
                await db.query("ROLLBACK").catch(() => { });
                console.error(`❌ DB error on timestamp ${dbTs}: ${err.message}`);
            }

            completed++;
            renderProgress(completed, missingTimestamps.length);
            await delay(RATE_LIMIT_DELAY);
        }

        const totalTimeSeconds = (Date.now() - startTime) / 1000;
        console.log(`\n✅ [${timestep}] Done. Inserted ${insertedTotal} total datapoints into ${cfg.table}. Took ${totalTimeSeconds.toFixed(1)}s (${(completed / (totalTimeSeconds / 60 || 1)).toFixed(1)} ts/min)\n`);
    } finally {
        // Always remove lock when done (even on error)
        removeLock(timestep);
        console.log(`🔓 [${timestep}] Lock released\n`);
    }
}

// Setup cleanup handlers to always close connections
const cleanup = async () => {
    try {
        // Add timeout to prevent hanging on db.end()
        const timeout = setTimeout(() => {
            console.error("[BACKFILL] Cleanup timeout - forcing exit");
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
    console.error("[BACKFILL] Uncaught exception:", err.message);
    await cleanup();
    process.exit(1);
});

process.on("unhandledRejection", async (err) => {
    console.error("[BACKFILL] Unhandled rejection:", err);
    await cleanup();
    process.exit(1);
});

// CLI support
(async () => {
    const timestep = process.argv[2] || "5m";
    try {
        await backfill(timestep);
        console.log(`[${timestep}] Closing database connections...`);
        
        // Cleanup with timeout
        const cleanupTimeout = setTimeout(() => {
            console.warn(`[${timestep}] Cleanup taking too long - forcing exit`);
            process.exit(0);
        }, 5000);
        
        await cleanup();
        clearTimeout(cleanupTimeout);
        
        console.log(`[${timestep}] Exiting successfully`);
        process.exit(0);
    } catch (err) {
        console.error(`[${timestep}] Error:`, err.message);
        
        // Cleanup with timeout even on error
        const cleanupTimeout = setTimeout(() => {
            console.warn(`[${timestep}] Cleanup taking too long - forcing exit`);
            process.exit(1);
        }, 5000);
        
        await cleanup();
        clearTimeout(cleanupTimeout);
        
        process.exit(1);
    }
})();
