const axios = require("axios");
const Database = require("better-sqlite3");
const db = new Database("flipperpro.db");

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

const RATE_LIMIT_DELAY = 500;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getExpectedTimestamps(intervalSeconds, retentionHours) {
    const now = Math.floor(Date.now() / 1000);
    const delayMargin = 60;
    const alignedNow = now - (now % intervalSeconds);
    const end = alignedNow - delayMargin;
    const start = now - retentionHours * 3600;
    const timestamps = [];

    for (let t = start; t <= end; t += intervalSeconds) {
        timestamps.push(t - (t % intervalSeconds));
    }

    return timestamps;
}

function getExistingTimestamps(table) {
    const stmt = db.prepare(`SELECT DISTINCT timestamp FROM ${table}`);
    return new Set(stmt.all().map(row => row.timestamp));
}

function getAllItemIds() {
    const stmt = db.prepare("SELECT id FROM items");
    return stmt.all().map((row) => row.id);
}

function renderProgress(current, total) {
    const percent = Math.floor((current / total) * 100);
    const bars = Math.floor(percent / 5);
    const bar = `[${"#".repeat(bars)}${"-".repeat(20 - bars)}]`;
    process.stdout.write(`\r${bar} ${percent}% (${current}/${total})`);
}

async function backfillGranularity(timestep) {
    const cfg = CONFIG[timestep];
    const expectedTimestamps = getExpectedTimestamps(cfg.intervalSeconds, cfg.retentionHours);
    const existingTimestamps = getExistingTimestamps(cfg.table);
    const missingTimestamps = expectedTimestamps.filter(ts => !existingTimestamps.has(ts));
    const allItemIds = getAllItemIds();

    console.log(`\n📊 [${timestep}] ${missingTimestamps.length} missing timestamps for ${allItemIds.length} items.`);

    const insert = db.prepare(`
        INSERT OR IGNORE INTO ${cfg.table} (item_id, timestamp, avg_high, avg_low, volume)
        VALUES (?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((itemIds, ts, apiData) => {
        for (const itemId of itemIds) {
            const itemData = apiData[itemId] || {};
            insert.run(
                itemId,
                ts,
                itemData.avgHigh ?? null,
                itemData.avgLow ?? null,
                itemData.volume ?? null
            );
        }
    });

    let completed = 0;

    for (const ts of missingTimestamps) {
        const url = `https://prices.runescape.wiki/api/v1/osrs/${cfg.endpoint}?timestamp=${ts}`;
        let apiData = {};
        try {
            const { data } = await axios.get(url, { headers: HEADERS });
            apiData = data.data || {};
        } catch (err) {
            console.warn(`❌ [${timestep}] Failed at ${ts}: ${err.message}`);
        }

        insertMany(allItemIds, ts, apiData);
        renderProgress(++completed, missingTimestamps.length);
        await delay(RATE_LIMIT_DELAY);
    }

    console.log(`\n✅ [${timestep}] Backfill complete. Inserted ${completed * allItemIds.length} rows.`);
}

async function runAll() {
    for (const granularity of ["5m", "1h", "6h", "24h"]) {
        await backfillGranularity(granularity);
    }
    db.close();
    console.log("\n🏁 All backfills completed.\n");
}

runAll();
