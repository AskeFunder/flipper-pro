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
        retentionHours: 24,
        endpoint: "5m",
        table: "price_5m"
    },
    "1h": {
        intervalSeconds: 3600,
        retentionHours: 24 * 7 + 1, // 7 days + 1 hour to ensure we have the first datapoint in the 7-day window
        endpoint: "1h",
        table: "price_1h"
    },
    "6h": {
        intervalSeconds: 21600,
        retentionHours: 24 * 30 + 6, // 30 days + 6 hours to ensure we have the first datapoint in the 30-day window
        endpoint: "6h",
        table: "price_6h"
    },
    "24h": {
        intervalSeconds: 86400,
        retentionHours: 24 * 365 + 24, // 365 days + 1 day to ensure we have the first datapoint in the 365-day window
        endpoint: "24h",
        table: "price_24h"
    }
};

const RATE_LIMIT_DELAY = 250;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getExpectedTimestamps(intervalSeconds, retentionHours) {
    const now = Math.floor(Date.now() / 1000);
    const delayMargin = 60;
    const alignedNow = now - (now % intervalSeconds);
    const end = alignedNow - delayMargin;
    const start = end - (retentionHours * 3600);
    const alignedStart = start - (start % intervalSeconds);
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
        process.exit(1);
    }

    // Check if backfill is already running
    if (isBackfillRunning(timestep)) {
        console.log(`⏭️  [${timestep}] Backfill already running, skipping...`);
        process.exit(0);
    }

    // Create lock and setup cleanup
    createLock(timestep);
    setupLockCleanup(timestep);

    try {
        const expectedTimestamps = getExpectedTimestamps(cfg.intervalSeconds, cfg.retentionHours);
        const existingTimestamps = await getExistingTimestamps(cfg.table);
        const missingTimestamps = expectedTimestamps.filter(ts => !existingTimestamps.has(ts));
        const allItemIds = await getAllItemIds();

        console.log(`\n📊 [${timestep}] Missing timestamps: ${missingTimestamps.length}`);
        console.log(`⏳ Starting backfill using /${timestep}?timestamp=... for ${allItemIds.length} items\n`);

        let completed = 0;
        let insertedTotal = 0;

        for (const ts of missingTimestamps) {
            const url = `https://prices.runescape.wiki/api/v1/osrs/${cfg.endpoint}?timestamp=${ts}`;
            let apiData = {};

            try {
                const { data } = await axios.get(url, { headers: HEADERS });
                apiData = data.data || {};
            } catch (err) {
                console.warn(`❌ Failed for timestamp ${ts}: ${err.message}`);
                continue;
            }

            try {
                await db.query("BEGIN");

                // For 5m granularity, add 5 minutes (300 seconds) to timestamp to represent end of window
                const adjustedTs = timestep === "5m" ? ts + 300 : ts;

                for (const itemId of allItemIds) {
                    const itemData = apiData[itemId] || {};

                    const avgHigh = itemData.avgHighPrice ?? null;
                    const avgLow = itemData.avgLowPrice ?? null;
                    const highVol = itemData.highPriceVolume ?? 0;
                    const lowVol = itemData.lowPriceVolume ?? 0;

                    await db.query(
                        `INSERT INTO ${cfg.table} (item_id, timestamp, avg_high, avg_low, high_volume, low_volume)
                         VALUES ($1, $2, $3, $4, $5, $6)
                         ON CONFLICT (item_id, timestamp) DO NOTHING`,
                        [itemId, adjustedTs, avgHigh, avgLow, highVol, lowVol]
                    );
                    insertedTotal++;
                }

                await db.query("COMMIT");
            } catch (err) {
                await db.query("ROLLBACK").catch(() => { });
                console.error(`❌ DB error on timestamp ${ts}: ${err.message}`);
            }

            completed++;
            renderProgress(completed, missingTimestamps.length);
            await delay(RATE_LIMIT_DELAY);
        }

        console.log(`\n✅ Done. Inserted ${insertedTotal} total datapoints into ${cfg.table}.\n`);
    } finally {
        // Always remove lock when done (even on error)
        removeLock(timestep);
    }
}

// CLI support
backfill(process.argv[2] || "5m");
