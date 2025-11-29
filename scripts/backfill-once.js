const axios = require("axios");
const Database = require("better-sqlite3");
const db = new Database("flipperpro.db");

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

const RATE_LIMIT_DELAY = 500;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getExpectedTimestamps(intervalSeconds, retentionHours) {
    const now = Math.floor(Date.now() / 1000);
    const delayMargin = 60;
    // Align now to the interval boundary
    const alignedNow = now - (now % intervalSeconds);
    // Most recent complete interval is one interval before alignedNow
    // We don't need delayMargin here since we're already one interval back
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
    const startCandidate = end - (numIntervals * intervalSeconds);
    // Align start UP (towards end) to the next interval boundary
    const remainder = startCandidate % intervalSeconds;
    const alignedStart = remainder === 0 ? startCandidate : startCandidate + (intervalSeconds - remainder);
    
    const timestamps = [];

    for (let t = alignedStart; t <= end; t += intervalSeconds) {
        timestamps.push(t);
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
