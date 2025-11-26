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
        // Add offset to timestamp to represent end of window instead of start
        // 5m: add 5 minutes (300 seconds), 1h: add 1 hour (3600 seconds), 6h: add 6 hours (21600 seconds), 24h: add 24 hours (86400 seconds)
        let ts = data.timestamp;
        if (gran === "5m") {
            ts += 300; // 5 minutes
        } else if (gran === "1h") {
            ts += 3600; // 1 hour
        } else if (gran === "6h") {
            ts += 21600; // 6 hours
        } else if (gran === "24h") {
            ts += 86400; // 24 hours
        }
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

        for (const id of itemIds) {
            const d = payload[id] || {};

            const avgHigh = d.avgHighPrice ?? null;
            const avgLow = d.avgLowPrice ?? null;
            const lowVol = d.lowPriceVolume ?? 0;
            const highVol = d.highPriceVolume ?? 0;

            await db.query(
                `INSERT INTO ${table}
                 (item_id, timestamp, avg_high, avg_low, low_volume, high_volume)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (item_id, timestamp) DO NOTHING`,
                [id, ts, avgHigh, avgLow, lowVol, highVol]
            );
        }

        await db.query("COMMIT");
        console.log(`✅ [${gran}] inserted ${itemIds.length} rows for ts=${ts}`);
    } catch (err) {
        await db.query("ROLLBACK");
        console.error(`❌ [${gran}] poll error:`, err.stack || err);
    }
}

// Run with: node poll-granularities.js 5m
const interval = process.argv[2] || "5m";
if (!config[interval]) {
    console.error(`Unknown granularity "${interval}". Choose from: 5m, 1h, 6h, 24h.`);
    process.exit(1);
}

pollGranularity(interval);
